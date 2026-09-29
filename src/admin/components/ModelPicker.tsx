import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleSlash,
  KeyRound,
  PenLine,
  Power,
  RefreshCw,
  Sparkles,
  Tag,
} from "lucide-react";
import type { AiModelOption, AiModelsData, AiPurpose, AiTierModel } from "../api";

/**
 * AI model choice.
 *
 * Each purpose has an explicitly selected provider; any model id that
 * provider accepts works. So this is a searchable list of what the selected
 * provider offers this account — recommended models for the purpose first,
 * models that cannot do text shown but not selectable — plus a "type your
 * own" row, rather than a closed select.
 */

const PROVIDER_NAME: Record<string, string> = { openai: "OpenAI", anthropic: "Anthropic", google: "Google Gemini" };

/** Which provider a model *name* looks like (mirrors guess_provider in router.py). Hint only. */
export function guessProvider(model: string): "anthropic" | "google" | "openai" | null {
  const m = model.trim().toLowerCase().replace(/^ft:/, "");
  if (m.startsWith("claude")) return "anthropic";
  if (/^(gemini|gemma|learnlm)/.test(m)) return "google";
  if (/^(gpt|chatgpt|chat-latest|codex)/.test(m) || /^o\d/.test(m)) return "openai";
  return null;
}

type ModelWarning ={ tone: "danger" | "warning"; text: string };

/** What an admin should know about a model for a provider before saving it. */
export function modelWarnings(
  model: string,
  provider: string,
  data: AiModelsData | undefined,
  changed = true,
): ModelWarning[] {
  const id = model.trim();
  if (!id) return [{ tone: "danger", text: "모델 이름을 입력하세요." }];
  const name = PROVIDER_NAME[provider] ?? provider;
  const guessed = guessProvider(id);
  if (guessed && guessed !== provider) {
    return [
      {
        tone: "danger",
        text: `'${id}'은(는) ${PROVIDER_NAME[guessed]} 모델 이름으로 보입니다. 제공사를 ${PROVIDER_NAME[guessed]}(으)로 바꾸거나 ${name} 모델을 고르세요.`,
      },
    ];
  }
  if (!data) return [];
  const option = data.models.find((m) => m.id === id && m.provider === provider);
  if (option && !option.compatible) {
    return [{ tone: "danger", text: `${option.incompatible_reason ?? "텍스트 생성을 지원하지 않는 모델"}이라 쓸 수 없습니다.` }];
  }
  const out: ModelWarning[] = [];
  const listing = data.providers.find((p) => p.id === provider);
  if (listing && !listing.enabled) {
    out.push({ tone: "warning", text: `${name} 연동이 꺼져 있어 이 용도는 호출되지 않고 오류로 멈춥니다. ${name} 항목에서 켜세요.` });
  } else if (listing && !listing.key_configured) {
    out.push({ tone: "warning", text: `${name} API 키가 없어 이 용도는 호출되지 않고 오류로 멈춥니다. ${name} 항목에서 키를 입력하세요.` });
  }
  const providerModels = data.models.filter((m) => m.provider === provider);
  if (listing?.listing === "live" && !isListed(id, providerModels)) {
    out.push({
      tone: "warning",
      text: `이 계정의 ${name} 모델 목록에 없는 이름입니다. 오타가 없는지 확인하세요. 목록에 아직 없는 새 모델이라면 그대로 저장해도 됩니다.`,
    });
  } else if (changed && !option && listing && listing.listing !== "live") {
    out.push({
      tone: "warning",
      text: `${name} 모델 목록을 불러올 수 없어 이 이름이 맞는지 확인하지 못했습니다. 저장한 뒤 '연결 테스트'로 확인하세요.`,
    });
  }
  if (option && !option.priced) {
    out.push({ tone: "warning", text: "가격표에 없는 모델이라 높게 잡은 대체 요율로 비용을 계산해 예산에 반영합니다." });
  }
  return out;
}

function isListed(id: string, models: AiModelOption[]): boolean {
  return models.some((m) => m.id === id || m.id.startsWith(`${id}-`) || id.startsWith(`${m.id}-`));
}

function matches(option: AiModelOption, query: string): boolean {
  const hay = `${option.id} ${option.display_name}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => hay.includes(token));
}

/** The model to switch to when the provider changes: the provider's best fit for the purpose. */
export function suggestedModel(provider: string, purpose: AiPurpose, data: AiModelsData | undefined): string | null {
  const options = (data?.models ?? []).filter((m) => m.provider === provider && m.compatible);
  return (options.find((m) => m.recommended_for.includes(purpose)) ?? options[0])?.id ?? null;
}

type Row = { kind: "option"; option: AiModelOption } | { kind: "custom"; value: string };

const PURPOSE_LABEL: Record<AiPurpose, string> = { generation: "생성용 추천", reasoning: "추론용 추천" };

export function ModelPicker({
  inputId,
  hintId,
  value,
  savedValue,
  provider,
  purpose,
  data,
  loading,
  disabled,
  label,
  onChange,
}: {
  inputId: string;
  hintId: string;
  value: string;
  savedValue: string;
  provider: string;
  purpose: AiPurpose;
  data: AiModelsData | undefined;
  loading: boolean;
  disabled: boolean;
  label: string;
  onChange: (next: string) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  // What the admin is typing to search. `null` = not searching.
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(-1);
  const [showIncompatible, setShowIncompatible] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listing = data?.providers.find((p) => p.id === provider);
  const providerName = PROVIDER_NAME[provider] ?? provider;

  const { usable, incompatible } = useMemo(() => {
    const all = (data?.models ?? []).filter((m) => m.provider === provider && (!query || matches(m, query)));
    const fits = (m: AiModelOption) => (m.recommended_for.includes(purpose) ? 0 : 1);
    return {
      usable: all.filter((m) => m.compatible).sort((a, b) => fits(a) - fits(b)),
      incompatible: all.filter((m) => !m.compatible),
    };
  }, [data, provider, purpose, query]);

  // Only selectable rows take part in keyboard navigation.
  const rows: Row[] = useMemo(() => {
    const out: Row[] = usable.map((option) => ({ kind: "option", option }));
    const typed = (query ?? "").trim();
    if (typed && !usable.some((o) => o.id === typed)) out.push({ kind: "custom", value: typed });
    return out;
  }, [usable, query]);

  // Typing highlights the best match so Enter takes it; an untouched list has
  // nothing highlighted, so Enter there never picks a model by accident.
  useEffect(() => setActive(query ? 0 : -1), [query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-row="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [active, open]);

  const close = () => {
    setOpen(false);
    setQuery(null);
    setShowIncompatible(false);
  };
  const openList = () => {
    setOpen(true);
    setQuery((q) => q ?? "");
  };
  const choose = (next: string) => {
    onChange(next.trim());
    close();
  };
  const pick = (row: Row | undefined) => row && choose(row.kind === "option" ? row.option.id : row.value);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) openList();
      else setActive((a) => Math.min(a + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (!open) return; // let the form save
      e.preventDefault();
      if (rows[active]) pick(rows[active]);
      else close();
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        close();
      }
    } else if (e.key === "Tab") {
      if (open && query?.trim() && rows[active]) pick(rows[active]);
      else close();
    }
  };

  const shown = open ? (query ?? "") : value;
  return (
    <div className="hgadm-model" ref={wrapRef}>
      <div className={`hgadm-model__control ${open ? "is-open" : ""}`}>
        <input
          id={inputId}
          className="hgadm-input hgadm-model__input"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && rows[active] ? `${listId}-${active}` : undefined}
          aria-describedby={hintId}
          value={shown}
          placeholder={open && value ? `${value} · ${providerName} 모델 검색 또는 새 이름` : `${providerName} 모델 검색 또는 이름 입력`}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          onFocus={openList}
          onClick={openList}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className="hgadm-model__toggle"
          tabIndex={-1}
          aria-label={open ? `${label} 목록 닫기` : `${label} 목록 열기`}
          disabled={disabled}
          onClick={() => (open ? close() : openList())}
        >
          <ChevronDown size={16} strokeWidth={2} aria-hidden />
        </button>
      </div>
      {open && (
        <ul id={listId} ref={listRef} className="hgadm-model__list" role="listbox" aria-label={`${label} 후보`}>
          <li role="presentation" className="hgadm-model__group">
            {providerName}
            {listing?.listing === "live" ? (
              <span className="hgadm-model__group-note">
                <Check size={12} strokeWidth={2.5} aria-hidden /> 이 계정에서 쓸 수 있는 모델
              </span>
            ) : (
              <span className="hgadm-model__group-note">추천 목록 · {listing?.message || "실시간 목록이 아닙니다"}</span>
            )}
          </li>
          {loading && <li className="hgadm-model__note">모델 목록을 불러오는 중…</li>}
          {!loading && rows.length === 0 && incompatible.length === 0 && (
            <li className="hgadm-model__note">
              {query ? "검색어와 맞는 모델이 없습니다. 이름을 끝까지 입력하면 직접 쓸 수 있습니다." : listing?.message || "표시할 모델이 없습니다."}
            </li>
          )}
          {rows.map((row, i) =>
            row.kind === "option" ? (
              <li
                key={row.option.id}
                id={`${listId}-${i}`}
                data-row={i}
                role="option"
                aria-selected={row.option.id === value}
                className={`hgadm-model__option ${i === active ? "is-active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(row.option.id);
                }}
              >
                <span className="hgadm-model__check" aria-hidden>
                  {row.option.id === value && <Check size={14} strokeWidth={2.5} />}
                </span>
                <span className="hgadm-model__option-main">
                  <span className="hgadm-model__id">{row.option.id}</span>
                  {row.option.display_name !== row.option.id && <span className="hgadm-model__name">{row.option.display_name}</span>}
                </span>
                <span className="hgadm-model__badges">
                  {row.option.id === savedValue && <span className="hgadm-model__badge hgadm-model__badge--current">현재</span>}
                  {row.option.recommended_for.includes(purpose) && (
                    <span className="hgadm-model__badge hgadm-model__badge--fit">{PURPOSE_LABEL[purpose]}</span>
                  )}
                  {!row.option.priced && <span className="hgadm-model__badge hgadm-model__badge--warn">가격 미확인</span>}
                </span>
              </li>
            ) : (
              <li
                key="custom"
                id={`${listId}-${i}`}
                data-row={i}
                role="option"
                aria-selected={false}
                className={`hgadm-model__option hgadm-model__option--custom ${i === active ? "is-active" : ""}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(row.value);
                }}
              >
                <span className="hgadm-model__check" aria-hidden>
                  <PenLine size={14} strokeWidth={2} />
                </span>
                <span className="hgadm-model__option-main">
                  <span>
                    <span className="hgadm-model__id">{row.value}</span> 직접 입력해 사용
                  </span>
                  <span className="hgadm-model__name">목록에 없어도 {providerName}가 지원하는 이름이면 쓸 수 있습니다.</span>
                </span>
              </li>
            ),
          )}
          {incompatible.length > 0 && (
            <li role="presentation" className="hgadm-model__incompatible">
              <button
                type="button"
                className="hgadm-model__incompatible-toggle"
                aria-expanded={showIncompatible}
                onMouseDown={(e) => {
                  e.preventDefault();
                  setShowIncompatible((s) => !s);
                }}
              >
                텍스트 생성에 쓸 수 없는 모델 {incompatible.length}개 {showIncompatible ? "숨기기" : "보기"}
              </button>
              {showIncompatible && (
                <ul role="presentation" className="hgadm-model__rows">
                  {incompatible.map((m) => (
                    <li key={m.id} role="option" aria-disabled="true" aria-selected={false} className="hgadm-model__option is-disabled">
                      <span className="hgadm-model__check" aria-hidden>
                        <CircleSlash size={13} strokeWidth={2} />
                      </span>
                      <span className="hgadm-model__option-main">
                        <span className="hgadm-model__id">{m.id}</span>
                        <span className="hgadm-model__name">{m.incompatible_reason}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Segmented choice of provider for one purpose, showing each provider's state. */
export function ProviderChoice({
  inputId,
  label,
  value,
  data,
  disabled,
  onChange,
}: {
  inputId: string;
  label: string;
  value: string;
  data: AiModelsData | undefined;
  disabled: boolean;
  onChange: (next: string) => void;
}) {
  const options = ["openai", "anthropic", "google"];
  return (
    <div className="hgadm-provider" role="radiogroup" aria-label={label} id={inputId}>
      {options.map((id) => {
        const p = data?.providers.find((x) => x.id === id);
        const state = !p ? "" : !p.enabled ? "꺼짐" : !p.key_configured ? "키 없음" : "사용 가능";
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            disabled={disabled}
            className={`hgadm-provider__option ${value === id ? "is-selected" : ""} ${p && (!p.enabled || !p.key_configured) ? "is-unready" : ""}`}
            onClick={() => value !== id && onChange(id)}
          >
            <span className="hgadm-provider__name">{PROVIDER_NAME[id]}</span>
            {state && <span className="hgadm-provider__state">{state}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** "현재 사용 중인 모델": the saved provider and model per purpose and whether they will work. */
export function ModelOverview({
  data,
  loading,
  error,
  aiEnabled,
  refreshing,
  onRefresh,
}: {
  data: AiModelsData | undefined;
  loading: boolean;
  error: string | null;
  aiEnabled: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <section className="hgadm-models" aria-label="현재 사용 중인 모델">
      <div className="hgadm-models__head">
        <h3>
          <Sparkles size={15} strokeWidth={2} aria-hidden /> 현재 사용 중인 모델
        </h3>
        <button type="button" className="hgadm-cfg__textbtn" onClick={onRefresh} disabled={refreshing || loading}>
          <RefreshCw size={13} strokeWidth={2} aria-hidden className={refreshing ? "hgadm-models__spin" : ""} /> 모델 목록 새로고침
        </button>
      </div>
      {!aiEnabled && <p className="hgadm-models__off">AI가 꺼져 있어 지금은 아래 모델 대신 미리 준비된 모의 응답을 씁니다.</p>}
      {loading ? (
        <p className="hgadm-models__muted">불러오는 중…</p>
      ) : error ? (
        <p className="hgadm-models__muted">모델 정보를 불러오지 못했습니다: {error}</p>
      ) : (
        <div className="hgadm-models__tiers">{data?.tiers.map((tier) => <TierCard key={tier.key} tier={tier} />)}</div>
      )}
    </section>
  );
}

function TierCard({ tier }: { tier: AiTierModel }) {
  const checks: { ok: boolean | null; text: string; icon?: "key" | "power" | "tag" }[] = [
    tier.problem
      ? { ok: false, text: tier.problem }
      : { ok: true, text: `${tier.provider_name} 모델로 확인` },
    !tier.provider_enabled
      ? { ok: false, text: `${tier.provider_name} 연동 꺼짐 · 호출 안 됨`, icon: "power" }
      : tier.key_configured
        ? { ok: true, text: `${tier.provider_name} 키 있음`, icon: "key" }
        : { ok: false, text: `${tier.provider_name} 키 없음 · 호출 안 됨`, icon: "key" },
    tier.listed === null
      ? { ok: null, text: "이 계정의 모델 목록 확인 안 됨" }
      : { ok: tier.listed, text: tier.listed ? "이 계정의 모델 목록에서 확인됨" : "이 계정의 모델 목록에 없음" },
    { ok: tier.priced ? true : null, text: tier.rate, icon: "tag" },
  ];
  const healthy = checks.every((c) => c.ok !== false);
  return (
    <div className={`hgadm-models__tier ${healthy ? "" : "has-issue"}`}>
      <div className="hgadm-models__tier-label">
        <strong>{tier.label}</strong>
        <span>{tier.purpose}</span>
      </div>
      <div className="hgadm-models__model">
        <span className="hgadm-models__provider-chip">{tier.provider_name}</span>
        <span className="hgadm-models__id">{tier.model}</span>
      </div>
      <ul className="hgadm-models__checks">
        {checks.map((c) => (
          <li key={c.text} className={c.ok === null ? "is-unknown" : c.ok ? "is-ok" : "is-bad"}>
            {c.icon === "tag" ? (
              <Tag size={13} strokeWidth={2} aria-hidden />
            ) : c.ok === null ? (
              <CircleSlash size={13} strokeWidth={2} aria-hidden />
            ) : c.ok ? (
              c.icon === "key" ? <KeyRound size={13} strokeWidth={2} aria-hidden /> : <Check size={13} strokeWidth={2.5} aria-hidden />
            ) : c.icon === "power" ? (
              <Power size={13} strokeWidth={2} aria-hidden />
            ) : (
              <AlertTriangle size={13} strokeWidth={2} aria-hidden />
            )}
            {c.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

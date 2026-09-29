import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { AlertTriangle, Check, ChevronDown, CircleSlash, KeyRound, PenLine, RefreshCw, Sparkles } from "lucide-react";
import type { AiModelOption, AiModelProvider, AiModelsData, AiTierModel } from "../api";

/**
 * Model choice for the AI settings.
 *
 * The backend accepts any model id its providers serve (the provider is read
 * from the id's prefix), so this is a searchable list of what the providers
 * currently offer — with a "type your own" row — rather than a closed select
 * that would lock out a model released after the list was fetched.
 */

/** Mirrors `provider_for_model` in src/common/llm/router.py. */
export function providerForModel(model: string): "anthropic" | "google" | "openai" {
  const m = model.trim().toLowerCase();
  if (m.startsWith("claude")) return "anthropic";
  if (/^(gpt|o1|o3|o4|chatgpt)/.test(m)) return "openai";
  return "google";
}

const PROVIDER_NAME: Record<string, string> = { anthropic: "Anthropic", google: "Google Gemini", openai: "OpenAI" };

export type ModelWarning = { tone: "danger" | "warning"; text: string };

/** What an admin should know about a model id before saving it. */
export function modelWarnings(model: string, data: AiModelsData | undefined, changed = true): ModelWarning[] {
  const id = model.trim();
  if (!id) return [{ tone: "danger", text: "모델 이름을 입력하세요." }];
  const provider = providerForModel(id);
  const name = PROVIDER_NAME[provider];
  if (provider === "openai") return [{ tone: "danger", text: "OpenAI 모델은 아직 연동되어 있지 않아 쓸 수 없습니다." }];
  if (!data) return [];
  const out: ModelWarning[] = [];
  const listing = data.providers.find((p) => p.id === provider);
  if (listing && !listing.key_configured) {
    out.push({ tone: "warning", text: `${name} API 키가 없어 이 모델로는 실제 호출이 되지 않고 모의 응답을 씁니다.` });
  }
  const option = data.models.find((m) => m.id === id);
  if (listing?.listing === "live" && !isListed(id, data.models.filter((m) => m.provider === provider))) {
    out.push({
      tone: "warning",
      text: `${name}의 현재 모델 목록에 없는 이름입니다. 오타가 없는지 확인하세요. 목록에 아직 없는 새 모델이라면 그대로 저장해도 됩니다.`,
    });
  }
  if (changed && !option && listing && listing.listing !== "live") {
    out.push({
      tone: "warning",
      text: `${name} 모델 목록을 불러올 수 없어 이 이름이 맞는지 확인하지 못했습니다. 저장한 뒤 '연결 테스트'로 확인하세요.`,
    });
  }
  if (option && !option.priced) {
    out.push({ tone: "warning", text: "가격 정보가 없어 비용이 0으로 기록되고, AI 예산 한도가 이 모델 사용분을 막지 못합니다." });
  }
  return out;
}

function isListed(id: string, models: AiModelOption[]): boolean {
  return models.some((m) => m.id === id || m.id.startsWith(`${id}-`) || id.startsWith(`${m.id}-`));
}

function matches(option: AiModelOption, query: string): boolean {
  const hay = `${option.id} ${option.display_name} ${option.provider_name}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => hay.includes(token));
}

type Row = { kind: "option"; option: AiModelOption } | { kind: "custom"; value: string };

export function ModelPicker({
  inputId,
  hintId,
  value,
  savedValue,
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
  data: AiModelsData | undefined;
  loading: boolean;
  disabled: boolean;
  label: string;
  onChange: (next: string) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  // What the admin is typing to search. `null` = not searching: the input
  // shows the chosen value and the list shows everything.
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const options = useMemo(() => {
    const all = data?.models ?? [];
    return query ? all.filter((m) => matches(m, query)) : all;
  }, [data, query]);

  const rows: Row[] = useMemo(() => {
    const out: Row[] = options.map((option) => ({ kind: "option", option }));
    const typed = (query ?? "").trim();
    if (typed && !options.some((o) => o.id === typed)) out.push({ kind: "custom", value: typed });
    return out;
  }, [options, query]);

  // Typing highlights the best match so Enter takes it; an untouched list has
  // nothing highlighted, so Enter there never picks a model by accident.
  useEffect(() => setActive(query ? 0 : -1), [query]);

  // Close on a press outside the picker.
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
  };
  // Opening starts a fresh search; the current model stays visible as the
  // placeholder and comes back if nothing is chosen.
  const openList = () => {
    setOpen(true);
    setQuery((q) => q ?? "");
  };
  const choose = (next: string) => {
    onChange(next.trim());
    close();
  };

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
      const row = rows[active];
      if (row) choose(row.kind === "option" ? row.option.id : row.value);
      else if (query?.trim()) choose(query);
      else close();
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        close();
      }
    } else if (e.key === "Tab") {
      const row = rows[active];
      if (open && query?.trim() && row) choose(row.kind === "option" ? row.option.id : row.value);
      else close();
    }
  };

  // Group rows by provider for display, keeping the flat index for keyboard use.
  let index = -1;
  const groups: { provider: AiModelProvider | undefined; name: string; rows: { row: Row; index: number }[] }[] = [];
  for (const row of rows) {
    index += 1;
    const pid = row.kind === "option" ? row.option.provider : "__custom";
    let group = groups.find((g) => (g.provider?.id ?? "__custom") === pid);
    if (!group) {
      const provider = data?.providers.find((p) => p.id === pid);
      group = { provider, name: provider?.name ?? "", rows: [] };
      groups.push(group);
    }
    group.rows.push({ row, index });
  }

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
          placeholder={open && value ? `${value} · 검색하거나 새 이름 입력` : "모델 검색 또는 이름 입력"}
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
          {loading && <li className="hgadm-model__note">모델 목록을 불러오는 중…</li>}
          {!loading && rows.length === 0 && <li className="hgadm-model__note">검색어와 맞는 모델이 없습니다. 이름을 끝까지 입력하면 직접 쓸 수 있습니다.</li>}
          {groups.map((group) => (
            <li key={group.provider?.id ?? "custom"} role="presentation">
              {group.provider && (
                <div className="hgadm-model__group" role="presentation">
                  {group.name}
                  {group.provider.listing === "live" ? (
                    <span className="hgadm-model__group-note">
                      <Check size={12} strokeWidth={2.5} aria-hidden /> 제공사 실시간 목록
                    </span>
                  ) : (
                    <span className="hgadm-model__group-note">추천 · {group.provider.message || "실시간 목록이 아닙니다"}</span>
                  )}
                </div>
              )}
              <ul role="presentation" className="hgadm-model__rows">
                {group.rows.map(({ row, index: i }) =>
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
                        {row.option.display_name !== row.option.id && (
                          <span className="hgadm-model__name">{row.option.display_name}</span>
                        )}
                      </span>
                      <span className="hgadm-model__badges">
                        {row.option.id === savedValue && <span className="hgadm-model__badge hgadm-model__badge--current">현재</span>}
                        {!row.option.priced && <span className="hgadm-model__badge hgadm-model__badge--warn">가격 정보 없음</span>}
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
                        <span className="hgadm-model__name">목록에 없는 모델도 제공사가 지원하는 이름이면 쓸 수 있습니다.</span>
                      </span>
                    </li>
                  ),
                )}
              </ul>
            </li>
          ))}
          {/* Providers with nothing to offer right now, and why. */}
          {!query &&
            data?.providers
              .filter((p) => !data.models.some((m) => m.provider === p.id))
              .map((p) => (
                <li key={`note-${p.id}`} className="hgadm-model__note hgadm-model__note--provider">
                  <strong>{p.name}</strong> · {p.message}
                </li>
              ))}
        </ul>
      )}
    </div>
  );
}

/** "현재 사용 중인 모델": the saved model for each purpose and whether it will work. */
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
      {!aiEnabled && (
        <p className="hgadm-models__off">AI가 꺼져 있어 지금은 아래 모델 대신 미리 준비된 모의 응답을 씁니다.</p>
      )}
      {loading ? (
        <p className="hgadm-models__muted">불러오는 중…</p>
      ) : error ? (
        <p className="hgadm-models__muted">모델 정보를 불러오지 못했습니다: {error}</p>
      ) : (
        <div className="hgadm-models__tiers">
          {data?.tiers.map((tier) => <TierCard key={tier.key} tier={tier} />)}
        </div>
      )}
    </section>
  );
}

function TierCard({ tier }: { tier: AiTierModel }) {
  const checks: { ok: boolean | null; text: string; icon?: "key" }[] = [
    tier.supported
      ? { ok: tier.key_configured, text: tier.key_configured ? `${tier.provider_name} 키 있음` : `${tier.provider_name} 키 없음 · 모의 응답`, icon: "key" }
      : { ok: false, text: `${tier.provider_name}는 아직 지원하지 않음` },
    tier.listed === null
      ? { ok: null, text: "제공사 목록 확인 안 됨" }
      : { ok: tier.listed, text: tier.listed ? "제공사 목록에서 확인됨" : "제공사 목록에 없음" },
    { ok: tier.priced, text: tier.priced ? "비용 추적됨" : "가격 정보 없음 · 예산 미반영" },
  ];
  const healthy = checks.every((c) => c.ok !== false);
  return (
    <div className={`hgadm-models__tier ${healthy ? "" : "has-issue"}`}>
      <div className="hgadm-models__tier-label">
        <strong>{tier.label}</strong>
        <span>{tier.purpose}</span>
      </div>
      <div className="hgadm-models__model">
        <span className="hgadm-models__id">{tier.model}</span>
        <span className="hgadm-models__provider">{tier.provider_name}</span>
      </div>
      <ul className="hgadm-models__checks">
        {checks.map((c) => (
          <li key={c.text} className={c.ok === null ? "is-unknown" : c.ok ? "is-ok" : "is-bad"}>
            {c.ok === null ? (
              <CircleSlash size={13} strokeWidth={2} aria-hidden />
            ) : c.ok ? (
              c.icon === "key" ? <KeyRound size={13} strokeWidth={2} aria-hidden /> : <Check size={13} strokeWidth={2.5} aria-hidden />
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

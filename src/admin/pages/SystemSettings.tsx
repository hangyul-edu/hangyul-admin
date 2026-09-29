import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  Info,
  LayoutGrid,
  PlugZap,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import {
  adminApi,
  type ConnectionTestResult,
  type AiModelsData,
  type AiPurpose,
  type IntegrationCheck,
  type IntegrationSettings,
  type SettingChange,
  type SettingField,
  type SettingsPageData,
} from "../api";
import { useAdminAuth } from "../auth";
import { ApiError, errorMessage } from "../../lib/http";
import { Button, ConfirmDialog, ErrorState, Input, LoadingState, Select, Switch, Textarea } from "../components/kit";
import {
  ModelOverview,
  ModelPicker,
  ProviderChoice,
  guessProvider,
  modelWarnings,
  suggestedModel,
} from "../components/ModelPicker";
import { formatDateTime } from "../lib/format";

const QUERY_KEY = ["admin", "system-settings"];
const MODELS_KEY = ["admin", "system-settings", "ai-models"];

type ModelsState = { data: AiModelsData | undefined; loading: boolean };

/** A pending change to one field, before it is saved. */
type Edit =
  | { kind: "value"; value: string | boolean }
  | { kind: "secret"; value: string }
  | { kind: "clear" }
  | { kind: "reset" };

type Status = IntegrationSettings["status"];

const STATUS_TEXT: Record<Status, string> = {
  active: "사용 중",
  incomplete: "설정 필요",
  off: "꺼짐",
  not_configured: "미설정",
  settings: "",
};

/** The request a set of edits turns into. Secrets go under `secret` (redacted in the audit log). */
export function toChanges(fields: SettingField[], edits: Record<string, Edit>): SettingChange[] {
  const out: SettingChange[] = [];
  for (const field of fields) {
    const edit = edits[field.key];
    if (!edit) continue;
    if (edit.kind === "clear" || edit.kind === "reset") out.push({ key: field.key, action: edit.kind });
    else if (edit.kind === "secret") out.push({ key: field.key, action: "set", secret: edit.value });
    else out.push({ key: field.key, action: "set", value: edit.value });
  }
  return out;
}

/** The same edits as unsaved values for a connection test. */
function toTrial(fields: SettingField[], edits: Record<string, Edit>) {
  const values: Record<string, unknown> = {};
  const secrets: Record<string, string> = {};
  for (const field of fields) {
    const edit = edits[field.key];
    if (edit?.kind === "secret") secrets[field.key] = edit.value;
    else if (edit?.kind === "value") values[field.key] = edit.value;
  }
  return { values, secrets };
}

function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  return (error.details as { fields?: Record<string, string> } | undefined)?.fields ?? {};
}

/** An empty secret input means "keep the saved one", so it is not a change. */
function effectiveEdits(edits: Record<string, Edit>): Record<string, Edit> {
  return Object.fromEntries(Object.entries(edits).filter(([, e]) => !(e.kind === "secret" && e.value.trim() === "")));
}

function StatusDot({ status }: { status: Status }) {
  return <span className={`hgadm-cfg__dot hgadm-cfg__dot--${status}`} aria-hidden />;
}

function StatusPill({ status, label }: { status: Status; label?: string }) {
  if (status === "settings") return null;
  return (
    <span className={`hgadm-cfg__pill hgadm-cfg__pill--${status}`}>
      <StatusDot status={status} />
      {label || STATUS_TEXT[status]}
    </span>
  );
}

/* ================================================================== */

export function SystemSettingsPage() {
  const { can } = useAdminAuth();
  const canEdit = can("settings:write");
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: adminApi.systemSettings });
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("item");
  // Unsaved edits in the open item: leaving it asks first.
  const dirtyRef = useRef(false);
  const [pendingNav, setPendingNav] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const go = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("item", id);
    else next.delete("item");
    dirtyRef.current = false;
    setParams(next);
    window.scrollTo({ top: 0 });
  };
  const requestNav = (id: string | null) => {
    if (id === selectedId) return;
    if (dirtyRef.current) setPendingNav(id);
    else go(id);
  };

  const all = useMemo(() => query.data?.groups.flatMap((g) => g.integrations) ?? [], [query.data]);
  const selected = all.find((i) => i.id === selectedId) ?? null;

  return (
    <div className="hgadm-cfg">
      <div className="hgadm-page-head">
        <div>
          <h1>연동·환경 설정</h1>
          <div className="hgadm-page-head__desc">
            외부 서비스의 키를 입력하고, 켜고 끄고, 연결을 확인합니다. 대부분 저장하는 즉시 적용됩니다.
          </div>
        </div>
      </div>

      {query.isPending ? (
        <LoadingState label="설정을 불러오는 중…" />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <>
          {query.data.restart_pending.length > 0 && (
            <div className="hgadm-cfg__restart" role="status">
              <AlertTriangle size={18} strokeWidth={2} aria-hidden />
              <div>
                <strong>서버를 다시 시작해야 적용되는 변경이 있습니다</strong>
                <span>{query.data.restart_pending.map((p) => p.label).join(", ")} — 저장은 되었고, 재시작하면 적용됩니다.</span>
              </div>
            </div>
          )}
          <div className={`hgadm-cfg__layout ${selected ? "has-selection" : ""}`}>
            <IntegrationList data={query.data} selectedId={selected?.id ?? null} onSelect={requestNav} />
            <div className="hgadm-cfg__detail">
              {selected ? (
                <IntegrationDetail
                  key={selected.id}
                  integration={selected}
                  canEdit={canEdit}
                  onBack={() => requestNav(null)}
                  onDirtyChange={(dirty) => {
                    dirtyRef.current = dirty;
                  }}
                />
              ) : (
                <Overview data={query.data} canEdit={canEdit} onSelect={requestNav} />
              )}
            </div>
          </div>
        </>
      )}

      <ConfirmDialog
        open={pendingNav !== undefined}
        title="저장하지 않은 변경이 있습니다"
        message="이동하면 입력한 내용이 사라집니다. 저장하려면 '취소'를 누른 뒤 '저장'을 누르세요."
        confirmLabel="변경 버리고 이동"
        danger
        onCancel={() => setPendingNav(undefined)}
        onConfirm={() => {
          const target = pendingNav;
          setPendingNav(undefined);
          go(target ?? null);
        }}
      />
    </div>
  );
}

/* ---------------- Left: the list ---------------- */

function IntegrationList({
  data,
  selectedId,
  onSelect,
}: {
  data: SettingsPageData;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <nav className="hgadm-cfg__list" aria-label="설정 항목">
      <button
        type="button"
        className={`hgadm-cfg__item hgadm-cfg__item--overview ${selectedId === null ? "is-active" : ""}`}
        aria-current={selectedId === null ? "page" : undefined}
        onClick={() => onSelect(null)}
      >
        <LayoutGrid size={16} strokeWidth={2} aria-hidden />
        <span className="hgadm-cfg__item-name">개요</span>
      </button>
      {data.groups.map((group) => (
        <div key={group.id} className="hgadm-cfg__list-group" role="group" aria-labelledby={`cfg-group-${group.id}`}>
          <div id={`cfg-group-${group.id}`} className="hgadm-cfg__list-label">
            {group.label}
          </div>
          {group.integrations.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`hgadm-cfg__item ${item.id === selectedId ? "is-active" : ""}`}
              aria-current={item.id === selectedId ? "page" : undefined}
              onClick={() => onSelect(item.id)}
            >
              {item.status === "settings" ? <span className="hgadm-cfg__dot hgadm-cfg__dot--settings" aria-hidden /> : <StatusDot status={item.status} />}
              <span className="hgadm-cfg__item-name">{item.name}</span>
              {item.status !== "settings" && <span className="hgadm-cfg__item-status">{item.status_label}</span>}
              {item.restart_pending.length > 0 && <span className="hgadm-cfg__item-flag">재시작</span>}
              <ChevronRight className="hgadm-cfg__item-chevron" size={16} strokeWidth={2} aria-hidden />
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}

/* ---------------- Right: overview ---------------- */

function Overview({
  data,
  canEdit,
  onSelect,
}: {
  data: SettingsPageData;
  canEdit: boolean;
  onSelect: (id: string) => void;
}) {
  const all = data.groups.flatMap((g) => g.integrations).filter((i) => i.status !== "settings");
  const count = (s: Status) => all.filter((i) => i.status === s).length;
  const needsAttention = all.filter((i) => i.status === "incomplete");
  return (
    <div className="hgadm-cfg__panel hgadm-cfg__overview">
      <h2 className="hgadm-cfg__panel-title">한눈에 보기</h2>
      <div className="hgadm-cfg__stats">
        {(["active", "incomplete", "off", "not_configured"] as Status[]).map((s) => (
          <div key={s} className={`hgadm-cfg__stat hgadm-cfg__stat--${s}`}>
            <span className="hgadm-cfg__stat-num">{count(s)}</span>
            <span className="hgadm-cfg__stat-label">
              <StatusDot status={s} /> {STATUS_TEXT[s]}
            </span>
          </div>
        ))}
      </div>
      {needsAttention.length > 0 && (
        <div className="hgadm-cfg__attention">
          <strong>확인이 필요한 연동</strong>
          {needsAttention.map((i) => (
            <button key={i.id} type="button" className="hgadm-cfg__link" onClick={() => onSelect(i.id)}>
              {i.name} — 켜져 있지만 필수 값이 비어 있습니다 <ChevronRight size={14} aria-hidden />
            </button>
          ))}
        </div>
      )}
      <p className="hgadm-cfg__hint-line">
        <span className="hgadm-cfg__only-wide">왼쪽 목록</span>
        <span className="hgadm-cfg__only-narrow">위 목록</span>에서 항목을 고르면 키를 입력하고 연결을 테스트할 수 있습니다.
        {!canEdit && " 현재 계정은 조회만 할 수 있습니다 (settings:write 필요)."}
      </p>

      <h3 className="hgadm-cfg__subhead">알아 두기</h3>
      <ul className="hgadm-cfg__facts-list">
        <li>
          <strong>우선순위</strong> — 이 화면에서 저장한 값이 서버의 .env보다 우선하고, 둘 다 없으면 기본값을 씁니다.
        </li>
        <li>
          <strong>비밀 값</strong> — API 키와 토큰은 암호화해 저장하고 끝 네 자리만 보여 줍니다. 입력칸을 비워 두면 기존 값이
          그대로 유지됩니다.
        </li>
        <li>
          <strong>켜기/끄기</strong> — 꺼도 입력한 키는 지워지지 않습니다. 끄면 모의 동작이나 대체 수단으로 바뀝니다.
        </li>
        <li>
          <ShieldCheck size={14} strokeWidth={2} aria-hidden />{" "}
          {data.encryption_key_source === "env"
            ? "암호화 키: 서버의 SETTINGS_ENCRYPTION_KEY를 사용합니다."
            : "암호화 키가 JWT_SECRET에서 만들어집니다. 운영 서버에서는 SETTINGS_ENCRYPTION_KEY를 따로 설정하세요 (JWT_SECRET을 바꾸면 비밀 값을 다시 입력해야 합니다)."}
        </li>
      </ul>

      <h3 className="hgadm-cfg__subhead">서버 정보 (여기서 바꿀 수 없음)</h3>
      <dl className="hgadm-cfg__facts">
        <dt>실행 환경</dt>
        <dd>{data.environment.app_env}</dd>
        <dt>데이터베이스</dt>
        <dd className="hgadm-cell-mono">{data.environment.database}</dd>
      </dl>
      <p className="hgadm-cfg__muted-small">
        데이터베이스 주소, JWT_SECRET, SETTINGS_ENCRYPTION_KEY는 서버 환경 변수로만 바꿀 수 있습니다. AI 기능별 켜기/끄기와 예산은
        &lsquo;AI 운영·튜터 품질&rsquo;, 학습 알림 시각은 &lsquo;알림 설정&rsquo;에서 관리합니다.
      </p>
    </div>
  );
}

/* ---------------- Right: one integration ---------------- */

type Outcome = { tone: "success" | "warning" | "danger"; text: string; at: Date };

function IntegrationDetail({
  integration,
  canEdit,
  onBack,
  onDirtyChange,
}: {
  integration: IntegrationSettings;
  canEdit: boolean;
  onBack: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const qc = useQueryClient();
  const isAi = integration.id === "ai";
  // A payment method without credentials is refused, not faked (outside local dev).
  const isPayment = integration.group === "payments";
  // The AI card also shows the models configured now and what can be chosen.
  const models = useQuery({ queryKey: MODELS_KEY, queryFn: () => adminApi.aiModels(), enabled: isAi, staleTime: 60_000 });
  const refreshModels = useMutation({
    mutationFn: () => adminApi.aiModels(true),
    onSuccess: (data) => qc.setQueryData(MODELS_KEY, data),
  });
  const modelsState: ModelsState = { data: models.data, loading: models.isPending };
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [testResult, setTestResult] = useState<(ConnectionTestResult & { at: Date }) | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const changes = effectiveEdits(edits);
  const changeCount = Object.keys(changes).length;
  const dirty = changeCount > 0;

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const replace = (next: IntegrationSettings) => {
    qc.setQueryData<SettingsPageData>(QUERY_KEY, (page) =>
      page
        ? {
            ...page,
            groups: page.groups.map((g) => ({
              ...g,
              integrations: g.integrations.map((i) => (i.id === next.id ? next : i)),
            })),
          }
        : page,
    );
    // The page-wide restart notice may have changed too. MODELS_KEY sits under
    // QUERY_KEY, so this also refetches the AI model summary — which is what
    // keeps it current after a provider's key is saved on that provider's own
    // card.
    void qc.invalidateQueries({ queryKey: QUERY_KEY });
  };

  const save = useMutation({
    mutationFn: (enabled?: boolean) =>
      adminApi.saveIntegration(integration.id, {
        changes: toChanges(integration.fields, changes),
        ...(enabled === undefined ? {} : { enabled }),
      }),
    onSuccess: (result) => {
      const restart = Object.values(result.applied).includes("restart");
      setEdits({});
      setErrors({});
      // A result from before the save described unsaved values.
      setTestResult(null);
      // Shown in the sticky save bar, right where the admin pressed 저장 (a
      // toast would cover that bar and repeat it).
      setOutcome({ tone: restart ? "warning" : "success", text: result.message, at: new Date() });
      replace(result.integration);
    },
    onError: (error) => {
      setErrors(fieldErrors(error));
      setOutcome({ tone: "danger", text: `저장하지 못했습니다. ${errorMessage(error)}`, at: new Date() });
    },
  });

  const test = useMutation({
    mutationFn: () => adminApi.testIntegration(integration.id, toTrial(integration.fields, changes)),
    onSuccess: (result) => {
      setTestResult({ ...result, at: new Date() });
      setErrors({});
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (error) => {
      setErrors(fieldErrors(error));
      setTestResult({ ok: false, message: errorMessage(error), latency_ms: 0, details: [], used_unsaved_values: dirty, at: new Date() });
    },
  });

  const setEdit = (key: string, edit: Edit | null) => {
    setOutcome(null);
    setErrors((e) => {
      const rest = { ...e };
      delete rest[key];
      return rest;
    });
    setEdits((current) => {
      const next = { ...current };
      if (edit === null) delete next[key];
      else next[key] = edit;
      return next;
    });
  };

  // The value a field has in the form: its pending edit, else the saved one.
  const valueOf = (key: string): string => {
    const edit = edits[key];
    if (edit?.kind === "value") return String(edit.value);
    return String(integration.fields.find((f) => f.key === key)?.value ?? "");
  };

  // Changing a purpose's provider also moves its model to that provider's
  // best fit, so the pair never ends up mismatched (the admin can still pick
  // another model).
  const setProvider = (providerKey: string, next: string) => {
    const saved = String(integration.fields.find((f) => f.key === providerKey)?.value ?? "");
    setEdit(providerKey, next === saved ? null : { kind: "value", value: next });
    const modelKey = providerKey.replace(/_provider$/, "_model");
    const purpose: AiPurpose = modelKey.includes("generation") ? "generation" : "reasoning";
    const current = valueOf(modelKey);
    const fits = (current && guessProvider(current) === next) || (models.data?.models ?? []).some((m) => m.provider === next && m.id === current && m.compatible);
    if (!fits) {
      const suggestion = suggestedModel(next, purpose, models.data);
      const savedModel = String(integration.fields.find((f) => f.key === modelKey)?.value ?? "");
      if (suggestion) setEdit(modelKey, suggestion === savedModel ? null : { kind: "value", value: suggestion });
    }
  };

  const discard = () => {
    setEdits({});
    setErrors({});
    setOutcome(null);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (canEdit && dirty && !save.isPending) save.mutate(undefined);
  };

  const toggle = integration.toggle;
  const busy = save.isPending || test.isPending;
  const errorCount = Object.keys(errors).length;

  return (
    <form className="hgadm-cfg__panel hgadm-cfg__form" onSubmit={submit} aria-labelledby="cfg-detail-title" noValidate>
      <button type="button" className="hgadm-cfg__back" onClick={onBack}>
        <ArrowLeft size={16} strokeWidth={2} aria-hidden /> 목록
      </button>

      <header className="hgadm-cfg__head">
        <div className="hgadm-cfg__head-main">
          <div className="hgadm-cfg__head-title">
            <h2 id="cfg-detail-title">{integration.name}</h2>
            <StatusPill status={integration.status} label={integration.status_label} />
          </div>
          <p className="hgadm-cfg__desc">{integration.description}</p>
        </div>
        {toggle && (
          <label className="hgadm-cfg__toggle">
            <Switch
              checked={toggle.enabled}
              disabled={!canEdit || busy}
              label={`${integration.name} 사용`}
              onChange={(next) => (next ? save.mutate(true) : setConfirmOff(true))}
            />
            <span>{toggle.enabled ? "켜짐" : "꺼짐"}</span>
          </label>
        )}
      </header>

      {integration.status === "incomplete" && (
        <p className="hgadm-cfg__notice hgadm-cfg__notice--warning">
          <AlertTriangle size={15} strokeWidth={2} aria-hidden />{" "}
          {integration.id === "ai"
            ? "AI가 켜져 있지만 아래 '현재 사용 중인 모델'의 문제 때문에 해당 용도의 AI 호출은 오류로 멈춥니다."
            : integration.group === "ai"
              ? "켜져 있지만 API 키가 없어, 이 제공사를 고른 용도의 AI 호출은 오류로 멈춥니다. 키를 입력하세요."
              : isPayment
                ? "켜져 있지만 필수 값이 비어 있어 운영 서버에서는 이 결제 수단의 등록과 결제를 모두 거부합니다."
                : "켜져 있지만 필수 값이 비어 있어 실제 서비스 대신 대체 동작 중입니다."}
        </p>
      )}
      {!canEdit && (
        <p className="hgadm-cfg__notice">
          <Info size={15} strokeWidth={2} aria-hidden /> 조회 전용입니다. 값을 바꾸거나 연결을 테스트하려면 최고 관리자 권한(settings:write)이
          필요합니다.
        </p>
      )}

      {isAi && (
        <ModelOverview
          data={models.data}
          loading={models.isPending}
          error={
            refreshModels.isError
              ? errorMessage(refreshModels.error)
              : models.isError
                ? errorMessage(models.error)
                : null
          }
          aiEnabled={!!integration.toggle?.enabled}
          refreshing={refreshModels.isPending}
          onRefresh={() => refreshModels.mutate()}
        />
      )}

      {integration.testable && (
        <ConnectionBox
          last={integration.last_check}
          result={testResult}
          canTest={canEdit}
          dirty={dirty}
          loading={test.isPending}
          disabled={save.isPending}
          onTest={() => test.mutate()}
        />
      )}

      <div className="hgadm-cfg__fields">
        {integration.fields.map((field) => (
          <FieldRow
            key={field.key}
            field={field}
            edit={edits[field.key]}
            error={errors[field.key]}
            disabled={!canEdit || busy}
            restartPending={integration.restart_pending.includes(field.key)}
            models={modelsState}
            provider={field.kind === "model" ? valueOf(field.key.replace(/_model$/, "_provider")) : ""}
            onProvider={(next) => setProvider(field.key, next)}
            onEdit={(edit) => setEdit(field.key, edit)}
          />
        ))}
      </div>

      {integration.note && (
        <p className="hgadm-cfg__muted-small">
          <Info size={13} strokeWidth={2} aria-hidden /> {integration.note}
        </p>
      )}

      {canEdit && (
        <div
          className={`hgadm-cfg__bar ${dirty && outcome?.tone !== "danger" ? "is-dirty" : ""} ${outcome ? `is-${outcome.tone}` : ""}`}
          aria-live="polite"
        >
          <div className="hgadm-cfg__bar-status">
            {dirty && outcome?.tone !== "danger" ? (
              <>
                <span className="hgadm-cfg__bar-dot" aria-hidden />
                저장하지 않은 변경 {changeCount}개
                {toggle && <span className="hgadm-cfg__bar-sub"> · 스위치를 누르면 함께 저장됩니다</span>}
              </>
            ) : outcome ? (
              <span role="status" className="hgadm-cfg__bar-outcome">
                {outcome.tone === "danger" ? (
                  <XCircle size={16} strokeWidth={2} aria-hidden />
                ) : outcome.tone === "warning" ? (
                  <AlertTriangle size={16} strokeWidth={2} aria-hidden />
                ) : (
                  <CheckCircle2 size={16} strokeWidth={2} aria-hidden />
                )}
                {outcome.text}
                {errorCount > 0 && ` (${errorCount}개 항목 확인)`}
                <span className="hgadm-cfg__bar-time">
                  {outcome.at.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" })}
                </span>
              </span>
            ) : (
              <span className="hgadm-cfg__bar-idle">변경 사항 없음</span>
            )}
          </div>
          <div className="hgadm-cfg__bar-actions">
            {dirty && (
              <Button type="button" variant="ghost" disabled={busy} onClick={discard}>
                취소
              </Button>
            )}
            <Button type="submit" variant="primary" disabled={!dirty} loading={save.isPending}>
              저장
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOff}
        title={`${integration.name}을(를) 끌까요?`}
        message={
          isPayment
            ? "끄면 바로 이 결제 수단의 새 등록과 결제가 거부되고, 이 수단으로 구독 중인 회원의 갱신 결제도 실패합니다. 입력해 둔 키는 지워지지 않으니 다시 켜면 그대로 씁니다."
            : "끄면 바로 대체 동작(모의 응답·기록만 남김 등)으로 바뀝니다. 입력해 둔 키와 값은 지워지지 않으니 다시 켜면 그대로 씁니다."
        }
        confirmLabel="끄기"
        danger
        loading={save.isPending}
        onCancel={() => setConfirmOff(false)}
        onConfirm={() => save.mutate(false, { onSettled: () => setConfirmOff(false) })}
      />
    </form>
  );
}

function ConnectionBox({
  last,
  result,
  canTest,
  dirty,
  loading,
  disabled,
  onTest,
}: {
  last: IntegrationCheck | null;
  result: (ConnectionTestResult & { at: Date }) | null;
  canTest: boolean;
  dirty: boolean;
  loading: boolean;
  disabled: boolean;
  onTest: () => void;
}) {
  const shown = result
    ? { ok: result.ok, message: result.message, latency: result.latency_ms, at: result.at.toISOString(), unsaved: result.used_unsaved_values, details: result.details, by: null as string | null }
    : last
      ? { ok: last.ok, message: last.message, latency: last.latency_ms ?? 0, at: last.checked_at, unsaved: last.used_unsaved_values, details: last.details ?? [], by: last.checked_by }
      : null;
  // A stored result from values that were never saved says nothing about the
  // saved configuration, so it is shown neutrally rather than red or green.
  const aboutUnsaved = !result && !!shown?.unsaved;
  const tone = !shown || aboutUnsaved ? "" : shown.ok ? "is-ok" : "is-fail";
  const title = !shown
    ? ""
    : result
      ? shown.ok
        ? "연결 성공"
        : "연결 실패"
      : aboutUnsaved
        ? `마지막 테스트 (저장하지 않은 값): ${shown.ok ? "성공" : "실패"}`
        : `마지막 테스트: ${shown.ok ? "성공" : "실패"}`;
  return (
    <section className={`hgadm-cfg__conn ${tone}`} aria-label="연결 확인">
      <div className="hgadm-cfg__conn-body">
        {shown ? (
          <>
            <div className="hgadm-cfg__conn-title">
              {aboutUnsaved ? (
                <Info size={16} strokeWidth={2} aria-hidden />
              ) : shown.ok ? (
                <CheckCircle2 size={16} strokeWidth={2} aria-hidden />
              ) : (
                <XCircle size={16} strokeWidth={2} aria-hidden />
              )}
              {title}
            </div>
            {shown.details.length > 0 ? (
              <ul className="hgadm-cfg__conn-details">
                {shown.details.map((d) => (
                  <li key={d.provider}>
                    {d.ok ? "✓" : "✕"} {d.provider}: {d.message}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="hgadm-cfg__conn-msg">{shown.message}</div>
            )}
            <div className="hgadm-cfg__conn-meta">
              {formatDateTime(shown.at)}
              {shown.latency > 0 && ` · ${shown.latency}ms`}
              {shown.by && ` · ${shown.by}`}
              {shown.unsaved && " · 저장 전 값으로 테스트"}
            </div>
          </>
        ) : (
          <>
            <div className="hgadm-cfg__conn-title">
              <PlugZap size={16} strokeWidth={2} aria-hidden /> 연결 테스트
            </div>
            <div className="hgadm-cfg__conn-msg">
              아직 테스트하지 않았습니다. 실제 서비스에 읽기 전용 요청을 한 번 보내 키가 맞는지 확인합니다 (메일·문자·푸시는 보내지
              않고, 결제도 일어나지 않습니다).
            </div>
          </>
        )}
      </div>
      {canTest && (
        <Button type="button" variant="secondary" loading={loading} disabled={disabled} onClick={onTest}>
          <PlugZap size={15} strokeWidth={2} aria-hidden />
          {dirty ? "입력한 값으로 테스트" : shown ? "다시 테스트" : "연결 테스트"}
        </Button>
      )}
    </section>
  );
}

/* ---------------- Fields ---------------- */

function SourceTag({ field, restartPending }: { field: SettingField; restartPending: boolean }) {
  const tags: ReactNode[] = [];
  if (field.cleared) tags.push(<span key="c" className="hgadm-cfg__tag hgadm-cfg__tag--danger" title="이 화면에서 비워 두어 .env 값도 쓰지 않습니다.">비워 둠</span>);
  else if (field.source === "admin") tags.push(<span key="a" className="hgadm-cfg__tag hgadm-cfg__tag--brand" title="이 화면에서 저장한 값입니다. .env보다 우선합니다.">직접 저장</span>);
  else if (field.source === "unreadable")
    tags.push(<span key="u" className="hgadm-cfg__tag hgadm-cfg__tag--danger" title="저장된 값을 복호화하지 못했습니다(암호화 키 변경). .env 값을 대신 씁니다. 다시 입력하세요.">다시 입력 필요</span>);
  else if (field.source === "env") tags.push(<span key="e" className="hgadm-cfg__tag" title="서버의 .env 파일 또는 환경 변수에서 온 값입니다.">.env</span>);
  else tags.push(<span key="d" className="hgadm-cfg__tag" title="따로 설정하지 않아 기본값을 씁니다.">기본값</span>);
  if (field.restart_required)
    tags.push(
      <span key="r" className={`hgadm-cfg__tag hgadm-cfg__tag--restart ${restartPending ? "is-pending" : ""}`} title="저장해도 서버를 다시 시작해야 적용됩니다.">
        {restartPending ? "재시작 대기 중" : "재시작 후 적용"}
      </span>,
    );
  return <>{tags}</>;
}

function FieldRow({
  field,
  edit,
  error,
  disabled,
  restartPending,
  models,
  provider,
  onProvider,
  onEdit,
}: {
  field: SettingField;
  edit: Edit | undefined;
  error?: string;
  disabled: boolean;
  restartPending: boolean;
  models: ModelsState;
  /** For a model field: the provider selected for its purpose (pending or saved). */
  provider: string;
  /** For a provider field: change it (and move the model along). */
  onProvider: (next: string) => void;
  onEdit: (edit: Edit | null) => void;
}) {
  const inputId = `setting-${field.key.replace(/[^a-z0-9]/gi, "-")}`;
  const hintId = `${inputId}-hint`;
  const secret = field.kind === "secret" || field.kind === "multiline_secret";
  const changed = !!edit && !(edit.kind === "secret" && edit.value.trim() === "");
  const saved = String(field.value ?? "");
  const current = edit?.kind === "value" ? String(edit.value) : saved;
  const purpose: AiPurpose = field.key.includes("generation") ? "generation" : "reasoning";
  // Warnings follow the name being chosen; the saved one is summarised above.
  const warnings =
    field.kind === "model" && edit?.kind !== "reset" ? modelWarnings(current, provider, models.data, current !== saved) : [];
  return (
    <div className={`hgadm-cfg__field ${changed ? "is-changed" : ""} ${error ? "has-error" : ""}`}>
      <div className="hgadm-cfg__field-label">
        <label htmlFor={inputId}>
          {field.label}
          {field.required && (
            <span className="hgadm-cfg__req" aria-hidden>
              *
            </span>
          )}
        </label>
        <SourceTag field={field} restartPending={restartPending} />
        {changed && <span className="hgadm-cfg__tag hgadm-cfg__tag--changed">변경됨</span>}
      </div>
      {secret ? (
        <SecretControl field={field} inputId={inputId} hintId={hintId} edit={edit} disabled={disabled} onEdit={onEdit} />
      ) : field.kind === "provider" && edit?.kind !== "reset" ? (
        <div className="hgadm-cfg__value">
          <ProviderChoice
            inputId={inputId}
            label={field.label}
            value={current}
            data={models.data}
            disabled={disabled}
            onChange={onProvider}
          />
          {field.source === "admin" && !edit && (
            <button type="button" className="hgadm-cfg__textbtn" disabled={disabled} onClick={() => onEdit({ kind: "reset" })}>
              <RotateCcw size={12} strokeWidth={2} aria-hidden /> 기본값으로
            </button>
          )}
        </div>
      ) : field.kind === "model" && edit?.kind !== "reset" ? (
        <div className="hgadm-cfg__value">
          <ModelPicker
            inputId={inputId}
            hintId={hintId}
            value={current}
            savedValue={saved}
            provider={provider}
            purpose={purpose}
            data={models.data}
            loading={models.loading}
            disabled={disabled}
            label={field.label}
            onChange={(next) => onEdit(next === saved ? null : { kind: "value", value: next })}
          />
          {field.source === "admin" && !edit && (
            <button type="button" className="hgadm-cfg__textbtn" disabled={disabled} onClick={() => onEdit({ kind: "reset" })}>
              <RotateCcw size={12} strokeWidth={2} aria-hidden /> 기본값으로
            </button>
          )}
        </div>
      ) : (
        <ValueControl field={field} inputId={inputId} hintId={hintId} edit={edit} disabled={disabled} onEdit={onEdit} />
      )}
      {warnings.length > 0 && !error && (
        <ul className="hgadm-cfg__warnings">
          {warnings.map((w) => (
            <li key={w.text} className={`is-${w.tone}`}>
              <AlertTriangle size={13} strokeWidth={2} aria-hidden /> {w.text}
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <div className="hgadm-cfg__error" role="alert">
          {error}
        </div>
      ) : (
        <div className="hgadm-cfg__hint" id={hintId}>
          {field.help}
          <span className="hgadm-cfg__env" title="이 값을 대신하는 서버 환경 변수">
            {field.env_var}
          </span>
        </div>
      )}
    </div>
  );
}

function SecretControl({
  field,
  inputId,
  hintId,
  edit,
  disabled,
  onEdit,
}: {
  field: SettingField;
  inputId: string;
  hintId: string;
  edit: Edit | undefined;
  disabled: boolean;
  onEdit: (edit: Edit | null) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const isSet = !!field.secret?.is_set;
  const saved = isSet ? `${field.secret?.hint ?? "••••"} 저장됨` : "저장된 값 없음";

  if (edit?.kind === "clear" || edit?.kind === "reset") {
    return (
      <div className="hgadm-cfg__pending" id={inputId}>
        <span>{edit.kind === "clear" ? "저장하면 이 값을 삭제합니다" : "저장하면 .env 값으로 되돌립니다"}</span>
        <button type="button" className="hgadm-cfg__textbtn" disabled={disabled} onClick={() => onEdit(null)}>
          취소
        </button>
      </div>
    );
  }

  const value = edit?.kind === "secret" ? edit.value : "";
  const placeholder = isSet ? "비워 두면 저장된 값 유지" : field.placeholder || "값을 입력하세요";
  const change = (v: string) => onEdit(v === "" ? null : { kind: "secret", value: v });
  return (
    <div className="hgadm-cfg__secret">
      <div className="hgadm-cfg__secret-input">
        {field.kind === "multiline_secret" ? (
          <Textarea
            id={inputId}
            rows={value ? 4 : 2}
            value={value}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            aria-describedby={hintId}
            className={visible ? "" : "hgadm-cfg__masked"}
            onChange={(e) => change(e.target.value)}
          />
        ) : (
          <Input
            id={inputId}
            type={visible ? "text" : "password"}
            value={value}
            placeholder={placeholder}
            autoComplete="new-password"
            spellCheck={false}
            disabled={disabled}
            aria-describedby={hintId}
            onChange={(e) => change(e.target.value)}
          />
        )}
        <button
          type="button"
          className="hgadm-cfg__eye"
          aria-label={visible ? "입력값 숨기기" : "입력값 보기"}
          title={visible ? "입력값 숨기기" : "입력값 보기"}
          disabled={!value}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
        </button>
      </div>
      <div className="hgadm-cfg__secret-meta">
        <span className={isSet ? "hgadm-cfg__saved" : "hgadm-cfg__unset"}>{saved}</span>
        {isSet && !value && (
          <button type="button" className="hgadm-cfg__textbtn hgadm-cfg__textbtn--danger" disabled={disabled} onClick={() => setConfirmRemove(true)}>
            삭제
          </button>
        )}
        {/* An `unreadable` secret is a saved row that can no longer be
            decrypted; resetting drops it back to .env like any saved one. */}
        {(field.source === "admin" || field.source === "unreadable") && !value && (
          <button type="button" className="hgadm-cfg__textbtn" disabled={disabled} onClick={() => onEdit({ kind: "reset" })}>
            <RotateCcw size={12} strokeWidth={2} aria-hidden /> .env 값으로 되돌리기
          </button>
        )}
      </div>
      <ConfirmDialog
        open={confirmRemove}
        title={`${field.label}을(를) 삭제할까요?`}
        message=".env에 값이 있어도 쓰지 않게 됩니다. '저장'을 눌러야 실제로 삭제됩니다."
        confirmLabel="삭제 표시"
        danger
        onCancel={() => setConfirmRemove(false)}
        onConfirm={() => {
          setConfirmRemove(false);
          onEdit({ kind: "clear" });
        }}
      />
    </div>
  );
}

function ValueControl({
  field,
  inputId,
  hintId,
  edit,
  disabled,
  onEdit,
}: {
  field: SettingField;
  inputId: string;
  hintId: string;
  edit: Edit | undefined;
  disabled: boolean;
  onEdit: (edit: Edit | null) => void;
}) {
  const saved = field.value;
  const current = edit?.kind === "value" ? edit.value : saved;
  // Typing back the saved value is not a change (inputs hand numbers back as text).
  const change = (next: string | boolean) =>
    onEdit(String(next) === String(saved ?? "") ? null : { kind: "value", value: next });

  if (edit?.kind === "reset") {
    return (
      <div className="hgadm-cfg__pending" id={inputId}>
        <span>저장하면 .env·기본값으로 되돌립니다</span>
        <button type="button" className="hgadm-cfg__textbtn" onClick={() => onEdit(null)}>
          취소
        </button>
      </div>
    );
  }

  let control: ReactNode;
  if (field.kind === "bool") {
    control = (
      <label className="hgadm-cfg__bool">
        <Switch checked={Boolean(current)} disabled={disabled} label={field.label} onChange={(next) => change(next)} />
        <span>{current ? "켜짐" : "꺼짐"}</span>
      </label>
    );
  } else if (field.kind === "choice") {
    control = (
      <Select id={inputId} value={String(current ?? "")} disabled={disabled} aria-label={field.label} onChange={(e) => change(e.target.value)}>
        {field.choices.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </Select>
    );
  } else {
    const numeric = field.kind === "number" || field.kind === "integer";
    control = (
      <Input
        id={inputId}
        value={current === null || current === undefined ? "" : String(current)}
        type={field.kind === "email" ? "email" : "text"}
        inputMode={numeric ? "decimal" : field.kind === "url" ? "url" : field.kind === "email" ? "email" : undefined}
        placeholder={field.placeholder}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        aria-describedby={hintId}
        className={numeric ? "hgadm-cfg__num" : ""}
        onChange={(e) => change(e.target.value)}
      />
    );
  }
  return (
    <div className="hgadm-cfg__value">
      {control}
      {field.source === "admin" && !edit && (
        <button type="button" className="hgadm-cfg__textbtn" disabled={disabled} onClick={() => onEdit({ kind: "reset" })}>
          <RotateCcw size={12} strokeWidth={2} aria-hidden /> 기본값으로
        </button>
      )}
    </div>
  );
}

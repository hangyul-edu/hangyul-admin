import { useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  PlugZap,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import {
  adminApi,
  type ConnectionTestResult,
  type IntegrationSettings,
  type SettingChange,
  type SettingField,
  type SettingsPageData,
} from "../api";
import { useAdminAuth } from "../auth";
import { ApiError, errorMessage } from "../../lib/http";
import { useToast } from "../../hooks/toast";
import {
  Badge,
  type BadgeTone,
  Button,
  ConfirmDialog,
  ErrorState,
  Input,
  LoadingState,
  Select,
  Switch,
  Textarea,
} from "../components/kit";
import { formatDateTime } from "../lib/format";

const QUERY_KEY = ["admin", "system-settings"];

/** A pending change to one field, before it is saved. */
type Edit =
  | { kind: "value"; value: string | boolean }
  | { kind: "secret"; value: string }
  | { kind: "clear" }
  | { kind: "reset" };

const STATUS_TONE: Record<IntegrationSettings["status"], BadgeTone> = {
  active: "success",
  incomplete: "warning",
  off: "neutral",
  not_configured: "neutral",
  settings: "neutral",
};

const SOURCE_LABEL: Record<SettingField["source"], { label: string; tone: BadgeTone; title: string }> = {
  admin: { label: "이 화면에서 저장", tone: "brand", title: "관리자가 이 화면에서 저장한 값입니다. .env보다 우선합니다." },
  env: { label: ".env", tone: "neutral", title: "서버의 .env 파일 또는 환경 변수에서 온 값입니다." },
  default: { label: "기본값", tone: "neutral", title: "따로 설정하지 않아 기본값을 씁니다." },
  unreadable: {
    label: "읽을 수 없음",
    tone: "danger",
    title: "저장된 값을 복호화하지 못했습니다(암호화 키 변경). .env 값을 대신 씁니다. 다시 입력하세요.",
  },
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
  const fields = (error.details as { fields?: Record<string, string> } | undefined)?.fields;
  return fields ?? {};
}

export function SystemSettingsPage() {
  const { can } = useAdminAuth();
  const canEdit = can("settings:write");
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: adminApi.systemSettings });

  return (
    <div className="hgadm-settings">
      <div className="hgadm-page-head">
        <div>
          <h1>연동·환경 설정</h1>
          <div className="hgadm-page-head__desc">
            외부 서비스의 API 키와 토큰을 입력하고, 연동을 켜고 끄고, 연결을 바로 확인합니다. 저장한 값은
            데이터베이스에 보관되며 서버의 .env 값보다 우선합니다. 대부분 저장하는 즉시 적용됩니다.
          </div>
        </div>
      </div>

      {query.isPending ? (
        <LoadingState label="설정을 불러오는 중…" />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <SettingsBody data={query.data} canEdit={canEdit} />
      )}
    </div>
  );
}

function SettingsBody({ data, canEdit }: { data: SettingsPageData; canEdit: boolean }) {
  return (
    <>
      {data.restart_pending.length > 0 && (
        <div className="hgadm-settings__banner hgadm-settings__banner--warning" role="status">
          <AlertTriangle size={18} strokeWidth={2} aria-hidden />
          <div>
            <strong>서버를 다시 시작해야 적용되는 변경이 있습니다.</strong>
            <div>저장은 되었지만 아직 적용되지 않았습니다: {data.restart_pending.map((p) => p.label).join(", ")}</div>
          </div>
        </div>
      )}
      <div className="hgadm-settings__banner" role="note">
        <Info size={18} strokeWidth={2} aria-hidden />
        <div>
          <strong>값을 고르는 순서:</strong> 이 화면에서 저장한 값 → 서버의 .env → 기본값. 비밀 값(API 키, 토큰)은
          암호화해 저장하고 화면에는 끝 네 자리만 보여 줍니다. 비워 두고 저장하면 기존 값이 그대로 유지됩니다.
          {data.encryption_key_source === "derived" && (
            <div className="hgadm-settings__sub">
              <ShieldCheck size={14} strokeWidth={2} aria-hidden /> 암호화 키는 JWT_SECRET에서 만들어집니다.
              JWT_SECRET을 바꾸면 저장한 비밀 값을 다시 입력해야 하니, 운영 서버에서는 SETTINGS_ENCRYPTION_KEY를
              따로 설정하세요.
            </div>
          )}
        </div>
      </div>
      {!canEdit && (
        <p className="hgadm-muted hgadm-settings__readonly">
          조회 전용입니다. 값을 바꾸거나 연결 테스트를 하려면 <code>settings:write</code> 권한(최고 관리자)이 필요합니다.
        </p>
      )}

      <nav className="hgadm-settings__jump" aria-label="설정 분류">
        {data.groups.map((group) => (
          <a key={group.id} href={`#settings-${group.id}`} className="hgadm-settings__jump-link">
            {group.label}
          </a>
        ))}
      </nav>

      {data.groups.map((group) => (
        <section key={group.id} id={`settings-${group.id}`} className="hgadm-settings__group" aria-labelledby={`settings-${group.id}-title`}>
          <div className="hgadm-settings__group-head">
            <h2 id={`settings-${group.id}-title`}>{group.label}</h2>
            <p className="hgadm-muted">{group.description}</p>
          </div>
          {group.integrations.map((integration) => (
            <IntegrationCard key={integration.id} integration={integration} canEdit={canEdit} />
          ))}
        </section>
      ))}

      <div className="hgadm-card hgadm-settings__env">
        <div className="hgadm-card__head">
          <div className="hgadm-card__title">서버 정보 (여기서 바꿀 수 없음)</div>
        </div>
        <div className="hgadm-card__body">
          <dl className="hgadm-settings__facts">
            <dt>실행 환경</dt>
            <dd>{data.environment.app_env}</dd>
            <dt>데이터베이스</dt>
            <dd className="hgadm-cell-mono">{data.environment.database}</dd>
          </dl>
          <p className="hgadm-muted">
            데이터베이스 주소, JWT_SECRET, SETTINGS_ENCRYPTION_KEY는 서버 환경 변수로만 바꿀 수 있습니다. AI 기능별
            켜기/끄기와 예산은 &lsquo;AI 운영·튜터 품질&rsquo;, 학습 알림 시각은 &lsquo;알림 설정&rsquo; 페이지에서 관리합니다.
          </p>
        </div>
      </div>
    </>
  );
}

type Outcome = { tone: "success" | "warning" | "danger"; text: string };

function IntegrationCard({ integration, canEdit }: { integration: IntegrationSettings; canEdit: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const dirty = Object.keys(edits).length > 0;

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
    // The page-wide restart notice may have changed too.
    void qc.invalidateQueries({ queryKey: QUERY_KEY });
  };

  const save = useMutation({
    mutationFn: (enabled?: boolean) =>
      adminApi.saveIntegration(integration.id, {
        changes: toChanges(integration.fields, edits),
        ...(enabled === undefined ? {} : { enabled }),
      }),
    onSuccess: (result) => {
      const restart = Object.values(result.applied).includes("restart");
      setEdits({});
      setErrors({});
      // A result from before the save described unsaved values; the card's
      // "마지막 테스트" line keeps the record.
      setTestResult(null);
      setOutcome({ tone: restart ? "warning" : "success", text: result.message });
      toast.success(`${integration.name}: ${result.message}`);
      replace(result.integration);
    },
    onError: (error) => {
      setErrors(fieldErrors(error));
      setOutcome({ tone: "danger", text: `저장하지 못했습니다. ${errorMessage(error)}` });
    },
  });

  const test = useMutation({
    mutationFn: () => adminApi.testIntegration(integration.id, toTrial(integration.fields, edits)),
    onSuccess: (result) => {
      setTestResult(result);
      setErrors({});
      void qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
    onError: (error) => {
      setErrors(fieldErrors(error));
      setTestResult({ ok: false, message: errorMessage(error), latency_ms: 0, details: [], used_unsaved_values: dirty });
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

  const toggle = integration.toggle;
  const busy = save.isPending || test.isPending;
  const last = integration.last_check;

  return (
    <article className="hgadm-card hgadm-settings__card" aria-labelledby={`integration-${integration.id}`}>
      <div className="hgadm-settings__card-head">
        <div className="hgadm-settings__card-title">
          <h3 id={`integration-${integration.id}`}>{integration.name}</h3>
          {integration.status !== "settings" && (
            <Badge tone={STATUS_TONE[integration.status]} dot>
              {integration.status_label}
            </Badge>
          )}
        </div>
        {toggle && (
          <label className="hgadm-settings__toggle">
            <span>사용</span>
            <Switch
              checked={toggle.enabled}
              disabled={!canEdit || busy}
              label={`${integration.name} 사용`}
              onChange={(next) => (next ? save.mutate(true) : setConfirmOff(true))}
            />
          </label>
        )}
      </div>
      <div className="hgadm-card__body">
        <p className="hgadm-settings__desc">{integration.description}</p>
        {integration.status === "incomplete" && (
          <p className="hgadm-settings__warn">
            <AlertTriangle size={14} strokeWidth={2} aria-hidden /> 켜져 있지만 필수 항목이 비어 있어 실제 서비스 대신
            대체 동작 중입니다.
          </p>
        )}
        {toggle && dirty && (
          <p className="hgadm-muted hgadm-settings__small">스위치를 누르면 아래 입력한 값도 함께 저장됩니다.</p>
        )}

        <div className="hgadm-settings__fields">
          {integration.fields.map((field) => (
            <FieldRow
              key={field.key}
              field={field}
              edit={edits[field.key]}
              error={errors[field.key]}
              disabled={!canEdit || busy}
              restartPending={integration.restart_pending.includes(field.key)}
              onEdit={(edit) => setEdit(field.key, edit)}
            />
          ))}
        </div>

        {integration.note && (
          <p className="hgadm-muted hgadm-settings__small">
            <Info size={13} strokeWidth={2} aria-hidden /> {integration.note}
          </p>
        )}

        {outcome && (
          <div className={`hgadm-settings__outcome hgadm-settings__outcome--${outcome.tone}`} role="status">
            {outcome.tone === "danger" ? (
              <XCircle size={16} strokeWidth={2} aria-hidden />
            ) : outcome.tone === "warning" ? (
              <AlertTriangle size={16} strokeWidth={2} aria-hidden />
            ) : (
              <CheckCircle2 size={16} strokeWidth={2} aria-hidden />
            )}
            <span>{outcome.text}</span>
          </div>
        )}

        {testResult && <TestResultBox result={testResult} />}

        {canEdit && (
          <div className="hgadm-settings__actions">
            <Button variant="primary" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate(undefined)}>
              변경사항 저장
            </Button>
            {dirty && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setEdits({});
                  setErrors({});
                  setOutcome(null);
                }}
              >
                취소
              </Button>
            )}
            {integration.testable && (
              <Button variant="secondary" loading={test.isPending} disabled={save.isPending} onClick={() => test.mutate()}>
                <PlugZap size={15} strokeWidth={2} aria-hidden />
                {dirty ? "입력한 값으로 연결 테스트" : "연결 테스트"}
              </Button>
            )}
            {dirty && <span className="hgadm-muted hgadm-settings__small">저장하지 않은 변경사항이 있습니다.</span>}
          </div>
        )}

        {integration.testable && last && !testResult && (
          <p className="hgadm-muted hgadm-settings__small hgadm-settings__last">
            마지막 테스트: {last.ok ? "성공" : "실패"} · {formatDateTime(last.checked_at)}
            {last.checked_by ? ` · ${last.checked_by}` : ""}
            {last.used_unsaved_values ? " · 저장 전 값으로 테스트" : ""} — {last.message}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={confirmOff}
        title={`${integration.name}을(를) 끌까요?`}
        message={
          <>
            끄면 바로 대체 동작(모의 응답·기록만 남김 등)으로 바뀝니다. 입력해 둔 키와 값은 지워지지 않으니 다시 켜면 그대로
            씁니다.
          </>
        }
        confirmLabel="끄기"
        danger
        loading={save.isPending}
        onCancel={() => setConfirmOff(false)}
        onConfirm={() => {
          save.mutate(false, { onSettled: () => setConfirmOff(false) });
        }}
      />
    </article>
  );
}

function TestResultBox({ result }: { result: ConnectionTestResult }) {
  return (
    <div className={`hgadm-settings__outcome hgadm-settings__outcome--${result.ok ? "success" : "danger"}`} role="status">
      {result.ok ? <CheckCircle2 size={16} strokeWidth={2} aria-hidden /> : <XCircle size={16} strokeWidth={2} aria-hidden />}
      <div>
        <strong>{result.ok ? "연결 성공" : "연결 실패"}</strong>
        {result.latency_ms > 0 && <span className="hgadm-settings__latency"> · {result.latency_ms}ms</span>}
        {result.used_unsaved_values && <span className="hgadm-settings__latency"> · 저장 전 값으로 테스트</span>}
        {result.details.length > 0 ? (
          <ul className="hgadm-settings__details">
            {result.details.map((d) => (
              <li key={d.provider}>
                {d.ok ? "✓" : "✕"} {d.provider}: {d.message}
              </li>
            ))}
          </ul>
        ) : (
          <div>{result.message}</div>
        )}
      </div>
    </div>
  );
}

function FieldRow({
  field,
  edit,
  error,
  disabled,
  restartPending,
  onEdit,
}: {
  field: SettingField;
  edit: Edit | undefined;
  error?: string;
  disabled: boolean;
  restartPending: boolean;
  onEdit: (edit: Edit | null) => void;
}) {
  const source = SOURCE_LABEL[field.source];
  const inputId = `setting-${field.key.replace(/[^a-z0-9]/gi, "-")}`;
  const secret = field.kind === "secret" || field.kind === "multiline_secret";
  return (
    <div className={`hgadm-settings__field ${edit ? "is-edited" : ""}`}>
      <div className="hgadm-settings__field-label">
        <label htmlFor={inputId}>
          {field.label}
          {field.required && <span className="req">*</span>}
        </label>
        <span title={source.title}>
          <Badge tone={source.tone}>{field.cleared ? "삭제됨" : source.label}</Badge>
        </span>
        {field.restart_required && (
          <span title="저장해도 서버를 다시 시작해야 적용됩니다.">
            <Badge tone={restartPending ? "warning" : "neutral"}>{restartPending ? "재시작 대기" : "재시작 필요"}</Badge>
          </span>
        )}
      </div>
      <div className="hgadm-settings__field-control">
        {secret ? (
          <SecretControl field={field} inputId={inputId} edit={edit} disabled={disabled} onEdit={onEdit} />
        ) : (
          <ValueControl field={field} inputId={inputId} edit={edit} disabled={disabled} onEdit={onEdit} />
        )}
      </div>
      {error ? (
        <div className="hgadm-field__error" role="alert">
          {error}
        </div>
      ) : (
        (field.help || field.env_var) && (
          <div className="hgadm-field__hint">
            {field.help}
            <span className="hgadm-settings__env-var"> {field.env_var}</span>
          </div>
        )
      )}
    </div>
  );
}

function SecretControl({
  field,
  inputId,
  edit,
  disabled,
  onEdit,
}: {
  field: SettingField;
  inputId: string;
  edit: Edit | undefined;
  disabled: boolean;
  onEdit: (edit: Edit | null) => void;
}) {
  const [visible, setVisible] = useState(false);
  const isSet = !!field.secret?.is_set;
  const [confirmRemove, setConfirmRemove] = useState(false);

  if (edit?.kind === "secret") {
    const common = {
      id: inputId,
      value: edit.value,
      autoComplete: "off",
      spellCheck: false,
      placeholder: field.placeholder || "새 값을 입력하세요",
      disabled,
      "aria-invalid": undefined,
    } as const;
    return (
      <div className="hgadm-settings__secret-edit">
        {field.kind === "multiline_secret" ? (
          <Textarea
            {...common}
            rows={4}
            className={visible ? "" : "hgadm-settings__masked"}
            onChange={(e) => onEdit({ kind: "secret", value: e.target.value })}
          />
        ) : (
          <Input
            {...common}
            type={visible ? "text" : "password"}
            onChange={(e) => onEdit({ kind: "secret", value: e.target.value })}
          />
        )}
        <Button
          variant="ghost"
          size="sm"
          aria-label={visible ? "입력값 숨기기" : "입력값 보기"}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? <EyeOff size={15} strokeWidth={2} /> : <Eye size={15} strokeWidth={2} />}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onEdit(null)}>
          취소
        </Button>
      </div>
    );
  }

  return (
    <div className="hgadm-settings__secret">
      <span id={inputId} className={`hgadm-settings__secret-value ${isSet ? "" : "is-empty"}`}>
        {edit?.kind === "clear"
          ? "저장하면 삭제됩니다"
          : edit?.kind === "reset"
            ? "저장하면 .env 값으로 돌아갑니다"
            : isSet
              ? `${field.secret?.hint ?? "••••"} (설정됨)`
              : "설정 안 됨"}
      </span>
      {edit ? (
        <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onEdit(null)}>
          되돌리기
        </Button>
      ) : (
        <>
          <Button variant="secondary" size="sm" disabled={disabled} onClick={() => onEdit({ kind: "secret", value: "" })}>
            {isSet ? "변경" : "입력"}
          </Button>
          {isSet && (
            <Button variant="danger-soft" size="sm" disabled={disabled} onClick={() => setConfirmRemove(true)}>
              삭제
            </Button>
          )}
          {field.source === "admin" && (
            <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onEdit({ kind: "reset" })}>
              <RotateCcw size={13} strokeWidth={2} aria-hidden /> .env 값으로
            </Button>
          )}
        </>
      )}
      <ConfirmDialog
        open={confirmRemove}
        title={`${field.label}을(를) 삭제할까요?`}
        message=".env에 값이 있어도 쓰지 않게 됩니다. '변경사항 저장'을 눌러야 실제로 삭제됩니다."
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
  edit,
  disabled,
  onEdit,
}: {
  field: SettingField;
  inputId: string;
  edit: Edit | undefined;
  disabled: boolean;
  onEdit: (edit: Edit | null) => void;
}) {
  const saved = field.value;
  const current = edit?.kind === "value" ? edit.value : edit?.kind === "clear" ? "" : saved;
  // Typing back the saved value is not a change (inputs hand numbers back as text).
  const change = (next: string | boolean) =>
    onEdit(String(next) === String(saved ?? "") ? null : { kind: "value", value: next });
  const resetButton = field.source === "admin" && !edit && (
    <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onEdit({ kind: "reset" })}>
      <RotateCcw size={13} strokeWidth={2} aria-hidden /> 기본값으로
    </Button>
  );
  const pendingReset = edit?.kind === "reset" && (
    <span className="hgadm-muted hgadm-settings__small">
      저장하면 .env·기본값으로 돌아갑니다{" "}
      <Button variant="ghost" size="sm" onClick={() => onEdit(null)}>
        되돌리기
      </Button>
    </span>
  );

  let control: ReactNode;
  if (field.kind === "bool") {
    control = (
      <Switch checked={Boolean(current)} disabled={disabled || edit?.kind === "reset"} label={field.label} onChange={(next) => change(next)} />
    );
  } else if (field.kind === "choice") {
    control = (
      <Select id={inputId} value={String(current ?? "")} disabled={disabled || edit?.kind === "reset"} aria-label={field.label} onChange={(e) => change(e.target.value)}>
        {field.choices.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </Select>
    );
  } else {
    control = (
      <Input
        id={inputId}
        value={current === null || current === undefined ? "" : String(current)}
        type={field.kind === "number" || field.kind === "integer" ? "number" : field.kind === "email" ? "email" : "text"}
        step={field.kind === "number" ? "any" : undefined}
        inputMode={field.kind === "number" || field.kind === "integer" ? "decimal" : undefined}
        placeholder={field.placeholder}
        disabled={disabled || edit?.kind === "reset"}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => change(e.target.value)}
      />
    );
  }
  return (
    <div className="hgadm-settings__value">
      {control}
      {resetButton}
      {pendingReset}
    </div>
  );
}

import { useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, Eye, EyeOff, RotateCcw } from "lucide-react";
import type { AiPurpose, SettingField } from "../../api";
import { ConfirmDialog, Input, Select, Switch, Textarea } from "../../components/kit";
import { ModelPicker, ProviderChoice, modelWarnings } from "../../components/ModelPicker";
import type { Edit, ModelsState } from "./model";

type OnEdit = (edit: Edit | null) => void;

/** Where a field's value comes from, and whether a restart is still owed. */
function SourceTag({ field, restartPending }: { field: SettingField; restartPending: boolean }) {
  const tags: ReactNode[] = [];
  if (field.cleared)
    tags.push(
      <span key="c" className="hgadm-cfg__tag hgadm-cfg__tag--danger" title="이 화면에서 비워 두어 .env 값도 쓰지 않습니다.">
        비워 둠
      </span>,
    );
  else if (field.source === "admin")
    tags.push(
      <span key="a" className="hgadm-cfg__tag hgadm-cfg__tag--brand" title="이 화면에서 저장한 값입니다. .env보다 우선합니다.">
        직접 저장
      </span>,
    );
  else if (field.source === "unreadable")
    tags.push(
      <span
        key="u"
        className="hgadm-cfg__tag hgadm-cfg__tag--danger"
        title="저장된 값을 복호화하지 못했습니다(암호화 키 변경). .env 값을 대신 씁니다. 다시 입력하세요."
      >
        다시 입력 필요
      </span>,
    );
  else if (field.source === "env")
    tags.push(
      <span key="e" className="hgadm-cfg__tag" title="서버의 .env 파일 또는 환경 변수에서 온 값입니다.">
        .env
      </span>,
    );
  else
    tags.push(
      <span key="d" className="hgadm-cfg__tag" title="따로 설정하지 않아 기본값을 씁니다.">
        기본값
      </span>,
    );
  if (field.restart_required)
    tags.push(
      <span
        key="r"
        className={`hgadm-cfg__tag hgadm-cfg__tag--restart ${restartPending ? "is-pending" : ""}`}
        title="저장해도 서버를 다시 시작해야 적용됩니다."
      >
        {restartPending ? "재시작 대기 중" : "재시작 후 적용"}
      </span>,
    );
  return <>{tags}</>;
}

/** Offered beside a value saved on this screen: drop it and fall back. */
function ResetButton({ disabled, onEdit, label = "기본값으로" }: { disabled?: boolean; onEdit: OnEdit; label?: string }) {
  return (
    <button type="button" className="hgadm-cfg__textbtn" disabled={disabled} onClick={() => onEdit({ kind: "reset" })}>
      <RotateCcw size={12} strokeWidth={2} aria-hidden /> {label}
    </button>
  );
}

/** A queued clear or reset, which takes the control's place until saved or undone. */
function PendingChange({ inputId, text, disabled, onEdit }: { inputId: string; text: string; disabled?: boolean; onEdit: OnEdit }) {
  return (
    <div className="hgadm-cfg__pending" id={inputId}>
      <span>{text}</span>
      <button type="button" className="hgadm-cfg__textbtn" disabled={disabled} onClick={() => onEdit(null)}>
        취소
      </button>
    </div>
  );
}

/** One setting: label and provenance, its control, then warnings or help. */
export function FieldRow({
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
  onEdit: OnEdit;
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
  const resettable = field.source === "admin" && !edit;

  let control: ReactNode;
  if (secret) {
    control = <SecretControl field={field} inputId={inputId} hintId={hintId} edit={edit} disabled={disabled} onEdit={onEdit} />;
  } else if (field.kind === "provider" && edit?.kind !== "reset") {
    control = (
      <div className="hgadm-cfg__value">
        <ProviderChoice
          inputId={inputId}
          label={field.label}
          value={current}
          data={models.data}
          disabled={disabled}
          onChange={onProvider}
        />
        {resettable && <ResetButton disabled={disabled} onEdit={onEdit} />}
      </div>
    );
  } else if (field.kind === "model" && edit?.kind !== "reset") {
    control = (
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
        {resettable && <ResetButton disabled={disabled} onEdit={onEdit} />}
      </div>
    );
  } else {
    control = <ValueControl field={field} inputId={inputId} hintId={hintId} edit={edit} disabled={disabled} onEdit={onEdit} />;
  }

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
      {control}
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

type ControlProps = {
  field: SettingField;
  inputId: string;
  hintId: string;
  edit: Edit | undefined;
  disabled: boolean;
  onEdit: OnEdit;
};

/** A key or token: never shown back, only its last four characters. */
function SecretControl({ field, inputId, hintId, edit, disabled, onEdit }: ControlProps) {
  const [visible, setVisible] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const isSet = !!field.secret?.is_set;
  const saved = isSet ? `${field.secret?.hint ?? "••••"} 저장됨` : "저장된 값 없음";

  if (edit?.kind === "clear" || edit?.kind === "reset") {
    return (
      <PendingChange
        inputId={inputId}
        text={edit.kind === "clear" ? "저장하면 이 값을 삭제합니다" : "저장하면 .env 값으로 되돌립니다"}
        disabled={disabled}
        onEdit={onEdit}
      />
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
          <button
            type="button"
            className="hgadm-cfg__textbtn hgadm-cfg__textbtn--danger"
            disabled={disabled}
            onClick={() => setConfirmRemove(true)}
          >
            삭제
          </button>
        )}
        {/* An `unreadable` secret is a saved row that can no longer be
            decrypted; resetting drops it back to .env like any saved one. */}
        {(field.source === "admin" || field.source === "unreadable") && !value && (
          <ResetButton disabled={disabled} onEdit={onEdit} label=".env 값으로 되돌리기" />
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

/** A switch, a choice, or a text/number/url/email value. */
function ValueControl({ field, inputId, hintId, edit, disabled, onEdit }: ControlProps) {
  const saved = field.value;
  const current = edit?.kind === "value" ? edit.value : saved;
  // Typing back the saved value is not a change (inputs hand numbers back as text).
  const change = (next: string | boolean) => onEdit(String(next) === String(saved ?? "") ? null : { kind: "value", value: next });

  if (edit?.kind === "reset") {
    return <PendingChange inputId={inputId} text="저장하면 .env·기본값으로 되돌립니다" onEdit={onEdit} />;
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
      <Select
        id={inputId}
        value={String(current ?? "")}
        disabled={disabled}
        aria-label={field.label}
        onChange={(e) => change(e.target.value)}
      >
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
      {field.source === "admin" && !edit && <ResetButton disabled={disabled} onEdit={onEdit} />}
    </div>
  );
}

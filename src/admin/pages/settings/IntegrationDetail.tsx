import { useState } from "react";
import type { FormEvent } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Info, XCircle } from "lucide-react";
import type { IntegrationSettings } from "../../api";
import { errorMessage } from "../../../lib/http";
import { Button, ConfirmDialog, Switch } from "../../components/kit";
import { ModelOverview } from "../../components/ModelPicker";
import { ConnectionBox } from "./ConnectionBox";
import { FieldRow } from "./fields";
import { StatusPill } from "./StatusBadges";
import { useIntegrationForm, type Outcome } from "./useIntegrationForm";

/** Right column: one integration's switch, connection test and fields. */
export function IntegrationDetail({
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
  const form = useIntegrationForm(integration, onDirtyChange);
  const [confirmOff, setConfirmOff] = useState(false);
  const isAi = integration.id === "ai";
  // A payment method without credentials is refused, not faked (outside local dev).
  const isPayment = integration.group === "payments";
  const toggle = integration.toggle;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (canEdit && form.dirty && !form.save.isPending) form.save.mutate(undefined);
  };

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
              disabled={!canEdit || form.busy}
              label={`${integration.name} 사용`}
              onChange={(next) => (next ? form.save.mutate(true) : setConfirmOff(true))}
            />
            <span>{toggle.enabled ? "켜짐" : "꺼짐"}</span>
          </label>
        )}
      </header>

      {integration.status === "incomplete" && (
        <p className="hgadm-cfg__notice hgadm-cfg__notice--warning">
          <AlertTriangle size={15} strokeWidth={2} aria-hidden /> {incompleteNotice(integration)}
        </p>
      )}
      {!canEdit && (
        <p className="hgadm-cfg__notice">
          <Info size={15} strokeWidth={2} aria-hidden /> 조회 전용입니다. 값을 바꾸거나 연결을 테스트하려면 최고 관리자
          권한(settings:write)이 필요합니다.
        </p>
      )}

      {isAi && (
        <ModelOverview
          data={form.models.data}
          loading={form.models.isPending}
          error={
            form.refreshModels.isError
              ? errorMessage(form.refreshModels.error)
              : form.models.isError
                ? errorMessage(form.models.error)
                : null
          }
          aiEnabled={!!toggle?.enabled}
          refreshing={form.refreshModels.isPending}
          onRefresh={() => form.refreshModels.mutate()}
        />
      )}

      {integration.testable && (
        <ConnectionBox
          last={integration.last_check}
          result={form.testResult}
          canTest={canEdit}
          dirty={form.dirty}
          loading={form.test.isPending}
          disabled={form.save.isPending}
          onTest={() => form.test.mutate()}
        />
      )}

      <div className="hgadm-cfg__fields">
        {integration.fields.map((field) => (
          <FieldRow
            key={field.key}
            field={field}
            edit={form.edits[field.key]}
            error={form.errors[field.key]}
            disabled={!canEdit || form.busy}
            restartPending={integration.restart_pending.includes(field.key)}
            models={form.modelsState}
            provider={field.kind === "model" ? form.valueOf(field.key.replace(/_model$/, "_provider")) : ""}
            onProvider={(next) => form.setProvider(field.key, next)}
            onEdit={(edit) => form.setEdit(field.key, edit)}
          />
        ))}
      </div>

      {integration.note && (
        <p className="hgadm-cfg__muted-small">
          <Info size={13} strokeWidth={2} aria-hidden /> {integration.note}
        </p>
      )}

      {canEdit && (
        <SaveBar
          dirty={form.dirty}
          changeCount={form.changeCount}
          outcome={form.outcome}
          errorCount={Object.keys(form.errors).length}
          withToggle={!!toggle}
          busy={form.busy}
          saving={form.save.isPending}
          onDiscard={form.discard}
        />
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
        loading={form.save.isPending}
        onCancel={() => setConfirmOff(false)}
        onConfirm={() => form.save.mutate(false, { onSettled: () => setConfirmOff(false) })}
      />
    </form>
  );
}

/** Why an integration that is switched on is still not doing its job. */
function incompleteNotice(integration: IntegrationSettings): string {
  if (integration.id === "ai")
    return "AI가 켜져 있지만 아래 '현재 사용 중인 모델'의 문제 때문에 해당 용도의 AI 호출은 오류로 멈춥니다.";
  if (integration.group === "ai")
    return "켜져 있지만 API 키가 없어, 이 제공사를 고른 용도의 AI 호출은 오류로 멈춥니다. 키를 입력하세요.";
  if (integration.group === "payments")
    return "켜져 있지만 필수 값이 비어 있어 운영 서버에서는 이 결제 수단의 등록과 결제를 모두 거부합니다.";
  return "켜져 있지만 필수 값이 비어 있어 실제 서비스 대신 대체 동작 중입니다.";
}

/** The sticky bar under the form: what is unsaved, or how the last save went. */
function SaveBar({
  dirty,
  changeCount,
  outcome,
  errorCount,
  withToggle,
  busy,
  saving,
  onDiscard,
}: {
  dirty: boolean;
  changeCount: number;
  outcome: Outcome | null;
  errorCount: number;
  withToggle: boolean;
  busy: boolean;
  saving: boolean;
  onDiscard: () => void;
}) {
  const showDirty = dirty && outcome?.tone !== "danger";
  return (
    <div className={`hgadm-cfg__bar ${showDirty ? "is-dirty" : ""} ${outcome ? `is-${outcome.tone}` : ""}`} aria-live="polite">
      <div className="hgadm-cfg__bar-status">
        {showDirty ? (
          <>
            <span className="hgadm-cfg__bar-dot" aria-hidden />
            저장하지 않은 변경 {changeCount}개
            {withToggle && <span className="hgadm-cfg__bar-sub"> · 스위치를 누르면 함께 저장됩니다</span>}
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
          <Button type="button" variant="ghost" disabled={busy} onClick={onDiscard}>
            취소
          </Button>
        )}
        <Button type="submit" variant="primary" disabled={!dirty} loading={saving}>
          저장
        </Button>
      </div>
    </div>
  );
}

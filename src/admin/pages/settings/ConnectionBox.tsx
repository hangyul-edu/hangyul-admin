import { CheckCircle2, Info, PlugZap, XCircle } from "lucide-react";
import type { IntegrationCheck } from "../../api";
import { Button } from "../../components/kit";
import { formatDateTime } from "../../lib/format";
import type { TestResult } from "./useIntegrationForm";

/** A test result in one shape, whether it was just run or stored from before. */
type Shown = {
  ok: boolean;
  message: string;
  latency: number;
  at: string;
  unsaved: boolean;
  details: { provider: string; ok: boolean; message: string }[];
  by: string | null;
};

function shownResult(result: TestResult | null, last: IntegrationCheck | null): Shown | null {
  if (result) {
    return {
      ok: result.ok,
      message: result.message,
      latency: result.latency_ms,
      at: result.at.toISOString(),
      unsaved: result.used_unsaved_values,
      details: result.details,
      by: null,
    };
  }
  if (last) {
    return {
      ok: last.ok,
      message: last.message,
      latency: last.latency_ms ?? 0,
      at: last.checked_at,
      unsaved: last.used_unsaved_values,
      details: last.details ?? [],
      by: last.checked_by,
    };
  }
  return null;
}

/** The connection test: its last result and the button to run it again. */
export function ConnectionBox({
  last,
  result,
  canTest,
  dirty,
  loading,
  disabled,
  onTest,
}: {
  last: IntegrationCheck | null;
  result: TestResult | null;
  canTest: boolean;
  dirty: boolean;
  loading: boolean;
  disabled: boolean;
  onTest: () => void;
}) {
  const shown = shownResult(result, last);
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

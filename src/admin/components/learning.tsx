// Shared building blocks for the learning-analytics admin pages.
//
// Every metric is shown the way the server computed it: a value with its
// numerator/denominator, or an explicit state — no eligible data, suppressed,
// not comparable — never a silent 0 or a blank. Definitions come from the
// server's metric dictionary so a tooltip can never describe something other
// than what was computed.
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Info } from "lucide-react";
import { learningApi } from "../learningApi";
import type { Change, MetricDefinition, Ratio } from "../learningApi";
import { useUrlFilters } from "../lib/urlFilters";
import { Badge, Input } from "./kit";

const STATUS_TEXT: Record<string, string> = {
  no_eligible_data: "대상 데이터 없음",
  suppressed: "비공개 (표본 5 미만)",
  not_comparable: "비교 불가",
  unavailable: "측정 불가",
  no_baseline: "기준 없음",
  insufficient_evidence: "증거 부족",
};

export function statusText(status: string): string {
  return STATUS_TEXT[status] ?? status;
}

export function pct(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined ? "—" : `${(value * 100).toFixed(digits)}%`;
}

/** A ratio with its sample size, or the reason there is no number. */
export function RatioView({ ratio, compact = false }: { ratio: Ratio | undefined; compact?: boolean }) {
  if (!ratio) return <span className="hgadm-cell-sub">—</span>;
  if (ratio.status !== "ok" || ratio.value === null) {
    return (
      <span className="hgadm-cell-sub" data-status={ratio.status}>
        {statusText(ratio.status)}
        {ratio.note ? ` · ${ratio.note}` : ""}
      </span>
    );
  }
  return (
    <span data-status="ok">
      <strong>{pct(ratio.value)}</strong>
      {!compact && (
        <span className="hgadm-cell-sub">
          {" "}
          ({ratio.numerator.toLocaleString()}/{ratio.denominator.toLocaleString()})
        </span>
      )}
    </span>
  );
}

/** Absolute (percentage points) and relative change, reported separately. */
export function ChangeView({ change }: { change: Change | undefined }) {
  if (!change) return null;
  if (change.status !== "ok" || change.absolute_pp === null) {
    return (
      <span className="hgadm-cell-sub" data-status={change.status}>
        {statusText(change.status)}
        {change.note ? ` — ${change.note}` : ""}
      </span>
    );
  }
  const sign = change.absolute_pp > 0 ? "+" : "";
  return (
    <span>
      {sign}
      {change.absolute_pp.toFixed(1)}%p
      <span className="hgadm-cell-sub">
        {" "}
        (상대 {change.relative_pct === null ? "—" : `${change.relative_pct > 0 ? "+" : ""}${change.relative_pct.toFixed(1)}%`})
      </span>
    </span>
  );
}

export function useMetricDefinitions() {
  return useQuery({
    queryKey: ["admin", "learning", "metric-definitions"],
    queryFn: learningApi.metricDefinitions,
    staleTime: 60 * 60 * 1000,
  });
}

function idOf(metricRef: string): string {
  return metricRef.split("@")[0];
}

/** A metric label with its full server-side definition one click away. */
export function MetricLabel({ metric, children }: { metric: string; children?: ReactNode }) {
  const defs = useMetricDefinitions();
  const def: MetricDefinition | undefined = defs.data?.metrics.find((m) => m.metric_id === idOf(metric));
  return (
    <details className="hgadm-metric-def">
      <summary>
        {children ?? def?.label_ko ?? idOf(metric)}{" "}
        <Info size={13} strokeWidth={2} aria-label="정의 보기" />
      </summary>
      {def ? (
        <dl className="hgadm-dl" style={{ fontSize: 12, marginTop: 6 }}>
          <dt>정의 버전</dt>
          <dd>
            {def.metric_id}@{def.version}
          </dd>
          <dt>분자</dt>
          <dd>{def.numerator}</dd>
          <dt>분모</dt>
          <dd>{def.denominator ?? "—"}</dd>
          <dt>포함</dt>
          <dd>{def.inclusion}</dd>
          <dt>제외</dt>
          <dd>{def.exclusion}</dd>
          <dt>기간·시간대</dt>
          <dd>
            {def.window} · {def.timezone}
          </dd>
          <dt>출처·신선도</dt>
          <dd>
            {def.source} · {def.freshness}
          </dd>
          <dt>한계</dt>
          <dd>{def.limitations}</dd>
        </dl>
      ) : (
        <div className="hgadm-cell-sub">정의를 불러오는 중…</div>
      )}
    </details>
  );
}

/** Window pickers kept in the URL (dates are Asia/Seoul calendar days). */
export function WindowControls({ withComparison = true }: { withComparison?: boolean }) {
  const f = useUrlFilters();
  const input = (name: string, label: string) => (
    <label className="hgadm-window-field">
      <span className="hgadm-cell-sub">{label}</span>
      <Input
        type="date"
        aria-label={label}
        value={f.value(name)}
        onChange={(e) => f.patch({ [name]: e.target.value || null })}
        style={{ width: 150 }}
      />
    </label>
  );
  return (
    <div className="hgadm-toolbar" role="group" aria-label="기간 선택 (Asia/Seoul)">
      {input("current_start", "현재 기간 시작")}
      {input("current_end", "현재 기간 끝")}
      {withComparison && input("comparison_start", "비교 기간 시작")}
      {withComparison && input("comparison_end", "비교 기간 끝")}
      <span className="hgadm-cell-sub">비워 두면 최근 28일과 그 이전 28일 · 시간대 Asia/Seoul</span>
    </div>
  );
}

export function windowParams(f: ReturnType<typeof useUrlFilters>, withComparison = true) {
  const out: Record<string, string | undefined> = {
    current_start: f.value("current_start") || undefined,
    current_end: f.value("current_end") || undefined,
  };
  if (withComparison) {
    out.comparison_start = f.value("comparison_start") || undefined;
    out.comparison_end = f.value("comparison_end") || undefined;
  }
  return out;
}

/**
 * Horizontal bars with the numbers always visible, so the chart is also its
 * own accessible table: each row is a list item with the label and count.
 */
export function BarList({ rows, unit = "" }: { rows: { label: string; value: number }[]; unit?: string }) {
  if (rows.length === 0) return <div className="hgadm-cell-sub">대상 데이터 없음</div>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="hgadm-barlist" aria-label="막대 목록">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="hgadm-barlist__label">{r.label}</span>
          <span className="hgadm-barlist__track" aria-hidden>
            <span className="hgadm-barlist__bar" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="hgadm-barlist__value">
            {r.value.toLocaleString()}
            {unit}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function StaleNotice({ stale, lastSuccess, lag }: { stale: boolean; lastSuccess: string | null; lag: number }) {
  if (!stale) return null;
  return (
    <div className="hgadm-card" role="status" style={{ borderColor: "var(--hgadm-warning, #d97706)" }}>
      <Badge tone="warning">데이터 지연</Badge>{" "}
      집계가 최신이 아닙니다 (마지막 성공: {lastSuccess ? new Date(lastSuccess).toLocaleString("ko-KR") : "없음"}, 미처리 이벤트 {lag.toLocaleString()}건). 활동·재방문 수치는 지연될 수 있어요.
    </div>
  );
}

export const TRACK_LABEL: Record<string, string> = { conversation: "회화", topik: "TOPIK" };

export const STRENGTH_LABEL: Record<string, string> = { low: "증거 적음", medium: "증거 보통", high: "증거 많음" };

export async function downloadExport(exportId: string, filename: string): Promise<void> {
  const csv = await learningApi.downloadExport(exportId);
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

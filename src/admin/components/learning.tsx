// Shared building blocks for the learning-analytics admin pages.
//
// Every metric is shown the way the server computed it: a value with how many
// cases it was computed from, or an explicit reason there is no number — never
// a silent 0 or a blank. The plain name and one-line meaning come from
// lib/metricGuide; the exact definition comes from the server's metric
// dictionary, one click away, so a tooltip can never describe something other
// than what was computed.
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { learningApi } from "../learningApi";
import type { Change, MetricDefinition, Ratio } from "../learningApi";
import { useAdminAuth } from "../auth";
import { useUrlFilters } from "../lib/urlFilters";
import { metricGuide } from "../lib/metricGuide";
import { HelpTip, Notice, PeriodPicker, TrendChip, trendOf } from "./insights";

const STATUS_TEXT: Record<string, string> = {
  no_eligible_data: "아직 데이터 없음",
  suppressed: "표본이 적어 숨김",
  not_comparable: "비교할 수 없음",
  unavailable: "측정할 수 없음",
  no_baseline: "비교 기간 데이터 없음",
  insufficient_evidence: "근거 부족",
};

/** Why a status has no number, for the hover text. */
const STATUS_HINT: Record<string, string> = {
  suppressed: "개인을 특정할 수 없도록 5건 미만은 표시하지 않아요.",
  no_eligible_data: "이 기간에 계산할 대상이 없어요.",
};

export function statusText(status: string): string {
  return STATUS_TEXT[status] ?? status;
}

export function pct(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined ? "—" : `${(value * 100).toFixed(digits)}%`;
}

/** A ratio with what it was computed from, or the reason there is no number. */
export function RatioView({ ratio, compact = false }: { ratio: Ratio | undefined; compact?: boolean }) {
  if (!ratio) return <span className="hgadm-cell-sub">—</span>;
  if (ratio.status !== "ok" || ratio.value === null) {
    return (
      <span
        className="hgins-nodata"
        data-status={ratio.status}
        title={[STATUS_HINT[ratio.status], ratio.note].filter(Boolean).join(" ") || undefined}
      >
        {statusText(ratio.status)}
        {ratio.note ? ` · ${ratio.note}` : ""}
      </span>
    );
  }
  return (
    <span data-status="ok" className="hgins-ratio">
      <strong>{pct(ratio.value)}</strong>
      {!compact && (
        <span className="hgins-ratio__base">
          {ratio.numerator.toLocaleString()} / {ratio.denominator.toLocaleString()}
        </span>
      )}
    </span>
  );
}

/**
 * Change between the two periods: percentage points, judged good or bad for
 * this metric, with the relative change beside it.
 */
export function ChangeView({ change }: { change: Change | undefined }) {
  if (!change) return null;
  if (change.status !== "ok" || change.absolute_pp === null) {
    return (
      <span className="hgins-nodata" data-status={change.status}>
        {statusText(change.status)}
        {change.note ? ` — ${change.note}` : ""}
      </span>
    );
  }
  const sign = change.absolute_pp > 0 ? "+" : "";
  const trend = trendOf(change.absolute_pp, metricGuide(change.metric)?.good ?? "neutral", `${sign}${change.absolute_pp.toFixed(1)}%p`);
  return (
    <span className="hgins-change">
      {trend && <TrendChip trend={trend} />}
      {change.relative_pct !== null && (
        <span className="hgins-change__rel">
          상대 {change.relative_pct > 0 ? "+" : ""}
          {change.relative_pct.toFixed(1)}%
        </span>
      )}
    </span>
  );
}

function useMetricDefinitions() {
  // The dictionary is `analytics:read`, but labels also appear on pages other
  // tiers can open (a learner's growth tab is `learners:read`), so it is only
  // requested by those who may read it.
  const { can } = useAdminAuth();
  return useQuery({
    queryKey: ["admin", "learning", "metric-definitions"],
    queryFn: learningApi.metricDefinitions,
    staleTime: 60 * 60 * 1000,
    enabled: can("analytics:read"),
  });
}

function idOf(metricRef: string): string {
  return metricRef.split("@")[0];
}

/** A metric's plain name, with what it means and its exact definition behind "?". */
export function MetricLabel({ metric, children }: { metric: string; children?: ReactNode }) {
  const defs = useMetricDefinitions();
  const def: MetricDefinition | undefined = defs.data?.metrics.find((m) => m.metric_id === idOf(metric));
  const guide = metricGuide(metric);
  const label = children ?? guide?.name ?? def?.label_ko ?? idOf(metric);
  return (
    <span className="hgins-metric">
      <span className="hgins-metric__name">{label}</span>
      <HelpTip label={typeof label === "string" ? label : "지표"}>
        {guide && <span className="hgins-metric__meaning">{guide.meaning}</span>}
        {def ? (
          <dl className="hgins-defs">
            <dt>계산 방법</dt>
            <dd>
              {def.numerator}
              {def.denominator ? ` ÷ ${def.denominator}` : ""}
            </dd>
            {def.inclusion && (
              <>
                <dt>포함</dt>
                <dd>{def.inclusion}</dd>
              </>
            )}
            {def.exclusion && (
              <>
                <dt>제외</dt>
                <dd>{def.exclusion}</dd>
              </>
            )}
            <dt>기간</dt>
            <dd>
              {def.window} · {def.timezone}
            </dd>
            <dt>데이터</dt>
            <dd>
              {def.source} · {def.freshness}
            </dd>
            {def.limitations && (
              <>
                <dt>주의할 점</dt>
                <dd>{def.limitations}</dd>
              </>
            )}
            <dt>정의 버전</dt>
            <dd>v{def.version}</dd>
          </dl>
        ) : (
          <span className="hgins-defs__missing">
            {defs.isFetching
              ? "정의를 불러오는 중…"
              : defs.isError
                ? "정의를 불러오지 못했습니다."
                : "정확한 계산식은 학습 통계 조회 권한이 있어야 볼 수 있습니다."}
          </span>
        )}
      </HelpTip>
    </span>
  );
}

/** The period picker (kept under its old name for the pages that use it). */
export function WindowControls({ withComparison = true }: { withComparison?: boolean }) {
  return <PeriodPicker withComparison={withComparison} />;
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
export function BarList({
  rows,
  unit = "",
  empty = "아직 데이터가 없어요",
}: {
  rows: { label: string; value: number }[];
  unit?: string;
  empty?: string;
}) {
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  if (rows.length === 0 || total === 0) return <div className="hgins-nodata hgins-nodata--block">{empty}</div>;
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
    <Notice tone="warn" title="통계가 최신이 아니에요">
      마지막 집계 {lastSuccess ? new Date(lastSuccess).toLocaleString("ko-KR") : "기록 없음"}
      {lag > 0 ? ` · 아직 반영되지 않은 활동 ${lag.toLocaleString()}건` : ""}. 활동·재방문 수치는 실제보다 늦게 보일 수 있어요.
    </Notice>
  );
}

export const TRACK_LABEL: Record<string, string> = { conversation: "회화", topik: "TOPIK" };

export const STRENGTH_LABEL: Record<string, string> = { low: "근거 적음", medium: "근거 보통", high: "근거 충분" };

/** A skill's dimension, in words. */
export const DIMENSION_LABEL: Record<string, string> = { recognition: "인식", comprehension: "이해", production: "산출" };

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

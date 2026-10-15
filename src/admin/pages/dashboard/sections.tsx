import { Link } from "react-router-dom";
import type { UseQueryResult } from "@tanstack/react-query";
import type { MetricsOverview, MonthlyRevenueResponse, TimeseriesResponse } from "../../api";
import { errorMessage } from "../../../lib/http";
import { Badge, ErrorState, LoadingState, Stat } from "../../components/kit";
import { formatMoney } from "../../lib/format";
import { MonthlyRevenueChart, TimeseriesChart } from "./charts";

type Can = (scope: string) => boolean;

/** `"2026-09"` → `"2026년 9월"`. The month string comes from the server. */
export function monthLabel(month: string): string {
  const [year, m] = month.split("-");
  return `${year}년 ${Number(m)}월`;
}

/**
 * Where each alert leads, and the scope that page is gated on.
 *
 * The dashboard opens on `users:read`, but these destinations are gated on
 * other scopes. A content manager holds no `commerce:read`, so the payment
 * alerts were offering them a card into 접근 권한이 없습니다 — a page the
 * sidebar already hides from them. An alert you cannot open is not a
 * shortcut, so it is not shown at all: scoping the menu and then routing
 * around it through the dashboard is the same leak twice.
 */
const ALERT_ROUTES: Record<string, { to: string; scope: string }> = {
  lecture_videos_failed: { to: "/lectures", scope: "content:read" },
  webhook_dlq: { to: "/payments", scope: "commerce:read" },
  outbox_stuck: { to: "/payments", scope: "commerce:read" },
  payments_failed_24h: { to: "/payments", scope: "commerce:read" },
  // The page opens on its 결제 tab; unpaid invoices live on the other one.
  invoices_unpaid: { to: "/payments?tab=invoices", scope: "commerce:read" },
  generated_pending_review: { to: "/ai-content", scope: "content:read" },
};

const SEVERITY_TONE: Record<string, "danger" | "warning" | "info"> = { critical: "danger", warning: "warning" };

/** Operational alerts, only those whose destination this admin can open. */
export function AlertList({ alerts, can }: { alerts: MetricsOverview["alerts"]; can: Can }) {
  const visible = alerts.filter((alert) => can(ALERT_ROUTES[alert.code]?.scope ?? "users:read"));
  if (visible.length === 0) return null;
  return (
    <div className="hgadm-section hgadm-stack hgadm-stack--tight">
      {visible.map((alert) => {
        const tone = SEVERITY_TONE[alert.severity] ?? "info";
        return (
          <Link key={alert.code} to={ALERT_ROUTES[alert.code]?.to ?? "/"} className={`hgadm-card hgadm-alert-row hgadm-alert-row--${tone}`}>
            <Badge tone={tone}>{alert.count.toLocaleString()}건</Badge>
            <span className="hgadm-text-md">{alert.message}</span>
          </Link>
        );
      })}
    </div>
  );
}

/** The six headline numbers, each linking to the page behind it. */
export function HeadlineStats({ data, currency, can }: { data: MetricsOverview; currency: string; can: Can }) {
  return (
    <div className="hgadm-stats">
      <Stat
        to={can("users:read") ? "/users" : undefined}
        label="전체 사용자"
        value={data.users.total.toLocaleString()}
        sub={`오늘 +${data.users.new_today} · 7일 +${data.users.new_7d}`}
        subTone={data.users.new_today > 0 ? "up" : undefined}
      />
      <Stat
        to={can("commerce:read") ? "/subscriptions" : undefined}
        label="활성 구독"
        value={(data.subscriptions.active + data.subscriptions.trialing).toLocaleString()}
        sub={`체험 ${data.subscriptions.trialing} · 해지 예약 ${data.subscriptions.canceling}`}
      />
      <Stat
        to={can("commerce:read") ? "/payments" : undefined}
        label={`이번 달 매출 (${currency})`}
        value={formatMoney(data.revenue.this_month_cents, currency)}
        sub={`${monthLabel(data.revenue.this_month)} 1일부터 · 오늘 ${formatMoney(data.revenue.today_cents, currency)} · 다른 통화 결제 제외`}
      />
      <Stat
        to={can("analytics:read") ? "/learning" : undefined}
        label="오늘 학습 활동"
        value={data.learning.active_learners_today.toLocaleString()}
        sub={`${data.learning.sessions_today}회 학습 · ${data.learning.minutes_today.toLocaleString()}분`}
      />
      <Stat
        to={can("ai:read") ? "/learning/ai" : undefined}
        label="AI 비용 (이번 달)"
        value={formatMoney(data.ai.llm_cost_month_usd_cents, "USD")}
        sub={`호출 ${data.ai.llm_calls_30d.toLocaleString()}회/30일`}
      />
      <Stat
        to={can("content:read") ? "/ai-content" : undefined}
        label="AI 검수 대기"
        value={data.ai.generated_pending_review.toLocaleString()}
        sub={`전체 생성 ${data.ai.generated_total.toLocaleString()}건`}
      />
    </div>
  );
}

/** A card head's row of range/metric switches. */
function TabSwitch<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="hgadm-row">
      {options.map((o) => (
        <button key={String(o.value)} className={`hgadm-tab ${value === o.value ? "active" : ""}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const MONTH_RANGES = [6, 12, 24].map((m) => ({ value: m, label: `${m}개월` }));

export function MonthlyRevenueCard({
  query,
  currency,
  months,
  onMonths,
}: {
  query: UseQueryResult<MonthlyRevenueResponse>;
  currency: string;
  months: number;
  onMonths: (months: number) => void;
}) {
  return (
    <div className="hgadm-card hgadm-section">
      <div className="hgadm-card__head">
        <div>
          <div className="hgadm-card__title">월별 매출</div>
          <div className="hgadm-cell-sub hgadm-mt-4">
            한국 시간(KST) 달력 월 기준 {currency} 결제 금액. 다른 통화 결제는 포함하지 않습니다. 마지막 달은 아직 진행
            중입니다.
          </div>
        </div>
        <TabSwitch options={MONTH_RANGES} value={months} onChange={onMonths} />
      </div>
      <div className="hgadm-card__body">
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          <MonthlyRevenueChart data={query.data} />
        )}
      </div>
    </div>
  );
}

export const METRICS = [
  { value: "signups", label: "신규 가입" },
  { value: "revenue", label: "결제 금액" },
  { value: "active_learners", label: "학습 사용자" },
  { value: "attendance", label: "출석 체크인" },
] as const;

export function DailyTrendCard({
  query,
  currency,
  metric,
  onMetric,
}: {
  query: UseQueryResult<TimeseriesResponse>;
  currency: string;
  metric: string;
  onMetric: (metric: string) => void;
}) {
  return (
    <div className="hgadm-card hgadm-section">
      <div className="hgadm-card__head">
        <div className="hgadm-card__title">최근 30일 일별 현황</div>
        <TabSwitch<string> options={METRICS} value={metric} onChange={onMetric} />
      </div>
      <div className="hgadm-card__body">
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} />
        ) : (
          <>
            <TimeseriesChart points={query.data.points} money={metric === "revenue" ? currency : null} />
            {metric === "revenue" && (
              <div className="hgadm-cell-sub hgadm-mt-8">{currency} 결제 금액입니다. 다른 통화 결제는 포함하지 않습니다.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

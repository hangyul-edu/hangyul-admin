import { Link } from "react-router-dom";
import type { UseQueryResult } from "@tanstack/react-query";
import type { CurrencyRevenue, MetricsOverview, MonthlyRevenueResponse, TimeseriesResponse } from "../../api";
import { errorMessage } from "../../../lib/http";
import { Badge, ErrorState, LoadingState, Stat } from "../../components/kit";
import { formatMoney } from "../../lib/format";
import { MonthlyRevenueChart, MonthlyRevenueLegend, TimeseriesChart } from "./charts";

type Can = (scope: string) => boolean;

/** How each priced currency is named on the dashboard. */
const CURRENCY_NAMES: Record<string, string> = { KRW: "원화", USD: "미국 달러" };

/** `"KRW"` → `"원화 (KRW)"`: the code is always shown, the name when known. */
export function currencyHeading(currency: string): string {
  const name = CURRENCY_NAMES[currency];
  return name ? `${name} (${currency})` : currency;
}

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
  // The background queues have their own page, each tab listing exactly the
  // rows the alert counts — 결제·청구서 shows none of them.
  webhook_dlq: { to: "/operations?tab=webhooks", scope: "commerce:read" },
  outbox_stuck: { to: "/operations?tab=outbox", scope: "commerce:read" },
  scoring_exhausted: { to: "/operations?tab=scoring", scope: "learners:read" },
  // Opened on the status the alert counts (failed payments: every one, newest
  // first, not only the last 24 hours).
  payments_failed_24h: { to: "/payments?tab=payments&status=failed", scope: "commerce:read" },
  // The page opens on its 결제 tab; unpaid invoices live on the other one.
  invoices_unpaid: { to: "/payments?tab=invoices&status=unpaid", scope: "commerce:read" },
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

/**
 * The six headline numbers, each linking to the page behind it. Revenue is
 * not one of them: it is reported per currency, side by side, in its own card.
 */
export function HeadlineStats({ data, can }: { data: MetricsOverview; can: Can }) {
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
        label="결제 실패 (24시간)"
        value={data.revenue.failed_payments_24h.toLocaleString()}
        sub="최근 24시간 동안 실패한 결제"
        subTone={data.revenue.failed_payments_24h > 0 ? "down" : undefined}
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

/** One currency's month-to-date figure, labelled with the currency. */
function CurrencyRevenueStat({ revenue, month, to }: { revenue: CurrencyRevenue; month: string; to?: string }) {
  const { currency } = revenue;
  return (
    <Stat
      to={to}
      label={`이번 달 매출 · ${currencyHeading(currency)}`}
      value={formatMoney(revenue.this_month_cents, currency)}
      sub={`${monthLabel(month)} 1일부터 · 오늘 ${formatMoney(revenue.today_cents, currency)} · 30일 환불 ${formatMoney(revenue.refunded_30d_cents, currency)}`}
    />
  );
}

/**
 * Revenue, one currency at a time: this month's KRW and USD figures side by
 * side, then each currency's monthly chart on its own axis. Won and cents are
 * different units, so nothing here adds them up or converts one into the
 * other — there is deliberately no grand total.
 */
export function RevenueCard({
  revenue,
  query,
  months,
  onMonths,
  can,
}: {
  revenue: MetricsOverview["revenue"];
  query: UseQueryResult<MonthlyRevenueResponse>;
  months: number;
  onMonths: (months: number) => void;
  can: Can;
}) {
  return (
    <div className="hgadm-card hgadm-section">
      <div className="hgadm-card__head">
        <div>
          <div className="hgadm-card__title">통화별 매출</div>
          <div className="hgadm-cell-sub hgadm-mt-4">
            원화(KRW)와 미국 달러(USD) 결제는 환산하거나 합산하지 않고 통화별로 따로 집계합니다. 한국 시간(KST) 달력 월
            기준이며, 마지막 달은 아직 진행 중입니다.
          </div>
        </div>
        <TabSwitch options={MONTH_RANGES} value={months} onChange={onMonths} />
      </div>
      <div className="hgadm-card__body">
        <div className="hgadm-revenue-pair">
          {revenue.by_currency.map((entry) => (
            <CurrencyRevenueStat
              key={entry.currency}
              revenue={entry}
              month={revenue.this_month}
              to={can("commerce:read") ? "/payments" : undefined}
            />
          ))}
        </div>
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          <>
            {query.data.series.map((series) => (
              <section key={series.currency} className="hgadm-revenue-series" aria-label={`${currencyHeading(series.currency)} 월별 매출`}>
                <h3 className="hgadm-revenue-series__title">{currencyHeading(series.currency)} 월별 매출</h3>
                <MonthlyRevenueChart series={series} currentMonth={query.data.current_month} />
              </section>
            ))}
            <MonthlyRevenueLegend />
          </>
        )}
      </div>
    </div>
  );
}

export const METRICS = [
  { value: "signups", label: "신규 가입" },
  { value: "revenue_krw", label: "결제 금액 (KRW)" },
  { value: "revenue_usd", label: "결제 금액 (USD)" },
  { value: "active_learners", label: "학습 사용자" },
  { value: "attendance", label: "출석 체크인" },
] as const;

/** The currency a daily revenue metric is in (`revenue_krw` → `KRW`), or null. */
function metricCurrency(metric: string): string | null {
  return metric.startsWith("revenue_") ? metric.slice("revenue_".length).toUpperCase() : null;
}

export function DailyTrendCard({
  query,
  metric,
  onMetric,
}: {
  query: UseQueryResult<TimeseriesResponse>;
  metric: string;
  onMetric: (metric: string) => void;
}) {
  const currency = metricCurrency(metric);
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
            <TimeseriesChart points={query.data.points} money={currency} />
            {currency && (
              <div className="hgadm-cell-sub hgadm-mt-8">{currency} 결제 금액입니다. 다른 통화 결제는 포함하지 않습니다.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { adminApi } from "../api";
import { adminName } from "../lib/adminIdentity";
import type { MonthlyRevenueResponse } from "../api";
import { errorMessage } from "../../lib/http";
import {
  Badge,
  ErrorState,
  LoadingState,
  Stat,
  statusLabel,
  statusTone,
} from "../components/kit";
import {
  formatDateTime,
  formatMoney,
} from "../lib/format";

const METRICS: { key: string; label: string }[] = [
  { key: "signups", label: "신규 가입" },
  { key: "revenue", label: "결제 금액" },
  { key: "active_learners", label: "학습 사용자" },
  { key: "attendance", label: "출석 체크인" },
];

const MONTH_RANGES = [6, 12, 24];

/** `"2026-09"` → `"2026년 9월"`. The month string comes from the server. */
export function monthLabel(month: string): string {
  const [year, m] = month.split("-");
  return `${year}년 ${Number(m)}월`;
}

const ALERT_ROUTES: Record<string, string> = {
  lecture_videos_failed: "/lectures",
  webhook_dlq: "/payments",
  outbox_stuck: "/payments",
  payments_failed_24h: "/payments",
  invoices_unpaid: "/payments",
  generated_pending_review: "/ai-content",
};

export function DashboardPage() {
  const overview = useQuery({
    queryKey: ["admin", "metrics", "overview"],
    queryFn: adminApi.metricsOverview,
    refetchInterval: 60_000,
  });
  const [metric, setMetric] = useState("signups");
  const series = useQuery({
    queryKey: ["admin", "metrics", "timeseries", metric],
    queryFn: () => adminApi.metricsTimeseries(metric, 30),
  });
  const [months, setMonths] = useState(12);
  const monthly = useQuery({
    queryKey: ["admin", "metrics", "monthly-revenue", months],
    queryFn: () => adminApi.metricsMonthlyRevenue(months),
  });

  if (overview.isPending) return <LoadingState label="지표를 불러오는 중…" />;
  if (overview.isError)
    return (
      <ErrorState
        message={errorMessage(overview.error)}
        onRetry={() => void overview.refetch()}
      />
    );
  const data = overview.data;
  const currency = data.revenue.currency;

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>대시보드</h1>
          <div className="hgadm-page-head__desc">
            주요 지표와 최근 활동을 한눈에 확인합니다. ‘오늘’·‘이번 달’ 등 모든 기간은{" "}
            <strong>한국 시간(KST)</strong> 기준입니다.
          </div>
        </div>
      </div>
      {data.alerts.length > 0 && (
        <div className="hgadm-section" style={{ display: "grid", gap: 8 }}>
          {data.alerts.map((alert) => (
            <Link
              key={alert.code}
              to={ALERT_ROUTES[alert.code] ?? "/"}
              className="hgadm-card"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 16px",
                color: "inherit",
                borderLeft: `4px solid var(--${
                  alert.severity === "critical"
                    ? "danger"
                    : alert.severity === "warning"
                      ? "warning"
                      : "info"
                })`,
              }}
            >
              <Badge
                tone={
                  alert.severity === "critical"
                    ? "danger"
                    : alert.severity === "warning"
                      ? "warning"
                      : "info"
                }
              >
                {alert.count.toLocaleString()}건
              </Badge>
              <span style={{ fontSize: 13.5 }}>{alert.message}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="hgadm-stats">
        <Stat
          label="전체 사용자"
          value={data.users.total.toLocaleString()}
          sub={`오늘 +${data.users.new_today} · 7일 +${data.users.new_7d}`}
          subTone={data.users.new_today > 0 ? "up" : undefined}
        />
        <Stat
          label="활성 구독"
          value={(data.subscriptions.active + data.subscriptions.trialing).toLocaleString()}
          sub={`체험 ${data.subscriptions.trialing} · 해지 예약 ${data.subscriptions.canceling}`}
        />
        <Stat
          label="이번 달 매출"
          value={formatMoney(data.revenue.this_month_cents, currency)}
          sub={`${monthLabel(data.revenue.this_month)} 1일부터 · 오늘 ${formatMoney(data.revenue.today_cents, currency)}`}
        />
        <Stat
          label="오늘 학습 활동"
          value={data.learning.active_learners_today.toLocaleString()}
          sub={`${data.learning.sessions_today}세션 · ${data.learning.minutes_today.toLocaleString()}분`}
        />
        <Stat
          label="AI 비용 (이번 달)"
          value={formatMoney(data.ai.llm_cost_month_usd_cents, "USD")}
          sub={`호출 ${data.ai.llm_calls_30d.toLocaleString()}회/30일`}
        />
        <Stat
          label="AI 검수 대기"
          value={data.ai.generated_pending_review.toLocaleString()}
          sub={`전체 생성 ${data.ai.generated_total.toLocaleString()}건`}
        />
      </div>

      <div className="hgadm-card hgadm-section">
        <div className="hgadm-card__head">
          <div className="hgadm-card__title">최근 30일 추이</div>
          <div className="hgadm-row">
            {METRICS.map((m) => (
              <button
                key={m.key}
                className={`hgadm-tab ${metric === m.key ? "active" : ""}`}
                onClick={() => setMetric(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="hgadm-card__body">
          {series.isPending ? (
            <LoadingState />
          ) : series.isError ? (
            <ErrorState message={errorMessage(series.error)} />
          ) : (
            <TimeseriesChart
              points={series.data.points}
              money={metric === "revenue" ? currency : null}
            />
          )}
        </div>
      </div>

      <div className="hgadm-card hgadm-section">
        <div className="hgadm-card__head">
          <div>
            <div className="hgadm-card__title">월별 매출 추이</div>
            <div className="hgadm-cell-sub" style={{ marginTop: 2 }}>
              한국 시간(KST) 달력 월 기준 결제 금액. 마지막 달은 아직 진행 중입니다.
            </div>
          </div>
          <div className="hgadm-row">
            {MONTH_RANGES.map((m) => (
              <button
                key={m}
                className={`hgadm-tab ${months === m ? "active" : ""}`}
                onClick={() => setMonths(m)}
              >
                {m}개월
              </button>
            ))}
          </div>
        </div>
        <div className="hgadm-card__body">
          {monthly.isPending ? (
            <LoadingState />
          ) : monthly.isError ? (
            <ErrorState
              message={errorMessage(monthly.error)}
              onRetry={() => void monthly.refetch()}
            />
          ) : (
            <MonthlyRevenueChart data={monthly.data} />
          )}
        </div>
      </div>

      <div className="hgadm-grid-3">
        <RecentCard title="최근 가입">
          {data.recent_signups.map((u) => (
            <Link key={u.user_id} to={`/users/${u.user_id}`} className="hgadm-recent-row">
              <div>
                <div className="hgadm-cell-main">{u.nickname ?? u.email}</div>
                <div className="hgadm-cell-sub">{u.email}</div>
              </div>
              <div className="hgadm-cell-sub">{formatDateTime(u.created_at)}</div>
            </Link>
          ))}
          {data.recent_signups.length === 0 && (
            <div className="hgadm-muted" style={{ padding: 12 }}>아직 가입자가 없습니다.</div>
          )}
        </RecentCard>
        <RecentCard title="최근 결제">
          {data.recent_payments.map((p) => (
            <div key={p.payment_id} className="hgadm-recent-row">
              <div>
                <div className="hgadm-cell-main">{formatMoney(p.amount_cents, p.currency)}</div>
                <div className="hgadm-cell-sub">{formatDateTime(p.created_at)}</div>
              </div>
              <Badge tone={statusTone(p.status)}>{statusLabel(p.status)}</Badge>
            </div>
          ))}
          {data.recent_payments.length === 0 && (
            <div className="hgadm-muted" style={{ padding: 12 }}>결제 내역이 없습니다.</div>
          )}
        </RecentCard>
        <RecentCard title="최근 관리자 활동">
          {data.recent_admin_actions.map((a) => (
            <div key={a.id} className="hgadm-recent-row">
              <div>
                <div className="hgadm-cell-main">{a.actor_id ? adminName({ name: a.actor_name, email: a.actor_email, user_id: a.actor_id }) : "system"}</div>
                <div className="hgadm-cell-sub hgadm-cell-mono">{a.action}</div>
              </div>
              <div className="hgadm-cell-sub">{formatDateTime(a.occurred_at)}</div>
            </div>
          ))}
          {data.recent_admin_actions.length === 0 && (
            <div className="hgadm-muted" style={{ padding: 12 }}>기록이 없습니다.</div>
          )}
        </RecentCard>
      </div>
    </div>
  );
}

function RecentCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="hgadm-card">
      <div className="hgadm-card__head">
        <div className="hgadm-card__title">{title}</div>
      </div>
      <div style={{ padding: "6px 8px 10px" }}>{children}</div>
    </div>
  );
}

/** Daily 30-day chart: labels every 7th day so the axis stays readable. */
function TimeseriesChart({
  points,
  money,
}: {
  points: { date: string; value: number }[];
  money: string | null;
}) {
  const bars: Bar[] = points.map((p) => ({
    key: p.date,
    label: p.date.slice(5).replace("-", "/"),
    caption: p.date,
    value: p.value,
  }));
  return (
    <BarChart
      bars={bars}
      money={money}
      ariaLabel="최근 30일 일자별 추이 막대 차트"
      showLabel={(i, n) => i === 0 || i === n - 1 || i % 7 === 0}
    />
  );
}

/**
 * Revenue by calendar month. Every month is labelled — the trend is the point
 * of the chart — and the year is shown whenever it changes so a window
 * spanning New Year reads correctly.
 *
 * The month in progress is drawn hatched rather than solid: it holds the 1st
 * to today only, so showing it as a flat bar next to completed months would
 * read as a collapse in revenue every single month.
 */
function MonthlyRevenueChart({ data }: { data: MonthlyRevenueResponse }) {
  const bars: Bar[] = data.points.map((p, i) => {
    const [year, month] = p.month.split("-");
    const yearChanged = i === 0 || p.month.slice(0, 4) !== data.points[i - 1].month.slice(0, 4);
    return {
      key: p.month,
      label: yearChanged ? `${year.slice(2)}'${Number(month)}월` : `${Number(month)}월`,
      caption: `${year}년 ${Number(month)}월`,
      value: p.value_cents,
      partial: p.month === data.current_month,
    };
  });

  return (
    <>
      <BarChart
        bars={bars}
        money={data.currency}
        ariaLabel={`최근 ${data.months}개월 월별 매출 막대 차트`}
        showLabel={() => true}
      />
      <div
        className="hgadm-row"
        style={{ gap: 14, marginTop: 10, fontSize: 12, color: "var(--ink-3)" }}
      >
        <span className="hgadm-row" style={{ gap: 6 }}>
          <span
            aria-hidden
            style={{ width: 10, height: 10, borderRadius: 2, background: "#2563eb" }}
          />
          완료된 달
        </span>
        <span className="hgadm-row" style={{ gap: 6 }}>
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: "#2563eb",
              opacity: 0.35,
              border: "1px dashed #2563eb",
            }}
          />
          이번 달 (진행 중 · 1일~오늘)
        </span>
      </div>
    </>
  );
}

interface Bar {
  key: string;
  /** Axis label. */
  label: string;
  /** Tooltip title. */
  caption: string;
  value: number;
  /** Incomplete period — drawn hatched so it is not read as a real drop. */
  partial?: boolean;
}

/**
 * Single-series bar chart (inline SVG), shared by both dashboard charts so the
 * two cannot drift apart visually.
 * Mark spec: thin bars, 4px rounded data-end anchored to the baseline via a
 * squared-off bottom, 2px gaps, recessive grid, ink-token text, per-bar hover
 * tooltip. Bar color #2563eb (brand blue) validated ≥3:1 against the white
 * surface (~5.2:1).
 */
function BarChart({
  bars: points,
  money,
  ariaLabel,
  showLabel,
}: {
  bars: Bar[];
  money: string | null;
  ariaLabel: string;
  showLabel: (index: number, total: number) => boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 920;
  const height = 220;
  const pad = { top: 16, right: 8, bottom: 26, left: 46 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...points.map((p) => p.value));
  // Round the axis top to a friendly value.
  const niceMax = useMemo(() => {
    const raw = max;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    return Math.ceil(raw / magnitude) * magnitude;
  }, [max]);
  const barGap = 2;
  const barW = Math.max(2, innerW / points.length - barGap);
  const fmt = (v: number) => (money ? formatMoney(v, money) : v.toLocaleString());
  const gridLines = [0.25, 0.5, 0.75, 1];

  const hovered = hover !== null ? points[hover] : null;

  return (
    <div style={{ position: "relative", overflowX: "auto" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: "100%", minWidth: 640, display: "block" }}
        role="img"
        aria-label={ariaLabel}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          {/* Diagonal hatch for a period that is not over yet. Reads as
              "incomplete" rather than "lower" at a glance, and survives being
              printed or viewed without color. */}
          <pattern
            id="hgadm-bar-partial"
            width={6}
            height={6}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width={6} height={6} fill="#2563eb" opacity={0.18} />
            <line x1={0} y1={0} x2={0} y2={6} stroke="#2563eb" strokeWidth={2.5} />
          </pattern>
        </defs>
        {gridLines.map((f) => {
          const y = pad.top + innerH * (1 - f);
          return (
            <g key={f}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y}
                y2={y}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text
                x={pad.left - 8}
                y={y + 4}
                textAnchor="end"
                fontSize={10.5}
                fill="var(--ink-3)"
              >
                {money
                  ? Math.round((niceMax * f) / (money === "KRW" ? 1 : 100)).toLocaleString()
                  : Math.round(niceMax * f).toLocaleString()}
              </text>
            </g>
          );
        })}
        <line
          x1={pad.left}
          x2={width - pad.right}
          y1={pad.top + innerH}
          y2={pad.top + innerH}
          stroke="var(--border-strong)"
          strokeWidth={1}
        />
        {points.map((p, i) => {
          const h = Math.round((p.value / niceMax) * innerH);
          const x = pad.left + i * (barW + barGap);
          const y = pad.top + innerH - h;
          const isHover = hover === i;
          return (
            <g key={p.key}>
              {/* Full-height hit target, larger than the mark itself. */}
              <rect
                x={x - barGap / 2}
                y={pad.top}
                width={barW + barGap}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
              {p.value > 0 && (
                <path
                  d={roundedTopBar(x, y, barW, h, Math.min(4, barW / 2, h))}
                  fill={p.partial ? "url(#hgadm-bar-partial)" : "#2563eb"}
                  stroke={p.partial ? "#2563eb" : undefined}
                  strokeWidth={p.partial ? 1 : undefined}
                  strokeDasharray={p.partial ? "3 2" : undefined}
                  opacity={hover === null || isHover ? 1 : 0.45}
                  pointerEvents="none"
                />
              )}
              {showLabel(i, points.length) && (
                <text
                  x={x + barW / 2}
                  y={height - 8}
                  textAnchor="middle"
                  fontSize={10.5}
                  fill="var(--ink-3)"
                >
                  {p.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hovered && hover !== null && (
        <div
          style={{
            position: "absolute",
            left: `${((pad.left + hover * (barW + barGap) + barW / 2) / width) * 100}%`,
            top: 0,
            transform: "translateX(-50%)",
            background: "#2b2019",
            color: "#fff",
            borderRadius: 8,
            padding: "6px 10px",
            fontSize: 12,
            pointerEvents: "none",
            whiteSpace: "nowrap",
            boxShadow: "var(--shadow-md)",
          }}
        >
          <strong>{hovered.caption}</strong> · {fmt(hovered.value)}
          {hovered.partial && " (진행 중)"}
        </div>
      )}
    </div>
  );
}

/** Bar path with rounded top corners and a square base on the baseline. */
function roundedTopBar(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, r);
  return [
    `M ${x} ${y + h}`,
    `L ${x} ${y + rr}`,
    `Q ${x} ${y} ${x + rr} ${y}`,
    `L ${x + w - rr} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + rr}`,
    `L ${x + w} ${y + h}`,
    "Z",
  ].join(" ");
}

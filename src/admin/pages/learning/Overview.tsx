import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CheckCircle2, CircleDollarSign, LineChart, Target, Users } from "lucide-react";
import { learningApi } from "../../learningApi";
import type { Change, OverviewSide, Ratio } from "../../learningApi";
import { useUrlFilters } from "../../lib/urlFilters";
import { metricGuide } from "../../lib/metricGuide";
import { errorMessage } from "../../../lib/http";
import { useAdminAuth } from "../../auth";
import { ErrorState, LoadingState } from "../../components/kit";
import { KpiCard, KpiRow, PageHero, Panel, PeriodPicker, trendOf } from "../../components/insights";
import { BarList, ChangeView, MetricLabel, RatioView, StaleNotice, pct, statusText, windowParams } from "../../components/learning";

const ROUTE_LABEL: Record<string, string> = {
  stored_hint: "저장된 힌트로 답함",
  stored_explanation: "검수된 해설로 답함",
  grounded_generation: "자료를 근거로 새로 작성",
  fallback: "기본 안내로 답함",
  refused: "정답을 알려 주지 않음",
};

const CUSTOM_LABEL: Record<string, string> = {
  applied: "반영됨",
  undone: "반영 후 회원이 되돌림",
  needs_clarification: "추가 질문 필요",
  rejected: "조건이 안 맞아 유지",
  conflicted: "다른 설정과 충돌",
  cancelled: "회원이 취소",
  failed: "처리 실패",
  processing: "처리 중",
};

type RatioKey =
  | "session_completion_rate"
  | "independent_accuracy"
  | "assistance_rate"
  | "review_success_rate"
  | "delayed_retention_rate"
  | "customization_success_rate"
  | "retrieval_fulfillment_rate"
  | "content_defect_rate";

// Each metric links to the page that explains it, with the scope that page is
// gated on (App.tsx): a link this tier cannot open is not shown.
const GROUPS: { title: string; description: string; rows: { key: RatioKey; link: string; scope: string }[] }[] = [
  {
    title: "학습 성과",
    description: "회원들이 실제로 실력을 쌓고 있는지 보여 주는 지표예요.",
    rows: [
      { key: "independent_accuracy", link: "/learning/content", scope: "content:read" },
      { key: "assistance_rate", link: "/learning/content", scope: "content:read" },
      { key: "review_success_rate", link: "/learning/learners?review_overdue=true", scope: "learners:read" },
      { key: "delayed_retention_rate", link: "/learning/cohorts", scope: "analytics:read" },
    ],
  },
  {
    title: "맞춤 학습·콘텐츠",
    description: "학습이 회원에게 잘 맞춰지고, 콘텐츠가 믿을 만한지 보여 줘요.",
    rows: [
      { key: "session_completion_rate", link: "/learning/recommendations", scope: "analytics:read" },
      { key: "customization_success_rate", link: "/learning/recommendations", scope: "analytics:read" },
      { key: "retrieval_fulfillment_rate", link: "/learning/recommendations", scope: "analytics:read" },
      { key: "content_defect_rate", link: "/learning/content", scope: "content:read" },
    ],
  },
];

function usd(cents: number | null): string {
  return cents === null ? "—" : `$${(cents / 100).toFixed(2)}`;
}

/** The KPI value for a ratio: the percentage, or why there is none. */
function ratioValue(r: Ratio) {
  return r.status === "ok" && r.value !== null ? pct(r.value) : <span className="hgins-nodata">{statusText(r.status)}</span>;
}

function ratioTrend(change: Change | undefined) {
  if (!change || change.status !== "ok" || change.absolute_pp === null) return null;
  const sign = change.absolute_pp > 0 ? "+" : "";
  return trendOf(change.absolute_pp, metricGuide(change.metric)?.good ?? "neutral", `${sign}${change.absolute_pp.toFixed(1)}%p`);
}

function ratioSub(r: Ratio) {
  return r.status === "ok" ? `${r.numerator.toLocaleString()} / ${r.denominator.toLocaleString()}` : undefined;
}

export function LearningOverviewPage() {
  const f = useUrlFilters();
  const { can } = useAdminAuth();
  const params = windowParams(f);
  const query = useQuery({
    queryKey: ["admin", "learning", "overview", params],
    queryFn: () => learningApi.overview(params),
  });

  const d = query.data;
  const cur: OverviewSide | undefined = d?.current;
  const cmp: OverviewSide | undefined = d?.comparison;

  return (
    <div>
      <PageHero
        icon={LineChart}
        eyebrow="학습 인사이트"
        title="한눈에 보기"
        description="회원들이 얼마나 공부하고, 얼마나 잘 배우고 있는지 핵심만 모았어요. 모든 수치는 직전 같은 길이의 기간과 비교하며, 지표 이름 옆 ?를 누르면 정확한 계산 방법을 볼 수 있어요."
      />
      <PeriodPicker />
      {query.isLoading && <LoadingState />}
      {query.isError && <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />}
      {d && cur && cmp && (
        <>
          <StaleNotice
            stale={d.freshness.stale}
            lastSuccess={d.freshness.daily_activity_last_success_at}
            lag={d.freshness.daily_activity_lag_events}
          />

          <KpiRow>
            <KpiCard
              icon={Users}
              label={<MetricLabel metric={cur.active_learners.metric} />}
              value={`${cur.active_learners.value.toLocaleString()}명`}
              trend={trendOf(
                cur.active_learners.value - cmp.active_learners.value,
                "up",
                `${cur.active_learners.value - cmp.active_learners.value >= 0 ? "+" : ""}${(
                  cur.active_learners.value - cmp.active_learners.value
                ).toLocaleString()}명`,
              )}
              sub={`직전 ${cmp.active_learners.value.toLocaleString()}명`}
            />
            <KpiCard
              icon={CheckCircle2}
              label={<MetricLabel metric={cur.session_completion_rate.metric} />}
              value={ratioValue(cur.session_completion_rate)}
              trend={ratioTrend(d.changes.session_completion_rate)}
              sub={`시작한 학습 ${cur.sessions_started.toLocaleString()}회`}
            />
            <KpiCard
              icon={Target}
              label={<MetricLabel metric={cur.independent_accuracy.metric} />}
              value={ratioValue(cur.independent_accuracy)}
              trend={ratioTrend(d.changes.independent_accuracy)}
              sub={ratioSub(cur.independent_accuracy)}
            />
            <KpiCard
              icon={CircleDollarSign}
              label={<MetricLabel metric={cur.ai_cost.metric} />}
              value={
                cur.ai_cost.status === "ok" ? (
                  usd(cur.ai_cost.per_session_cents)
                ) : (
                  <span className="hgins-nodata">{statusText(cur.ai_cost.status)}</span>
                )
              }
              trend={
                cur.ai_cost.per_session_cents !== null && cmp.ai_cost.per_session_cents !== null
                  ? trendOf(
                      cur.ai_cost.per_session_cents - cmp.ai_cost.per_session_cents,
                      "down",
                      `${cur.ai_cost.per_session_cents >= cmp.ai_cost.per_session_cents ? "+" : "−"}${usd(
                        Math.abs(cur.ai_cost.per_session_cents - cmp.ai_cost.per_session_cents),
                      )}`,
                    )
                  : null
              }
              sub={`추정치 · 학습 외 AI 비용 ${usd(cur.ai_cost.unattributed_cents_estimated)}`}
            />
          </KpiRow>

          <div className="hgins-grid">
            {GROUPS.map((group) => (
              <Panel key={group.title} title={group.title} description={group.description}>
                <ul className="hgins-mlist">
                  {group.rows.map(({ key, link, scope }) => {
                    const ratio = cur[key] as Ratio;
                    return (
                      <li key={key}>
                        <MetricLabel metric={ratio.metric} />
                        <div className="hgins-mlist__value">
                          <RatioView ratio={ratio} />
                          {/* No value, no change: one "no data" is enough. */}
                          {ratio.status === "ok" && <ChangeView change={d.changes[key]} />}
                        </div>
                        <div className="hgins-mlist__meaning">
                          {metricGuide(ratio.metric)?.meaning}{" "}
                          {can(scope) && (
                            <Link to={link} className="hgins-mlist__link">
                              자세히 보기
                            </Link>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            ))}
          </div>

          <div className="hgins-grid">
            <Panel title="도움을 받은 방식" description="첫 시도에서 힌트를 보거나 정답을 확인한 횟수예요.">
              <BarList
                rows={[
                  { label: "힌트 보기", value: cur.assistance_breakdown.hint },
                  { label: "정답 확인", value: cur.assistance_breakdown.reveal },
                  { label: "복습 중 도움", value: cur.reviews_assisted },
                ]}
                unit="회"
                empty="이 기간에 도움을 받은 기록이 없어요"
              />
            </Panel>
            <Panel title="맞춤 요청 처리 결과" description="회원이 주제·난이도 등을 바꿔 달라고 한 요청이 어떻게 처리됐는지예요.">
              <BarList
                rows={Object.entries(cur.customization_statuses).map(([k, v]) => ({ label: CUSTOM_LABEL[k] ?? k, value: v }))}
                unit="건"
                empty="이 기간에 맞춤 요청이 없어요"
              />
            </Panel>
            <Panel
              title="튜터 답변 방식"
              description="AI 튜터가 질문에 어떤 방법으로 답했는지예요."
              actions={
                can("ai:read") ? (
                  <Link to="/learning/ai" className="hgins-mlist__link">
                    답변 검수하기
                  </Link>
                ) : undefined
              }
            >
              <BarList
                rows={Object.entries(cur.tutor_turns_by_route).map(([k, v]) => ({ label: ROUTE_LABEL[k] ?? k, value: v }))}
                unit="건"
                empty="이 기간에 튜터 질문이 없어요"
              />
            </Panel>
          </div>

          <p className="hgins-cta__hint">
            {d.caution || "기간 비교는 원인을 증명하지 않아요. 회원 구성·난이도·도움 사용이 달라졌을 수 있어요."} 수치는{" "}
            {d.current_window.start} – {d.current_window.end} ({d.timezone}) 기준이에요.
          </p>
        </>
      )}
    </div>
  );
}

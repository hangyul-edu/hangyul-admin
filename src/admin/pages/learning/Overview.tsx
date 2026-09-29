import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { learningApi } from "../../learningApi";
import type { OverviewSide, Ratio } from "../../learningApi";
import { useUrlFilters } from "../../lib/urlFilters";
import { errorMessage } from "../../../lib/http";
import { useAdminAuth } from "../../auth";
import { ErrorState, LoadingState } from "../../components/kit";
import {
  BarList,
  ChangeView,
  MetricLabel,
  RatioView,
  StaleNotice,
  WindowControls,
  windowParams,
} from "../../components/learning";

const ROUTE_LABEL: Record<string, string> = {
  stored_hint: "저장된 힌트",
  stored_explanation: "검수된 설명",
  grounded_generation: "근거 기반 생성",
  fallback: "대체 응답",
  refused: "정답 노출 차단",
};

const CUSTOM_LABEL: Record<string, string> = {
  applied: "적용",
  undone: "적용 후 되돌림",
  needs_clarification: "추가 질문",
  rejected: "유지(조건 불충족)",
  conflicted: "충돌",
  cancelled: "취소",
  failed: "실패",
  processing: "처리 중",
};

// Each summary links to the page that explains it, with the scope that page is
// gated on (App.tsx): a link this tier cannot open is not shown.
const RATIO_ROWS: { key: keyof OverviewSide; link: string; scope: string }[] = [
  { key: "session_completion_rate", link: "/learning/recommendations", scope: "analytics:read" },
  { key: "independent_accuracy", link: "/learning/content", scope: "content:read" },
  { key: "assistance_rate", link: "/learning/content", scope: "content:read" },
  { key: "review_success_rate", link: "/learning/learners?review_overdue=true", scope: "learners:read" },
  { key: "delayed_retention_rate", link: "/learning/cohorts", scope: "analytics:read" },
  { key: "customization_success_rate", link: "/learning/recommendations", scope: "analytics:read" },
  { key: "retrieval_fulfillment_rate", link: "/learning/recommendations", scope: "analytics:read" },
  { key: "content_defect_rate", link: "/learning/content", scope: "content:read" },
];

function usd(cents: number | null): string {
  return cents === null ? "—" : `$${(cents / 100).toFixed(2)}`;
}

export function LearningOverviewPage() {
  const f = useUrlFilters();
  const { can } = useAdminAuth();
  const params = windowParams(f);
  const query = useQuery({
    queryKey: ["admin", "learning", "overview", params],
    queryFn: () => learningApi.overview(params),
  });

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>학습 개요</h1>
          <div className="hgadm-page-head__desc">
            적응형 학습의 활동·수행·복습·맞춤화·튜터·콘텐츠·비용을 두 기간으로 비교합니다. 모든 비율은 분자/분모와
            함께 표시되고, 대상이 없으면 0%가 아니라 &quot;대상 데이터 없음&quot;으로 표시됩니다. 활동량은 학습 성장의
            증거가 아닙니다.
          </div>
        </div>
      </div>
      <WindowControls />
      {query.isLoading && <LoadingState />}
      {query.isError && <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />}
      {query.data && (
        <>
          <StaleNotice
            stale={query.data.freshness.stale}
            lastSuccess={query.data.freshness.daily_activity_last_success_at}
            lag={query.data.freshness.daily_activity_lag_events}
          />
          <div className="hgadm-card">
            <div className="hgadm-cell-sub">
              현재 {query.data.current_window.start} ~ {query.data.current_window.end} · 비교{" "}
              {query.data.comparison_window.start} ~ {query.data.comparison_window.end} · 시간대 {query.data.timezone}
            </div>
            <div className="hgadm-stats" style={{ marginTop: 12 }}>
              <div className="hgadm-stat">
                <div className="hgadm-stat__label">
                  <MetricLabel metric={query.data.current.active_learners.metric} />
                </div>
                <div className="hgadm-stat__value">{query.data.current.active_learners.value.toLocaleString()}명</div>
                <div className="hgadm-stat__sub">비교 기간 {query.data.comparison.active_learners.value.toLocaleString()}명</div>
              </div>
              <div className="hgadm-stat">
                <div className="hgadm-stat__label">시작된 세션</div>
                <div className="hgadm-stat__value">{query.data.current.sessions_started.toLocaleString()}</div>
                <div className="hgadm-stat__sub">완료율 판정 가능 {query.data.current.sessions_mature.toLocaleString()}개 (24시간 경과)</div>
              </div>
              <div className="hgadm-stat">
                <div className="hgadm-stat__label">
                  <MetricLabel metric={query.data.current.ai_cost.metric} />
                </div>
                <div className="hgadm-stat__value">
                  {query.data.current.ai_cost.status === "ok" ? usd(query.data.current.ai_cost.per_session_cents) : "대상 데이터 없음"}
                </div>
                <div className="hgadm-stat__sub">
                  추정 · 세션 외 비용 {usd(query.data.current.ai_cost.unattributed_cents_estimated)} · 비용 미확인{" "}
                  {query.data.current.ai_cost.calls_cost_unavailable}건
                </div>
              </div>
            </div>
          </div>

          <div className="hgadm-card">
            <table className="hgadm-table">
              <caption className="hgadm-cell-sub" style={{ textAlign: "left", paddingBottom: 8 }}>
                지표별 현재 기간·비교 기간·변화 (변화는 %p와 상대 %를 따로 표시)
              </caption>
              <thead>
                <tr>
                  <th scope="col">지표</th>
                  <th scope="col">현재 기간</th>
                  <th scope="col">비교 기간</th>
                  <th scope="col">변화</th>
                </tr>
              </thead>
              <tbody>
                {RATIO_ROWS.map(({ key, link, scope }) => {
                  const cur = query.data.current[key] as Ratio;
                  const cmp = query.data.comparison[key] as Ratio;
                  return (
                    <tr key={key}>
                      <th scope="row" style={{ fontWeight: 500 }}>
                        <MetricLabel metric={cur.metric} />
                        {can(scope) && (
                          <div>
                            <Link to={link} className="hgadm-cell-sub">
                              자세히 보기
                            </Link>
                          </div>
                        )}
                      </th>
                      <td>
                        <RatioView ratio={cur} />
                      </td>
                      <td>
                        <RatioView ratio={cmp} />
                      </td>
                      <td>
                        <ChangeView change={query.data.changes[key]} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="hgadm-cell-sub" style={{ marginTop: 8 }}>
              {query.data.caution}
            </div>
          </div>

          <div className="hgadm-grid-2">
            <div className="hgadm-card">
              <h3>도움 사용 (현재 기간, 첫 시도 기준)</h3>
              <BarList
                rows={[
                  { label: "힌트 사용", value: query.data.current.assistance_breakdown.hint },
                  { label: "정답 공개", value: query.data.current.assistance_breakdown.reveal },
                  { label: "복습 중 도움 받음", value: query.data.current.reviews_assisted },
                ]}
                unit="건"
              />
            </div>
            <div className="hgadm-card">
              <h3>맞춤화 요청 결과</h3>
              <BarList
                rows={Object.entries(query.data.current.customization_statuses).map(([k, v]) => ({
                  label: CUSTOM_LABEL[k] ?? k,
                  value: v,
                }))}
                unit="건"
              />
            </div>
            <div className="hgadm-card">
              <h3>튜터 응답 경로</h3>
              <BarList
                rows={Object.entries(query.data.current.tutor_turns_by_route).map(([k, v]) => ({
                  label: ROUTE_LABEL[k] ?? k,
                  value: v,
                }))}
                unit="건"
              />
              {can("ai:read") && (
                <Link to="/learning/ai" className="hgadm-cell-sub">
                  튜터 품질 검수 보기
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

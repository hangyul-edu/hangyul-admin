import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ToastProvider } from "../../../hooks/toast";
import { learningApi } from "../../learningApi";
import type { Growth, LearnerDetail, Overview, Ratio } from "../../learningApi";
import { LearningOverviewPage } from "./Overview";
import { LearnersPage } from "./Learners";
import { LearnerDetailPage } from "./LearnerDetail";

vi.mock("../../learningApi", async () => {
  const actual = await vi.importActual<typeof import("../../learningApi")>("../../learningApi");
  return {
    ...actual,
    learningApi: {
      ...actual.learningApi,
      metricDefinitions: vi.fn().mockResolvedValue({ reporting_timezone: "Asia/Seoul", metrics: [] }),
      overview: vi.fn(),
      learners: vi.fn(),
      learner: vi.fn(),
      growth: vi.fn(),
      evidence: vi.fn(),
      timeline: vi.fn(),
      sessionTrace: vi.fn(),
    },
  };
});

vi.mock("../../auth", () => ({
  useAdminAuth: () => ({ can: (s: string) => ["analytics:read", "learners:read"].includes(s) }),
}));

const api = vi.mocked(learningApi);

function wrap(ui: ReactNode, path = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/learning/learners/:userId" element={ui} />
            <Route path="*" element={ui} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const empty = (metric: string): Ratio => ({ metric, status: "no_eligible_data", value: null, numerator: 0, denominator: 0 });
const ok = (metric: string, n: number, d: number): Ratio => ({ metric, status: "ok", value: n / d, numerator: n, denominator: d });

function side(accuracy: Ratio) {
  return {
    active_learners: { metric: "active_learners@1", value: 3 },
    sessions_started: 4,
    sessions_mature: 2,
    assistance_breakdown: { hint: 1, reveal: 0 },
    reviews_assisted: 0,
    customization_statuses: {},
    tutor_turns_by_route: {},
    ai_cost: {
      metric: "ai_cost_per_session@1", currency: "USD", attributed_cents_estimated: 0, unattributed_cents_estimated: 0,
      calls_cost_unavailable: 0, per_session_cents: 0, denominator: "adaptive sessions started in window", status: "ok" as const,
    },
    session_completion_rate: empty("session_completion_rate@1"),
    independent_accuracy: accuracy,
    assistance_rate: empty("assistance_rate@1"),
    review_success_rate: empty("review_success_rate@1"),
    delayed_retention_rate: empty("delayed_retention_rate@1"),
    customization_success_rate: empty("customization_success_rate@1"),
    retrieval_fulfillment_rate: empty("retrieval_fulfillment_rate@1"),
    content_defect_rate: empty("content_defect_rate@1"),
  };
}

describe("LearningOverviewPage", () => {
  it("shows 'no eligible data' instead of 0% and flags stale aggregates", async () => {
    const overview: Overview = {
      timezone: "Asia/Seoul",
      current_window: { start: "2026-09-01", end: "2026-09-28", timezone: "Asia/Seoul" },
      comparison_window: { start: "2026-08-04", end: "2026-08-31", timezone: "Asia/Seoul" },
      freshness: { daily_activity_last_success_at: null, daily_activity_lag_events: 12, stale: true, note: "" },
      current: side(ok("independent_accuracy@1", 3, 4)),
      comparison: side(ok("independent_accuracy@1", 1, 4)),
      changes: {
        independent_accuracy: {
          metric: "independent_accuracy@1", status: "ok", baseline: ok("independent_accuracy@1", 1, 4),
          current: ok("independent_accuracy@1", 3, 4), absolute_pp: 50, relative_pct: 200, note: null,
        },
      },
      caution: "기간 비교는 인과를 입증하지 않습니다.",
    };
    api.overview.mockResolvedValue(overview);
    wrap(<LearningOverviewPage />, "/learning");
    expect(await screen.findByText(/통계가 최신이 아니에요/)).toBeInTheDocument();
    expect(screen.getAllByText("아직 데이터 없음").length).toBeGreaterThan(0);
    expect(screen.queryByText("0.0%")).not.toBeInTheDocument();
    // Headline card and its row in 학습 성과 both show it.
    expect(screen.getAllByText("75.0%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3 / 4").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\+50\.0%p/).length).toBeGreaterThan(0);
    expect(screen.getByText(/상대 \+200\.0%/)).toBeInTheDocument();
  });
});

describe("LearnersPage", () => {
  beforeEach(() => api.learners.mockReset());

  it("lists masked learners with neutral evidence labels and keeps filters in the URL", async () => {
    api.learners.mockResolvedValue({
      items: [
        {
          user_id: "usr_1", email_masked: "ki•••@example.com", nickname: "지수", last_study_at: "2026-09-01T00:00:00Z",
          evidence_count: 0, overdue_reviews: 2,
          labels: [{ code: "no_assessment_evidence", ko: "평가 증거 없음" }, { code: "reviews_overdue", ko: "복습 2개 기한 초과" }],
        },
      ],
      total: 1, page: 1, page_size: 25,
    });
    wrap(<LearnersPage />, "/learning/learners?track=topik&review_overdue=true");
    expect(await screen.findByText("ki•••@example.com")).toBeInTheDocument();
    expect(screen.getByText("복습 2개 기한 초과")).toBeInTheDocument();
    // The row labels are evidence-specific; nothing in the table calls the learner "declining".
    expect(within(screen.getByRole("table")).queryByText(/하락|declin/i)).not.toBeInTheDocument();
    expect(api.learners).toHaveBeenCalledWith(expect.objectContaining({ track: "topik", review_overdue: true }));
  });
});

describe("LearnerDetailPage", () => {
  const detail: LearnerDetail = {
    user_id: "usr_1", email_masked: "ki•••@example.com", nickname: "지수", status: "active",
    created_at: "2026-08-01T00:00:00Z", data_coverage_start: null, learner_model_version: "lm-rule-v1",
    tracks: [{
      track: "conversation", band: 2, placement_method: "self_report_band_v1", placement_uncertainty: "high",
      skills: [{ skill_id: "grammar.euni_kka", name_ko: "-(으)니까", dimension: "production", mastery: 0.5, prior: 0.35,
        evidence_count: 1, evidence_strength: "low", model_version: "lm-rule-v1", last_practiced_at: null, next_review_at: null }],
      review_queue: [], recent_miss_patterns: [],
    }],
    recent_sessions: [{ session_id: "ss_1", track: "conversation", status: "completed", started_at: "2026-09-01T00:00:00Z", ended_at: null, current_revision: 1, shortfall_reason: null }],
  };

  beforeEach(() => {
    api.learner.mockResolvedValue(detail);
  });

  it("marks a cross-version skill change as not comparable, never as a number", async () => {
    const growth = {
      user_id: "usr_1", track: "conversation",
      baseline_window: { start: "2026-08-01", end: "2026-08-28", timezone: "Asia/Seoul" },
      current_window: { start: "2026-08-29", end: "2026-09-25", timezone: "Asia/Seoul" },
      data_coverage_start: null, learner_model_version: "lm-rule-v1", assistance_policy: "first attempt, no hint, no reveal = independent",
      activity: { baseline: { sessions_started: 0, sessions_completed: 0, attempts: 0 }, current: { sessions_started: 1, sessions_completed: 1, attempts: 4 } },
      independent_accuracy: { metric: "independent_accuracy@1", status: "no_eligible_data", baseline: empty("independent_accuracy@1"), current: ok("independent_accuracy@1", 2, 3), absolute_pp: null, relative_pct: null, note: null },
      mean_item_band: { baseline: null, current: 2 },
      assistance: {
        baseline: { any: empty("assistance_rate@1"), hint: empty("assistance_rate@1"), reveal: empty("assistance_rate@1") },
        current: { any: ok("assistance_rate@1", 1, 4), hint: ok("assistance_rate@1", 1, 4), reveal: empty("assistance_rate@1") },
      },
      reviews: {
        baseline: { review_success: empty("review_success_rate@1"), reviews_assisted: 0, reviews_overdue_now: 0, delayed_retention: empty("delayed_retention_rate@1"), retention_participation: { completed_on_time: 0, due_in_window: 0 }, transfer: empty("transfer_performance@1") },
        current: { review_success: empty("review_success_rate@1"), reviews_assisted: 0, reviews_overdue_now: 0, delayed_retention: empty("delayed_retention_rate@1"), retention_participation: { completed_on_time: 0, due_in_window: 0 }, transfer: empty("transfer_performance@1") },
      },
      skills: [{
        skill_id: "grammar.euni_kka", skill_name: "-(으)니까", dimension: "production", metric: "mastery_change@1", baseline_mastery: 0.1, baseline_evidence_count: 9,
        current_mastery: 0.5, current_evidence_count: 1, evidence_strength: "low", model_version: "lm-rule-v1", status: "not_comparable",
        change_pp: null, note: "학습자 모델 버전이 다릅니다 (lm-rule-v0 → lm-rule-v1).", change_causes: { evidence: 1 },
      }],
      limitations: ["숙달도는 규칙 기반 추정치(lm-rule-v1)이며 보정된 확률이 아닙니다."],
    } satisfies Growth;
    api.growth.mockResolvedValue(growth);
    wrap(<LearnerDetailPage />, "/learning/learners/usr_1");
    await userEvent.click(await screen.findByRole("tab", { name: "성장 비교" }));
    expect(await screen.findByText(/비교할 수 없음 — 학습자 모델 버전이 다릅니다/)).toBeInTheDocument();
    expect(screen.queryByText(/\+40\.0%p/)).not.toBeInTheDocument();
    expect(screen.getByText("새 증거 1")).toBeInTheDocument();
    // The skill is named; its id never shows.
    expect(screen.getByText("-(으)니까")).toBeInTheDocument();
    expect(screen.getByText("산출")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("grammar.euni_kka");
  });

  it("filters evidence by a skill picked by name, never by a typed id", async () => {
    api.evidence.mockReset();
    api.evidence.mockResolvedValue({ items: [], next_before: null });
    wrap(<LearnerDetailPage />, "/learning/learners/usr_1");
    await userEvent.click(await screen.findByRole("tab", { name: "학습 증거" }));
    expect(screen.queryByRole("textbox", { name: /기술/ })).toBeNull();
    await userEvent.click(await screen.findByRole("button", { name: "기술로 거르기" }));
    await userEvent.click(await screen.findByRole("option", { name: "-(으)니까" }));
    await waitFor(() =>
      expect(api.evidence).toHaveBeenLastCalledWith("usr_1", expect.objectContaining({ skill_id: "grammar.euni_kka" })),
    );
    expect(document.body.textContent).not.toContain("grammar.euni_kka");
  });

  it("starts evidence from the newest rows again when the track changes", async () => {
    api.evidence.mockReset();
    api.evidence.mockResolvedValue({ items: [], next_before: "2026-08-15T00:00:00Z" });
    wrap(<LearnerDetailPage />, "/learning/learners/usr_1");
    await userEvent.click(await screen.findByRole("tab", { name: "학습 증거" }));
    await userEvent.click(await screen.findByRole("button", { name: "이전 기록 더 보기" }));
    await waitFor(() =>
      expect(api.evidence).toHaveBeenLastCalledWith("usr_1", expect.objectContaining({ before: "2026-08-15T00:00:00Z" })),
    );

    await userEvent.click(screen.getByRole("button", { name: "트랙" }));
    await userEvent.click(await screen.findByRole("option", { name: "TOPIK" }));
    await waitFor(() =>
      expect(api.evidence).toHaveBeenLastCalledWith("usr_1", expect.objectContaining({ track: "topik", before: undefined })),
    );
  });

  it("labels excluded and invalidated evidence and hides raw answers without transcripts access", async () => {
    api.evidence.mockResolvedValue({
      items: [{
        evidence_id: "evd_1", occurred_at: "2026-09-01T00:00:00Z", skill_id: "grammar.euni_kka", skill_name: "-(으)니까", dimension: "production", role: "primary",
        outcome: 1, policy: "revealed", exclusion_reason: "answer_revealed", weight: 0, hints_used_before: 0, mastery_before: null,
        mastery_after: null, model_version: "lm-rule-v1", review_kind: "none", invalidated_at: "2026-09-02T00:00:00Z", session_id: "ss_1",
        activity_id: "act_1", attempt_id: "sat_1", content_version_id: "cv_1", content_item_key: "sentence:s1", content_preview: "비가 오니까 우산을 가져가세요.", content_version_no: 1,
        content_review_status: "legacy_unreviewed", item_band: 2, learner_band: 2,
      }],
      next_before: null,
    });
    api.sessionTrace.mockResolvedValue({
      session_id: "ss_1", started_at: "2026-09-01T00:00:00Z", skill_names: {}, topic_names: {},
      track: "conversation", status: "completed", learner_band: 2, blueprint_version: "bp-v1", ranking_policy_version: "rank-v1",
      shortfall_reason: null, revisions: [], traces: [], activities: [],
      attempts: [{ attempt_id: "sat_1", activity_id: "act_1", attempt_no: 1, correct: true, evidence_policy: "revealed", hints_used_before: 0, answer_revealed_before: true, duration_ms: null, graded_at: "2026-09-01T00:00:00Z", answer: null }],
      answers_included: false,
    });
    wrap(<LearnerDetailPage />, "/learning/learners/usr_1");
    await userEvent.click(await screen.findByRole("tab", { name: "학습 증거" }));
    expect(await screen.findByText("정답 공개 후")).toBeInTheDocument();
    expect(screen.getByText("콘텐츠 정정으로 무효")).toBeInTheDocument();
    expect(screen.getByText("반영 안 됨")).toBeInTheDocument();
    // Skill and content are named; none of their ids show.
    expect(screen.getByText("-(으)니까 (주)")).toBeInTheDocument();
    expect(screen.getByText("비가 오니까 우산을 가져가세요.")).toBeInTheDocument();
    for (const id of ["grammar.euni_kka", "sentence:s1", "cv_1", "ss_1"]) expect(document.body.textContent).not.toContain(id);

    await userEvent.click(screen.getByRole("tab", { name: "세션·추천 근거" }));
    // The session's status reads in words ("completed" → 완료).
    await userEvent.click(await screen.findByText("완료"));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByText(/transcripts:read 권한 필요/)).toBeInTheDocument());
    expect(within(dialog).getByText("세션 시작")).toBeInTheDocument();
    expect(dialog.textContent).not.toContain("ss_1");
  });
});

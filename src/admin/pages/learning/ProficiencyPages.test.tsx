import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ToastProvider } from "../../../hooks/toast";
import { proficiencyAdminApi } from "../../proficiencyApi";
import type { ProficiencyDetail, ProficiencyRow } from "../../proficiencyApi";
import { ProficiencyLearnersPage } from "./Proficiency";
import { ProficiencyDetailPage } from "./ProficiencyDetail";
import { ProficiencyPolicyPage } from "./ProficiencyPolicy";

vi.mock("../../proficiencyApi", async () => {
  const actual = await vi.importActual<typeof import("../../proficiencyApi")>("../../proficiencyApi");
  return {
    ...actual,
    proficiencyAdminApi: {
      learners: vi.fn(),
      learner: vi.fn(),
      evidence: vi.fn(),
      growth: vi.fn(),
      cohort: vi.fn(),
      policy: vi.fn(),
      validation: vi.fn(),
      correct: vi.fn(),
      reprocess: vi.fn(),
      invalidate: vi.fn(),
    },
  };
});

const scopes = { list: ["analytics:read", "learners:read"] as string[] };
vi.mock("../../auth", () => ({
  useAdminAuth: () => ({ can: (s: string) => scopes.list.includes(s) }),
}));

const api = vi.mocked(proficiencyAdminApi);
const B = (ko: string) => ({ ko, en: ko });

function Loc() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

function wrap(ui: ReactNode, path: string, route: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={route} element={<>{ui}<Loc /></>} />
            <Route path="/learning/proficiency/:userId" element={<Loc />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const row = (over: Partial<ProficiencyRow> = {}): ProficiencyRow => ({
  user_id: "u1",
  nickname: "마리아",
  email: "ma•••@talkhangyul.co.kr",
  track: "conversation",
  status: "insufficient_evidence",
  confirmed_level: null,
  provisional_level: null,
  target_level: 1,
  study_level: 3,
  basis: null,
  coverage: { confirmed: 2, total: 4, pct: 50, target_level: 1 },
  growth: { period_days: 30, status: "insufficient_baseline", change_pp: null, segmented: false },
  last_eligible_at: "2026-10-01T09:00:00Z",
  days_since_evidence: 2,
  stalled: false,
  assessment_issues: 0,
  main_blocking: "delayed_confirmation",
  main_blocking_label: B("지연 확인(48시간 이후 재확인)"),
  last_decision_kind: "no_change",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  scopes.list = ["analytics:read", "learners:read"];
  api.cohort.mockResolvedValue({
    track: "conversation", denominator: 2, learners_without_record: 10,
    by_status: { insufficient_evidence: 1, confirmed: 1 }, confirmed_by_level: { "3": 1 }, policy_versions: {},
    note: B("레벨은 순서형이라 평균을 내지 않습니다."),
  });
});

describe("실력 판정 list", () => {
  it("shows growth in points, never a fabricated zero, and keeps filters in the URL", async () => {
    api.learners.mockResolvedValue({
      items: [row(), row({ user_id: "u2", nickname: "하이", status: "confirmed", confirmed_level: 3,
                           growth: { period_days: 30, status: "ok", change_pp: 25, segmented: false } })],
      total: 2, page: 1, page_size: 25,
    });
    wrap(<ProficiencyLearnersPage />, "/learning/proficiency", "/learning/proficiency");
    expect(await screen.findByText("마리아")).toBeInTheDocument();
    expect(screen.getByText("기준 없음")).toBeInTheDocument();
    expect(screen.getByText("+25.0%p")).toBeInTheDocument();
    expect(screen.getAllByText("2/4 (50%)")).toHaveLength(2);
    expect(screen.getByText(/평균을 내지 않습니다/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "주의 필요" }));
    await userEvent.click(await screen.findByRole("option", { name: "30일째 제자리인 회원" }));
    expect(screen.getByTestId("loc").textContent).toContain("flag=stalled");
    expect(api.learners).toHaveBeenLastCalledWith(expect.objectContaining({ flag: "stalled" }));
  });

  it("hides the export without export permission", async () => {
    api.learners.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 25 });
    wrap(<ProficiencyLearnersPage />, "/learning/proficiency", "/learning/proficiency");
    expect(await screen.findByText("조건에 맞는 회원이 없어요. 필터를 바꿔 보세요.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "CSV 내보내기" })).not.toBeInTheDocument();
  });
});

function detail(over: Partial<ProficiencyDetail> = {}): ProficiencyDetail {
  return {
    user: { user_id: "u1", nickname: "마리아", email: "ma•••@talkhangyul.co.kr" },
    conversation: {
      status: "confirmed", confirmed_level: 4, provisional_level: null, target_level: 5, at_maximum: false, study_level: 4,
      validation_status: "unvalidated", last_decision: null,
      next_level: {
        level: 5, can_do: B("문제를 해결할 수 있다"),
        capabilities: [{
          capability_id: "conv.l5.explain_problem", label: B("문제 설명하기"), success_criteria: B("x"), status: "confirmed",
          independent_successes: 3, required_successes: 3, situations: 2, required_situations: 2, study_days: 2,
          required_study_days: 2, delayed_confirmed: true, delayed_check_available_at: null, valid_failures: 0,
          latest_valid_outcome: "success", missing: [],
        }],
        coverage: { confirmed: 1, total: 1, pct: 100 },
        checklist: { pct: 75, items: [] },
        gates: [
          { gate: "required_capabilities_confirmed", label: B("필수 역량 확인"), passed: true, detail: {} },
          { gate: "integrative_assessment", label: B("종합 평가 통과"), passed: false, detail: {} },
        ],
        ready: false, integrative: null, unseen_tasks_left: 8,
      },
      next_activity: { kind: "integrative", reason: B("종합 평가를 받아 보세요") },
    },
    topik: {
      status: "unassessed", confirmed_grade: null, provisional_grade: null, target_grade: null, basis: null, mocks_taken: 0,
      readiness: {
        I: { status: "unassessed", grade: null, basis: "app_mock_unvalidated", reasons: [], weak_sections: [], latest_section_scores: {} },
        II: { status: "unassessed", grade: null, basis: "app_mock_unvalidated", reasons: [], weak_sections: [], latest_section_scores: {} },
      },
    },
    states: {},
    decisions: [],
    level_history: [{
      track: "track_conversation", from_level: 1, to_level: 2, source: "auto_promote",
      label: B("기존 활동 기반 진급(레거시)"), kind: "study_level", occurred_at: "2026-09-01T00:00:00Z",
    }],
    issues: { technical: 1, pending_scoring: 0, uncertain: 0, integrity_flags: 0, performance_gaps: 2 },
    dimension_trends: [],
    how_calculated: { manual: "docs/learning/level-up-criteria-manual.ko.md", policy_version: "conv-promo-v1", framework_version: "conv-fw-v1" },
    can_correct: false,
    can_read_transcripts: false,
    ...over,
  };
}

describe("실력 판정 detail", () => {
  it("never calls 100% capability coverage promotion-ready while a gate is open", async () => {
    api.learner.mockResolvedValue(detail());
    wrap(<ProficiencyDetailPage />, "/learning/proficiency/u1", "/learning/proficiency/:userId");
    expect(await screen.findByText("1/1 (100%)")).toBeInTheDocument();
    expect(screen.getByText("필수 조건이 남아 있음 — 승급 준비 완료 아님")).toBeInTheDocument();
    expect(screen.getByText(/기술 오류\(녹음 등\) 1/)).toBeInTheDocument();
    expect(screen.getByText(/실제 수행 부족 2/)).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "정정·재처리" })).not.toBeInTheDocument();
  });

  it("labels the retired rule's levels as legacy history", async () => {
    api.learner.mockResolvedValue(detail());
    wrap(<ProficiencyDetailPage />, "/learning/proficiency/u1", "/learning/proficiency/:userId");
    await userEvent.click(await screen.findByRole("tab", { name: "판정 이력" }));
    expect(screen.getByText("기존 활동 기반 진급(레거시)")).toBeInTheDocument();
    expect(screen.getByText(/확인된 실력 레벨로 인정하지 않습니다/)).toBeInTheDocument();
  });

  it("lets a permitted admin correct only with a reason", async () => {
    api.learner.mockResolvedValue(detail({ can_correct: true }));
    api.correct.mockResolvedValue({ decision_id: "pdc_1" });
    wrap(<ProficiencyDetailPage />, "/learning/proficiency/u1", "/learning/proficiency/:userId");
    await userEvent.click(await screen.findByRole("tab", { name: "정정·재처리" }));
    const submit = screen.getByRole("button", { name: "정정 기록" });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText("사유(10자 이상)"), "외부 시험 결과로 확인한 정정입니다");
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    expect(api.correct).toHaveBeenCalledWith("u1", expect.objectContaining({ track: "conversation", reason: "외부 시험 결과로 확인한 정정입니다" }));
  });
});

describe("판정 기준·검증", () => {
  it("states that every threshold is a provisional policy and shows validation status", async () => {
    api.policy.mockResolvedValue({
      conversation: {
        framework_version: "conv-fw-v1", bank_version: "conv-bank-v1", bank_validation_status: "unvalidated",
        rubric_version: "conv-rubric-v1", rubric: [{ dimension: "task_fulfillment", label: "과제 수행", weight: 0.3 }],
        policy: { version: "conv-promo-v1", status: "provisional_operating_policy", delayed_check_hours: 48 },
        levels: [{ level: 1, can_do: "기본 정보", capabilities: ["자기소개"] }],
      },
      topik: { policy_version: "topik-ready-v1", score_scale: "app_mock_raw_v1", form_validation: "app_mock_unvalidated",
               specs: [{ spec_version: "topik-pbt-II-v1", format: "pbt", total_max: 300, grade_bands: [[3, 120, 149]], delivered: true }] },
      provenance: { eligible_activity_types: ["conv_integrative"], excluded_sources: ["lecture_checkpoint"] },
      manual: "docs/learning/level-up-criteria-manual.ko.md",
    });
    api.validation.mockResolvedValue({
      ratings: { total: 0, human: 0, model: 0, by_split: {} },
      human_human: { n: 0, exact: null, adjacent: null, mean_abs_diff: null },
      model_vs_human: {}, by_background_proxy: {}, by_recording_condition: {},
      leakage: { learners_in_both_splits: [], families_in_both_splits: [] },
      post_promotion: { promoted_learners: 0, observations: 0, success_rate: null },
      status: "insufficient_validation_data",
      claim: B("자동 테스트와 이 보고서는 평가 타당성을 증명하지 않습니다."),
    });
    wrap(<ProficiencyPolicyPage />, "/learning/proficiency-policy", "/learning/proficiency-policy");
    expect(await screen.findByText(/검증 전의 잠정 운영 정책/)).toBeInTheDocument();
    expect(screen.getByText("교육 전문가 검증 전")).toBeInTheDocument();
    expect(await screen.findByText("검증 자료 부족")).toBeInTheDocument();
    expect(screen.getByText(/공식 점수 아님/)).toBeInTheDocument();
    const excluded = screen.getByText("lecture_checkpoint");
    expect(within(excluded.closest(".hgadm-card") as HTMLElement).getByText("절대 증거가 되지 않는 활동")).toBeInTheDocument();
  });
});

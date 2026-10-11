import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../../hooks/toast";
import { RecommendationsPage } from "./Recommendations";
import { learningApi } from "../../learningApi";
import type { RecDiagnostics } from "../../learningApi";

vi.mock("../../learningApi", () => ({
  learningApi: {
    recommendations: vi.fn(),
    traces: vi.fn(),
    simulate: vi.fn(),
    learners: vi.fn(),
    topics: vi.fn(),
    metricDefinitions: vi.fn().mockResolvedValue({ reporting_timezone: "Asia/Seoul", metrics: [] }),
  },
}));

let scopes: string[] = ["analytics:read"];
vi.mock("../../auth", () => ({
  useAdminAuth: () => ({ status: "signed-in", can: (s: string) => scopes.includes(s) }),
}));

const diagnostics: RecDiagnostics = {
  window: { start: "2026-08-30", end: "2026-09-26", timezone: "Asia/Seoul" },
  assemblies: 7,
  shorter_sessions: 2,
  excluded_by_reason: { level_bound: 40, prerequisite_unmet: 3 },
  fallbacks: { "shorter_session:insufficient_eligible_inventory": 2 },
  assembly_latency_ms: { p50: 12, p95: 40, n: 7 },
  customizations: {
    total: 0,
    by_status: {},
    by_fallback_step: {},
    by_interpreter: {},
    unmet_constraints: {},
    conflicts: 0,
    recomputes: 0,
    latency_ms: { p50: null, p95: null, n: 0 },
  },
  unwanted_repetition: {
    metric: "unwanted_repetition_rate@1",
    status: "no_eligible_data",
    value: null,
    numerator: 0,
    denominator: 0,
  },
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/learning/recommendations"]}>
          <RecommendationsPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("RecommendationsPage", () => {
  beforeEach(() => {
    vi.mocked(learningApi.recommendations).mockReset().mockResolvedValue(diagnostics);
    vi.mocked(learningApi.traces).mockReset().mockResolvedValue({ items: [] });
    vi.mocked(learningApi.topics).mockReset().mockResolvedValue({
      items: [
        { topic_id: "topic.travel", name_ko: "여행" },
        { topic_id: "topic.food", name_ko: "음식" },
      ],
    });
    vi.mocked(learningApi.learners).mockReset().mockResolvedValue({
      items: [{ user_id: "usr_42", email_masked: "ji•••@example.com", nickname: "지수", last_study_at: null, evidence_count: 0, overdue_reviews: 0, labels: [] }],
      total: 1,
      page: 1,
      page_size: 8,
    });
    vi.mocked(learningApi.simulate).mockReset().mockResolvedValue({
      simulation: true,
      learner_band: 2,
      candidates_considered: 10,
      candidates_eligible: 4,
      excluded_by_reason: {},
      shortfall_reason: null,
      selected: [
        {
          version_id: "cv_9",
          item_key: "quiz:quz_0444235d70c8",
          preview: "비가 오니까 우산을 가져가세요.",
          phase: "new",
          review_kind: "none",
          primary_skill_id: "grammar.euni_kka",
          primary_skill_name: "-(으)니까",
          band: 2,
          topic_id: "topic.travel",
          topic_name: "여행",
          score: 0.5,
          components: {},
          predicted_success: 0.7,
        },
      ],
    });
    scopes = ["analytics:read"];
  });

  it("labels exclusion reasons in Korean and never shows 0% for an empty denominator", async () => {
    renderPage();
    expect(await screen.findByText("레벨 범위 밖")).toBeInTheDocument();
    expect(screen.getByText("선수 기술 미충족")).toBeInTheDocument();
    expect(screen.getAllByText("아직 데이터 없음").length).toBeGreaterThan(0);
    expect(screen.queryByText("0.0%")).not.toBeInTheDocument();
  });

  it("hides the simulation panel without learners:read", async () => {
    renderPage();
    await screen.findByText("레벨 범위 밖");
    expect(screen.queryByText(/미리보기 — 저장되지 않음/)).not.toBeInTheDocument();
  });

  it("labels the simulation panel as not saved when shown", async () => {
    scopes = ["analytics:read", "learners:read"];
    renderPage();
    expect(await screen.findByText("미리보기 — 저장되지 않음")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "미리 구성해 보기" })).toBeDisabled();
  });

  it("picks the learner and topics by name and shows results without ids", async () => {
    scopes = ["analytics:read", "learners:read"];
    renderPage();
    await screen.findByText("미리보기 — 저장되지 않음");
    expect(screen.queryByText(/ID/)).not.toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("닉네임으로 검색"), "지수{Enter}");
    await userEvent.click(await screen.findByRole("button", { name: /지수 · ji•••@example\.com/ }));
    await userEvent.click(await screen.findByRole("checkbox", { name: "여행" }));
    await userEvent.click(screen.getByRole("button", { name: "미리 구성해 보기" }));

    await waitFor(() =>
      expect(learningApi.simulate).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: "usr_42", topic_preferences: ["topic.travel"] }),
      ),
    );
    expect(await screen.findByText("비가 오니까 우산을 가져가세요.")).toBeInTheDocument();
    expect(screen.getByText("-(으)니까")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/usr_42|quz_0444235d70c8|grammar\.euni_kka|topic\.travel|cv_9/);
  });
});

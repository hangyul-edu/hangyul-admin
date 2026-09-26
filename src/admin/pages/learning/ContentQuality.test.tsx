import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../../hooks/toast";
import { ContentQualityPage } from "./ContentQuality";
import { learningApi } from "../../learningApi";
import type { ContentVersionDetail } from "../../learningApi";

vi.mock("../../learningApi", async () => {
  const actual = await vi.importActual<typeof import("../../learningApi")>("../../learningApi");
  return {
    ...actual,
    learningApi: {
      ...actual.learningApi,
      coverage: vi.fn(),
      content: vi.fn(),
      versions: vi.fn(),
      version: vi.fn(),
      publishVersion: vi.fn(),
      blindView: vi.fn(),
      blindSolve: vi.fn(),
      metricDefinitions: vi.fn(),
    },
  };
});

let scopes: string[] = ["content:read"];
vi.mock("../../auth", () => ({
  useAdminAuth: () => ({
    status: "signed-in",
    me: null,
    login: vi.fn(),
    logout: vi.fn(),
    can: (scope: string) => scopes.includes(scope),
  }),
}));

const api = vi.mocked(learningApi);

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <ContentQualityPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const SUMMARY = {
  version_id: "cv_1",
  item_key: "quiz:q1",
  item_kind: "quiz",
  version_no: 1,
  lifecycle: "in_review",
  review_status: "pending",
  track: "topik",
  band: 2,
  task_type: "reading_01",
  topic_id: null,
  is_scored_objective: true,
  validation_passed: true,
  preview: "( ) 비가 와서 집에 있었어요.",
  created_at: "2026-09-26T00:00:00Z",
};

const DETAIL: ContentVersionDetail = {
  ...SUMMARY,
  public_payload: { prompt: "빈칸", choices: ["어제", "내일"], choice_keys: ["1", "2"] },
  answer_key: { correct_answer: "1" },
  explanations: [],
  skills: [],
  validation: [],
  reviews: [],
  actions: [],
  issues: [],
  provenance: {},
  authoring_method: "human",
  source_use: "original",
  difficulty_estimate: 0.2,
  difficulty_method: "editorial_level_v1",
  retirement_reason: null,
  retirement_severity: null,
  publication_check: { policy: "pub-v1", allowed: false, blockers: ["blind_solve_missing"] },
};

describe("ContentQualityPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scopes = ["content:read"];
    api.metricDefinitions.mockResolvedValue({ reporting_timezone: "Asia/Seoul", metrics: [] });
    api.versions.mockResolvedValue({ items: [SUMMARY], total: 1, page: 1, page_size: 25 });
    api.version.mockResolvedValue(DETAIL);
  });

  it("renders shortage badges from coverage", async () => {
    api.coverage.mockResolvedValue({
      model_version: "coverage-v1",
      assumptions: { new_items_per_session: 6, sessions_per_week: 5, variation_weeks: 4, customization_headroom: 1.5, required_new_items: 180 },
      bands: [
        { track: "topik", band: 3, eligible: 12, approved: 0, legacy_unreviewed: 12, required_new_items: 180, shortage: 168, status: "short" },
        { track: "topik", band: 4, eligible: 200, approved: 10, legacy_unreviewed: 190, required_new_items: 180, shortage: 0, status: "ok" },
      ],
      skills: [],
      topics: [],
      modalities: [],
      lifecycle: [],
      eligible_without_skill_link: 3,
    });
    renderAt("/learning/content");
    expect(await screen.findByText("부족")).toBeInTheDocument();
    expect(screen.getByText("충분")).toBeInTheDocument();
    expect(screen.getByText("168")).toBeInTheDocument();
  });

  it("shows 대상 데이터 없음 for a ratio with no eligible data", async () => {
    api.content.mockResolvedValue({
      items: [
        {
          version_id: "cv_1",
          item_key: "quiz:q1",
          version_no: 1,
          track: "topik",
          band: 2,
          task_type: "reading_01",
          review_status: "legacy_unreviewed",
          lifecycle: "published",
          exposures: 2,
          first_attempts: 0,
          independent_accuracy: { metric: "independent_accuracy@1", status: "no_eligible_data", value: null, numerator: 0, denominator: 0 },
          independent_accuracy_by_learner_band: {},
          assisted_first_attempts: 0,
          editorial_difficulty: 0.2,
          observed_difficulty: null,
          choice_distribution: {},
          correct_choice: "1",
          issues: {},
        },
      ],
      total: 1,
      page: 1,
      page_size: 25,
      review_backlog: {},
      open_issues: 0,
    });
    renderAt("/learning/content?tab=diagnostics");
    expect(await screen.findByText("대상 데이터 없음")).toBeInTheDocument();
    expect(screen.queryByText("0.0%")).not.toBeInTheDocument();
  });

  it("hides publish without content:publish", async () => {
    renderAt("/learning/content?tab=queue");
    await userEvent.click(await screen.findByText(SUMMARY.preview));
    expect(await screen.findByText("블라인드 풀이 없음")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "게시" })).not.toBeInTheDocument();
  });

  it("publishes with content:publish", async () => {
    scopes = ["content:read", "content:publish"];
    api.publishVersion.mockResolvedValue({ ...DETAIL, lifecycle: "published" });
    renderAt("/learning/content?tab=queue");
    await userEvent.click(await screen.findByText(SUMMARY.preview));
    await userEvent.click(await screen.findByRole("button", { name: "게시" }));
    await waitFor(() => expect(api.publishVersion).toHaveBeenCalledWith("cv_1"));
  });

  it("blind solve never loads the version detail (with its key)", async () => {
    scopes = ["content:read", "content:review"];
    api.blindView.mockResolvedValue({
      version_id: "cv_1",
      item_kind: "quiz",
      task_type: "reading_01",
      band: 2,
      public_payload: { prompt: "빈칸", choices: ["어제", "내일"], choice_keys: ["1", "2"] },
      answer_format_hint: "choice key, e.g. 2",
    });
    api.blindSolve.mockResolvedValue({ review_id: "crv_1", agrees_with_key: true });
    renderAt("/learning/content?tab=queue");
    await userEvent.click(await screen.findByRole("button", { name: "블라인드 풀이" }));
    await userEvent.type(await screen.findByLabelText("내 답"), "1");
    await userEvent.click(screen.getByRole("button", { name: "제출" }));
    await waitFor(() => expect(api.blindSolve).toHaveBeenCalledWith("cv_1", { answer: "1" }));
    expect(api.version).not.toHaveBeenCalled();
  });
});

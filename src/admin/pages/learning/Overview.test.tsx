/**
 * The overview opens on `analytics:read`, but its "자세히 보기" links lead to
 * pages gated on other scopes. An analyst holds analytics:read and not
 * learners:read, so the review-success row used to send them straight into
 * 접근 권한이 없습니다 — a page the sidebar already hides from them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { learningApi } from "../../learningApi";
import type { Overview, OverviewSide, Ratio } from "../../learningApi";
import { LearningOverviewPage } from "./Overview";

vi.mock("../../learningApi", async () => {
  const actual = await vi.importActual<typeof import("../../learningApi")>("../../learningApi");
  return {
    ...actual,
    learningApi: { ...actual.learningApi, overview: vi.fn(), metricDefinitions: vi.fn() },
  };
});

let scopes: string[] = [];
vi.mock("../../auth", () => ({
  useAdminAuth: () => ({ can: (s: string) => scopes.includes(s) }),
}));

const ratio = (metric: string): Ratio => ({
  metric: `${metric}@1`,
  status: "ok",
  value: 0.5,
  numerator: 1,
  denominator: 2,
});

function side(): OverviewSide {
  return {
    active_learners: { metric: "active_learners@1", value: 3 },
    sessions_started: 4,
    sessions_mature: 4,
    assistance_breakdown: { hint: 0, reveal: 0 },
    reviews_assisted: 0,
    customization_statuses: {},
    tutor_turns_by_route: {},
    ai_cost: {
      metric: "ai_cost@1",
      currency: "USD",
      attributed_cents_estimated: 0,
      unattributed_cents_estimated: 0,
      calls_cost_unavailable: 0,
      per_session_cents: null,
      denominator: "sessions",
      status: "no_eligible_data",
    },
    session_completion_rate: ratio("session_completion_rate"),
    independent_accuracy: ratio("independent_accuracy"),
    assistance_rate: ratio("assistance_rate"),
    review_success_rate: ratio("review_success_rate"),
    delayed_retention_rate: ratio("delayed_retention_rate"),
    customization_success_rate: ratio("customization_success_rate"),
    retrieval_fulfillment_rate: ratio("retrieval_fulfillment_rate"),
    content_defect_rate: ratio("content_defect_rate"),
  };
}

const OVERVIEW: Overview = {
  timezone: "Asia/Seoul",
  current_window: { start: "2026-09-01", end: "2026-09-28", timezone: "Asia/Seoul" },
  comparison_window: { start: "2026-08-04", end: "2026-08-31", timezone: "Asia/Seoul" },
  freshness: { daily_activity_last_success_at: null, daily_activity_lag_events: 0, stale: false, note: "" },
  current: side(),
  comparison: side(),
  changes: {},
  caution: "",
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/learning"]}>
        <LearningOverviewPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const detailLinks = () =>
  screen.queryAllByRole("link", { name: "자세히 보기" }).map((a) => a.getAttribute("href"));

beforeEach(() => {
  vi.mocked(learningApi.overview).mockResolvedValue(OVERVIEW);
  vi.mocked(learningApi.metricDefinitions).mockResolvedValue({ reporting_timezone: "Asia/Seoul", metrics: [] });
});

describe("LearningOverviewPage drill-down links", () => {
  it("offers the learners drill-down only to a tier that can open it", async () => {
    scopes = ["analytics:read", "content:read"]; // analyst
    renderPage();
    await screen.findByText("학습 성과");
    expect(detailLinks()).not.toContain("/learning/learners?review_overdue=true");
    expect(detailLinks()).toContain("/learning/cohorts");
    expect(detailLinks()).toContain("/learning/content");
  });

  it("judges a change by the metric's good direction, not by its sign", async () => {
    scopes = ["analytics:read"];
    const change = (metric: string, pp: number) => ({
      metric: `${metric}@1`, status: "ok" as const, baseline: ratio(metric), current: ratio(metric),
      absolute_pp: pp, relative_pct: pp * 2, note: null,
    });
    vi.mocked(learningApi.overview).mockResolvedValue({
      ...OVERVIEW,
      changes: {
        independent_accuracy: change("independent_accuracy", 4), // up is good
        assistance_rate: change("assistance_rate", 4), // up is bad
      },
    });
    renderPage();
    await screen.findByText("학습 성과");
    const verdicts = screen.getAllByText("+4.0%p").map((el) => el.closest(".hgins-trend")?.className);
    expect(verdicts).toContainEqual(expect.stringContaining("hgins-trend--good"));
    expect(verdicts).toContainEqual(expect.stringContaining("hgins-trend--bad"));
  });

  it("keeps it for a tier with learners:read", async () => {
    scopes = ["analytics:read", "content:read", "learners:read"];
    renderPage();
    await screen.findByText("학습 성과");
    expect(detailLinks()).toContain("/learning/learners?review_overdue=true");
  });
});

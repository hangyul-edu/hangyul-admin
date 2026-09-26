import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
    scopes = ["analytics:read"];
  });

  it("labels exclusion reasons in Korean and never shows 0% for an empty denominator", async () => {
    renderPage();
    expect(await screen.findByText("레벨 범위 밖")).toBeInTheDocument();
    expect(screen.getByText("선수 기술 미충족")).toBeInTheDocument();
    expect(screen.getAllByText("대상 데이터 없음").length).toBeGreaterThan(0);
    expect(screen.queryByText("0.0%")).not.toBeInTheDocument();
  });

  it("hides the simulation panel without learners:read", async () => {
    renderPage();
    await screen.findByText("레벨 범위 밖");
    expect(screen.queryByText(/시뮬레이션 — 저장되지 않음/)).not.toBeInTheDocument();
  });

  it("labels the simulation panel as not saved when shown", async () => {
    scopes = ["analytics:read", "learners:read"];
    renderPage();
    expect(await screen.findByText("시뮬레이션 — 저장되지 않음")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "시뮬레이션 실행" })).toBeDisabled();
  });
});

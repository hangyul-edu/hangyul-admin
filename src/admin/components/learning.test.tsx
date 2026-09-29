/**
 * Metric labels read the server's metric dictionary, which is gated on
 * `analytics:read`. Labels also appear on a learner's growth tab, which a
 * support agent (`learners:read` without `analytics:read`) can open — they
 * must get a plain answer rather than a request that 403s and a
 * "loading…" line that never resolves.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { learningApi } from "../learningApi";
import { MetricLabel } from "./learning";

vi.mock("../learningApi", async () => {
  const actual = await vi.importActual<typeof import("../learningApi")>("../learningApi");
  return { ...actual, learningApi: { ...actual.learningApi, metricDefinitions: vi.fn() } };
});

let scopes: string[] = [];
vi.mock("../auth", () => ({
  useAdminAuth: () => ({ can: (s: string) => scopes.includes(s) }),
}));

const metricDefinitions = vi.mocked(learningApi.metricDefinitions);

function renderLabel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MetricLabel metric="accuracy@1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  metricDefinitions.mockReset();
  metricDefinitions.mockResolvedValue({
    reporting_timezone: "Asia/Seoul",
    metrics: [
      {
        metric_id: "accuracy",
        version: 1,
        label_ko: "정답률",
        numerator: "정답 수",
        denominator: "시도 수",
        inclusion: "",
        exclusion: "",
        window: "28일",
        timezone: "Asia/Seoul",
        source: "attempts",
        freshness: "실시간",
        limitations: "",
      },
    ] as never,
  });
});

describe("MetricLabel", () => {
  it("shows the server definition to a tier with analytics:read", async () => {
    scopes = ["analytics:read"];
    renderLabel();
    expect(await screen.findByText("정답률")).toBeInTheDocument();
    expect(metricDefinitions).toHaveBeenCalled();
  });

  it("does not request the dictionary without analytics:read, and says why", () => {
    scopes = ["learners:read"];
    renderLabel();
    expect(metricDefinitions).not.toHaveBeenCalled();
    expect(screen.queryByText(/불러오는 중/)).not.toBeInTheDocument();
    expect(screen.getByText(/학습 통계 조회 권한/)).toBeInTheDocument();
  });
});

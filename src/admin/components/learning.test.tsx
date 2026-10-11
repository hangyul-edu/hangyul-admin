/**
 * Metric labels read the server's metric dictionary, which is gated on
 * `analytics:read`. Labels also appear on a learner's growth tab, which a
 * support agent (`learners:read` without `analytics:read`) can open — they
 * must get a plain answer rather than a request that 403s and a
 * "loading…" line that never resolves.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("does not request the dictionary without analytics:read, and says why", async () => {
    scopes = ["learners:read"];
    renderLabel();
    expect(metricDefinitions).not.toHaveBeenCalled();
    // The explanation sits behind the label's "?".
    await userEvent.click(screen.getByRole("button", { name: /설명 보기/ }));
    expect(screen.queryByText(/불러오는 중/)).not.toBeInTheDocument();
    expect(screen.getByText(/학습 통계 조회 권한/)).toBeInTheDocument();
  });

  it("puts a known metric's plain name first, with its meaning and exact definition behind the ?", async () => {
    scopes = ["analytics:read"];
    metricDefinitions.mockResolvedValue({
      reporting_timezone: "Asia/Seoul",
      metrics: [
        {
          metric_id: "independent_accuracy", version: 2, label_ko: "독립 정답률",
          numerator: "첫 시도 정답 수", denominator: "첫 시도 수", inclusion: "", exclusion: "",
          window: "28일", timezone: "Asia/Seoul", source: "attempts", freshness: "실시간", limitations: "",
        },
      ] as never,
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MetricLabel metric="independent_accuracy@2" />
      </QueryClientProvider>,
    );
    expect(screen.getByText("스스로 맞힌 비율")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "스스로 맞힌 비율 설명 보기" }));
    expect(screen.getByText(/힌트나 정답 보기 없이/)).toBeInTheDocument();
    expect(await screen.findByText("첫 시도 정답 수 ÷ 첫 시도 수")).toBeInTheDocument();
  });
});

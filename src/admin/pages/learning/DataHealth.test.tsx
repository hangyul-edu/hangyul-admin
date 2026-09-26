import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DataHealthPage } from "./DataHealth";
import { learningApi } from "../../learningApi";
import type { DataHealth } from "../../learningApi";

vi.mock("../../learningApi", () => ({
  learningApi: { dataHealth: vi.fn() },
}));

const dataHealth = vi.mocked(learningApi.dataHealth);

function healthy(): DataHealth {
  return {
    generated_at: new Date().toISOString(),
    ingestion: {
      max_seq: 10,
      last_received_at: new Date().toISOString(),
      events_24h: 10,
      client_events_24h: 1,
      clock_skew_clamped_24h: 0,
      synthetic_events_total: 0,
    },
    consumers: [
      {
        consumer: "daily_activity",
        last_seq: 10,
        lag_events: 0,
        last_success_at: new Date().toISOString(),
        events_processed: 10,
        duplicates_suppressed: 0,
        error_count: 0,
        last_error: null,
      },
    ],
    recent_runs: [
      {
        run_id: "ajr_1",
        job: "projection:daily_activity",
        kind: "projection",
        status: "succeeded",
        dry_run: false,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        processed: 10,
        watermark_seq: 10,
        discrepancies: [],
        error: null,
      },
    ],
    failed_runs_24h: 0,
    pending_erasures: 0,
  };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/learning/data-health"]}>
        <DataHealthPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("DataHealthPage", () => {
  beforeEach(() => dataHealth.mockReset());

  it("says everything is fine only when it is", async () => {
    dataHealth.mockResolvedValue(healthy());
    renderPage();
    expect(await screen.findByText(/모든 집계가 정상입니다/)).toBeInTheDocument();
  });

  it("warns when a projection lags, errors or a check found a discrepancy", async () => {
    const d = healthy();
    d.consumers[0] = { ...d.consumers[0], lag_events: 42, error_count: 1, last_error: "boom" };
    d.recent_runs[0] = { ...d.recent_runs[0], kind: "reconciliation", discrepancies: [{ metric: "attempts", source: 3, events: 2 }] };
    dataHealth.mockResolvedValue(d);
    renderPage();
    expect(await screen.findByText("확인 필요")).toBeInTheDocument();
    expect(screen.queryByText(/모든 집계가 정상입니다/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/미처리 이벤트 42건/).length).toBeGreaterThan(0);
    expect(screen.getByText(/불일치가 발견된 점검 1건/)).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("treats a projection that has never succeeded as stale", async () => {
    const d = healthy();
    d.consumers[0] = { ...d.consumers[0], last_success_at: null };
    dataHealth.mockResolvedValue(d);
    renderPage();
    expect(await screen.findByText("확인 필요")).toBeInTheDocument();
    expect(screen.getAllByText(/15분 넘게 갱신 안 됨/).length).toBeGreaterThan(0);
  });
});

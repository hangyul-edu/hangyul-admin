import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../../hooks/toast";
import { CohortsPage } from "./Cohorts";
import { learningApi } from "../../learningApi";
import type { Cohorts, Ratio } from "../../learningApi";

vi.mock("../../learningApi", () => ({
  learningApi: {
    cohorts: vi.fn(),
    createExport: vi.fn(),
    downloadExport: vi.fn(),
    metricDefinitions: vi.fn().mockResolvedValue({ reporting_timezone: "Asia/Seoul", metrics: [] }),
  },
}));

let scopes: string[] = ["analytics:read"];
vi.mock("../../auth", () => ({
  useAdminAuth: () => ({ status: "signed-in", can: (s: string) => scopes.includes(s) }),
}));

const cohorts = vi.mocked(learningApi.cohorts);

function ratio(partial: Partial<Ratio>): Ratio {
  return { metric: "return_retention_d7@1", status: "ok", value: null, numerator: 0, denominator: 0, ...partial };
}

const suppressedData: Cohorts = {
  timezone: "Asia/Seoul",
  definition: "exact-day return",
  granularity: "week",
  small_cell_suppression: 5,
  cohorts: [
    {
      cohort: "2026-09-01",
      size: null,
      d1: ratio({ status: "suppressed", note: "n<5" }),
      d7: ratio({ status: "suppressed", note: "n<5" }),
      d30: ratio({ status: "no_eligible_data" }),
      d1_not_yet_eligible: 0,
      d7_not_yet_eligible: 2,
      d30_not_yet_eligible: 3,
    },
  ],
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/learning/cohorts"]}>
          <CohortsPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("CohortsPage", () => {
  beforeEach(() => {
    cohorts.mockReset();
    scopes = ["analytics:read"];
  });

  it("shows suppressed cells as hidden, never as a percentage", async () => {
    cohorts.mockResolvedValue(suppressedData);
    renderPage();
    expect(await screen.findByText("2026-09-01")).toBeInTheDocument();
    expect(screen.getByText("숨김")).toBeInTheDocument();
    expect(screen.getAllByText(/표본이 적어 숨김/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
    expect(screen.getByText(/표본 5명 미만인 칸은 숨겨요/)).toBeInTheDocument();
  });

  it("shows how many members are not yet eligible", async () => {
    cohorts.mockResolvedValue(suppressedData);
    renderPage();
    expect(await screen.findByText("아직 날짜가 안 된 회원 2명")).toBeInTheDocument();
    expect(screen.getByText("아직 날짜가 안 된 회원 3명")).toBeInTheDocument();
  });

  it("renders a value with its sample size when eligible", async () => {
    cohorts.mockResolvedValue({
      ...suppressedData,
      small_cell_suppression: null,
      cohorts: [
        {
          ...suppressedData.cohorts[0],
          size: 12,
          d7: ratio({ value: 0.5, numerator: 5, denominator: 10 }),
        },
      ],
    });
    renderPage();
    expect(await screen.findByText("50.0%")).toBeInTheDocument();
    expect(screen.getByText("5 / 10")).toBeInTheDocument();
  });

  it("hides the export button without exports:create", async () => {
    cohorts.mockResolvedValue(suppressedData);
    renderPage();
    await screen.findByText("2026-09-01");
    expect(screen.queryByRole("button", { name: "CSV 내보내기" })).not.toBeInTheDocument();
  });

  it("shows the export button with exports:create", async () => {
    scopes = ["analytics:read", "exports:create"];
    cohorts.mockResolvedValue(suppressedData);
    renderPage();
    expect(await screen.findByRole("button", { name: "CSV 내보내기" })).toBeInTheDocument();
  });
});

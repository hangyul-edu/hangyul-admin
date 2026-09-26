import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../../hooks/toast";
import { AiOpsPage } from "./AiOps";
import { learningApi } from "../../learningApi";

vi.mock("../../learningApi", async () => {
  const actual = await vi.importActual<typeof import("../../learningApi")>("../../learningApi");
  return {
    ...actual,
    learningApi: {
      ...actual.learningApi,
      aiFeatures: vi.fn(),
      updateAiFeature: vi.fn(),
      aiUsage: vi.fn(),
      tutorTurns: vi.fn(),
      tutorReliability: vi.fn(),
      reviewTutorTurn: vi.fn(),
    },
  };
});

let scopes: string[] = ["ai:read"];
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

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/learning/ai"]}>
          <AiOpsPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const EMPTY_RATIO = { metric: "tutor_reliability@1", status: "no_eligible_data" as const, value: null, numerator: 0, denominator: 0 };

describe("AiOpsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scopes = ["ai:read"];
    api.aiFeatures.mockResolvedValue({
      rate_card_version: "rc-2026-09-26",
      currency: "USD",
      features: [
        {
          feature: "customization.interpret",
          tier: "generation",
          enabled: true,
          disabled_reason: null,
          per_user_daily_cents: 20,
          monthly_cents: 0,
          timeout_seconds: 8,
          max_attempts: 2,
          overridden: false,
          updated_by: null,
          month_to_date_cents_estimated: 150,
        },
      ],
    });
    api.aiUsage.mockResolvedValue({
      window_days: 7,
      currency: "USD",
      rate_card_version: "rc-2026-09-26",
      cost_note: "Estimated from the rate card.",
      groups: [],
      legacy_unattributed: { calls: 0, cost_cents: 0, by_purpose: {} },
    });
    api.tutorReliability.mockResolvedValue({
      overall: { ...EMPTY_RATIO, leaks: 0 },
      by_route: {},
      learner_satisfaction: { up: 0, down: 0 },
      note: "",
    });
    api.tutorTurns.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 25, transcripts_included: false });
  });

  it("hides the toggle without ai:write and says transcripts are restricted", async () => {
    renderPage();
    expect(await screen.findByText("맞춤화 요청 해석")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "끄기" })).not.toBeInTheDocument();
    expect(await screen.findByText("대화 원문은 transcripts:read 권한이 필요합니다.")).toBeInTheDocument();
    // Empty reliability sample and empty tables say so, never 0%.
    expect((await screen.findAllByText("대상 데이터 없음")).length).toBeGreaterThan(0);
    expect(screen.queryByText("0.0%")).not.toBeInTheDocument();
  });

  it("turns a feature off with a reason when allowed", async () => {
    scopes = ["ai:read", "ai:write"];
    api.updateAiFeature.mockResolvedValue({ feature: "customization.interpret", enabled: false });
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "끄기" }));
    await userEvent.type(screen.getByLabelText("사유"), "provider incident");
    await userEvent.click(screen.getByRole("button", { name: "적용" }));
    await waitFor(() =>
      expect(api.updateAiFeature).toHaveBeenCalledWith("customization.interpret", {
        enabled: false,
        reason: "provider incident",
      }),
    );
  });
});

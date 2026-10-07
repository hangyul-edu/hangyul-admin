/**
 * Plan management edits what a plan unlocks (`entitlements`) apart from its
 * display copy (`features`). The API is stubbed, so these assertions are about
 * what the form sends and shows.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import type { Plan } from "../api";

const listPlans = vi.fn();
const createPlan = vi.fn();
const updatePlan = vi.fn();

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      listPlans: () => listPlans(),
      createPlan: (b: unknown) => createPlan(b),
      updatePlan: (id: string, b: unknown) => updatePlan(id, b),
    },
  };
});
vi.mock("../auth", () => ({ useAdminAuth: () => ({ can: () => true }) }));

const { PlansPage } = await import("./Plans");

const MONTHLY: Plan = {
  plan_id: "plan_monthly",
  name: "Monthly",
  description: null,
  price_cents: 1299,
  currency: "USD",
  interval: "month",
  trial_days: 7,
  promo_price_cents: null,
  features: ["모든 레슨"],
  entitlements: ["premium_courses", "ai_tutor"],
  audience: "retention_offer",
  status: "active",
  is_public: true,
  priority: 0,
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/plans"]}>
          <PlansPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  [listPlans, createPlan, updatePlan].forEach((m) => m.mockReset());
  listPlans.mockResolvedValue({ plans: [MONTHLY] });
  createPlan.mockResolvedValue(MONTHLY);
  updatePlan.mockResolvedValue(MONTHLY);
});

describe("plan entitlements", () => {
  it("lists each plan's entitlements by their Korean names", async () => {
    renderPage();
    const row = (await screen.findByText("Monthly")).closest("tr")!;
    expect(within(row).getByText("프리미엄 강의")).toBeInTheDocument();
    expect(within(row).getByText("AI 한귤 튜터")).toBeInTheDocument();
    expect(within(row).queryByText("오프라인 저장")).toBeNull();
    expect(within(row).getByText("해지 방어 제안")).toBeInTheDocument();
  });

  it("edits the entitlement set and sends it apart from the display features", async () => {
    renderPage();
    await screen.findByText("Monthly");
    await userEvent.click(screen.getByRole("button", { name: "수정" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("checkbox", { name: "프리미엄 강의" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "오프라인 저장" })).not.toBeChecked();
    // The stored audience is selected, not a value the API does not know.
    expect(within(dialog).getByText("해지 방어 제안")).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole("checkbox", { name: "오프라인 저장" }));
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "프리미엄 강의" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(updatePlan).toHaveBeenCalled());
    const [id, body] = updatePlan.mock.calls[0];
    expect(id).toBe("plan_monthly");
    expect(body.entitlements).toEqual(["ai_tutor", "offline_download"]);
    expect(body.features).toEqual(["모든 레슨"]);
  });

  it("requires at least one entitlement", async () => {
    renderPage();
    await screen.findByText("Monthly");
    await userEvent.click(screen.getByRole("button", { name: "수정" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "프리미엄 강의" }));
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "AI 한귤 튜터" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("하나 이상");
    expect(within(dialog).getByRole("button", { name: "저장" })).toBeDisabled();
    expect(updatePlan).not.toHaveBeenCalled();
  });

  it("starts a new plan with every entitlement, like the API default", async () => {
    renderPage();
    await screen.findByText("Monthly");
    await userEvent.click(screen.getByRole("button", { name: "+ 새 요금제" }));
    const dialog = await screen.findByRole("dialog");
    for (const name of ["프리미엄 강의", "AI 한귤 튜터", "오프라인 저장", "프리미엄 콘텐츠"]) {
      expect(within(dialog).getByRole("checkbox", { name })).toBeChecked();
    }
    // The app has no ads: there is no ad-free option to grant.
    expect(within(dialog).queryByRole("checkbox", { name: /광고/ })).toBeNull();
  });
});

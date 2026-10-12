/**
 * 요금제 관리 shows the fixed offer slots (no creating or archiving plans),
 * the free trial as a per-member policy, monthly equivalents for yearly
 * prices, and edits prices, the badge and the new-member switch. The API is
 * stubbed, so these assertions are about what the page shows and sends.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import type { Plan } from "../api";

const listPlans = vi.fn();
const updatePlan = vi.fn();

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      listPlans: () => listPlans(),
      updatePlan: (id: string, b: unknown) => updatePlan(id, b),
    },
  };
});
vi.mock("../auth", () => ({ useAdminAuth: () => ({ can: () => true }) }));

const { PlansPage, monthlyEquivalent } = await import("./Plans");

function plan(over: Partial<Plan> & Pick<Plan, "plan_id" | "interval">): Plan {
  return {
    name: over.plan_id,
    price_cents: 1299,
    currency: "USD",
    promo_price_cents: 999,
    entitlements: ["premium_courses", "ai_tutor"],
    audience: "default",
    status: "active",
    version: 1,
    slot: { audience: "default", interval: over.interval, optional: false },
    badge_text: { ko: "", en: "" },
    badge_published: false,
    live_subscribers: 0,
    ...over,
  };
}

const MONTHLY = plan({ plan_id: "plan_monthly", name: "Monthly", interval: "month", live_subscribers: 3 });
const YEARLY = plan({
  plan_id: "plan_yearly",
  name: "Yearly",
  interval: "year",
  price_cents: 15588,
  promo_price_cents: 7188,
  badge_text: { ko: "런칭 기념 특별 할인", en: "Launch special" },
  badge_published: true,
});
const NEW_MONTHLY = plan({
  plan_id: "plan_monthly_new_user",
  name: "Monthly — New member",
  interval: "month",
  audience: "new_user",
  status: "archived",
  slot: { audience: "new_user", interval: "month", optional: true },
});
const NEW_YEARLY = plan({
  plan_id: "plan_yearly_new_user",
  name: "Yearly — New member",
  interval: "year",
  audience: "new_user",
  status: "archived",
  slot: { audience: "new_user", interval: "year", optional: true },
});

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

function card(name: string): HTMLElement {
  return screen.getByText(name).closest(".hgadm-offer") as HTMLElement;
}

beforeEach(() => {
  listPlans.mockReset();
  updatePlan.mockReset();
  listPlans.mockResolvedValue({ plans: [MONTHLY, YEARLY, NEW_MONTHLY, NEW_YEARLY], trial_days: 7 });
  updatePlan.mockResolvedValue(MONTHLY);
});

describe("요금제 관리", () => {
  it("shows the four fixed slots and no way to create or archive a plan", async () => {
    renderPage();
    await screen.findByText("Monthly");
    expect(screen.getByRole("heading", { name: "기본 요금" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "신규 회원 요금" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "수정" })).toHaveLength(4);
    expect(screen.queryByRole("button", { name: /새 요금제/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "보관" })).toBeNull();
    expect(within(card("Monthly — New member")).getByText("꺼짐")).toBeInTheDocument();
    expect(within(card("Monthly")).getByText("판매 중")).toBeInTheDocument();
    expect(within(card("Monthly")).getByText("3명")).toBeInTheDocument();
  });

  it("states the free trial once, as a per-member policy, not per plan", async () => {
    renderPage();
    expect(await screen.findByText("무료 체험 · 회원당 1회, 7일")).toBeInTheDocument();
    expect(screen.queryByText(/체험 \(일\)/)).toBeNull();
  });

  it("shows a yearly price's monthly equivalent", async () => {
    renderPage();
    const yearly = within(await screen.findByText("Yearly").then(() => card("Yearly")));
    expect(yearly.getByText("$71.88")).toBeInTheDocument();
    expect(yearly.getByText("$5.99")).toBeInTheDocument(); // 7188 / 12
    expect(yearly.getByText(/정가 월 \$12\.99/)).toBeInTheDocument();
    expect(yearly.getByText("54% 할인")).toBeInTheDocument();
    expect(within(card("Monthly")).queryByText(/월 환산/)).toBeNull();
    expect(monthlyEquivalent(15588, "year")).toBe(1299);
    expect(monthlyEquivalent(999, "month")).toBe(999);
  });

  it("previews a published badge in both languages", async () => {
    renderPage();
    await screen.findByText("Yearly");
    expect(within(card("Yearly")).getByLabelText("배지 미리보기: 런칭 기념 특별 할인")).toBeInTheDocument();
    expect(within(card("Yearly")).getByLabelText("배지 미리보기: Launch special")).toBeInTheDocument();
    expect(within(card("Monthly")).getByText("없음")).toBeInTheDocument();
  });

  it("writes and publishes a badge with a new promo price", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Monthly");
    await user.click(within(card("Monthly")).getByRole("button", { name: "수정" }));

    const promo = screen.getByPlaceholderText("할인 없음");
    await user.clear(promo);
    await user.type(promo, "799");
    expect(screen.getByText(/38% 할인/)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "배지 게시" }));
    await user.type(screen.getByPlaceholderText("예: 런칭 기념 특별 할인"), "첫 달 특가");
    // English is still missing: publishing needs both languages.
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
    await user.type(screen.getByPlaceholderText("e.g. Launch special"), "First month deal");
    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(updatePlan).toHaveBeenCalledWith("plan_monthly", {
      name: "Monthly",
      price_cents: 1299,
      promo_price_cents: 799,
      entitlements: ["premium_courses", "ai_tutor"],
      badge_text: { ko: "첫 달 특가", en: "First month deal" },
      badge_published: true,
    });
  });

  it("ends a promotion when the promo price is emptied", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Monthly");
    await user.click(within(card("Monthly")).getByRole("button", { name: "수정" }));
    await user.clear(screen.getByPlaceholderText("할인 없음"));
    expect(screen.getByText("비우면 할인 없음 — 정가로 결제돼요")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(updatePlan.mock.calls[0][1]).toMatchObject({ promo_price_cents: null });
  });

  it("refuses a promo price above the list price", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Monthly");
    await user.click(within(card("Monthly")).getByRole("button", { name: "수정" }));
    const promo = screen.getByPlaceholderText("할인 없음");
    await user.clear(promo);
    await user.type(promo, "1500");
    expect(screen.getByText("할인가는 정가보다 클 수 없어요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
  });

  it("switches a new-member price on; the standard prices have no switch", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Monthly");
    await user.click(within(card("Monthly")).getByRole("button", { name: "수정" }));
    expect(screen.queryByRole("checkbox", { name: "결제 화면에 제공" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "취소" }));

    await user.click(within(card("Monthly — New member")).getByRole("button", { name: "수정" }));
    await user.click(screen.getByRole("checkbox", { name: "결제 화면에 제공" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(updatePlan.mock.calls[0][0]).toBe("plan_monthly_new_user");
    expect(updatePlan.mock.calls[0][1]).toMatchObject({ offered: true });
  });

  it("lists an older plan that still renews, read-only", async () => {
    listPlans.mockResolvedValue({
      plans: [MONTHLY, YEARLY, NEW_MONTHLY, NEW_YEARLY, plan({ plan_id: "plan_old", name: "Old", interval: "month", slot: null, live_subscribers: 2 })],
      trial_days: 7,
    });
    renderPage();
    const row = (await screen.findByText("Old")).closest("tr")!;
    expect(within(row).getByText("2명")).toBeInTheDocument();
    expect(within(row).queryByRole("button")).toBeNull();
  });
});

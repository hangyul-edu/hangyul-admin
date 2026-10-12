/**
 * 요금제 관리 shows the two plans on sale (no creating or archiving plans,
 * no per-plan access), the free trial as a per-member policy, monthly
 * equivalents for yearly prices, and edits the regular and new-member prices
 * and the badge — a preset or custom text, published or hidden. The API is
 * stubbed, so these assertions are about what the page shows and sends.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import type { BadgePreset, Plan } from "../api";

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
    new_member_price_cents: null,
    status: "active",
    version: 1,
    slot: { interval: over.interval },
    badge_text: { ko: "", en: "" },
    badge_published: false,
    active_subscribers: 0,
    total_subscribers: 0,
    ...over,
  };
}

const MONTHLY = plan({
  plan_id: "plan_monthly",
  name: "Monthly",
  interval: "month",
  active_subscribers: 3,
  total_subscribers: 1250,
});
const YEARLY = plan({
  plan_id: "plan_yearly",
  name: "Yearly",
  interval: "year",
  price_cents: 15588,
  promo_price_cents: 7188,
  new_member_price_cents: 4788,
  badge_text: { ko: "런칭 기념 특별 할인", en: "Launch special" },
  badge_published: true,
});
const PRESETS: BadgePreset[] = [
  { key: "launch_special", text: { ko: "런칭 기념 특별 할인", en: "Launch special" } },
  { key: "best_value", text: { ko: "가장 알뜰한 선택", en: "Best value" } },
];

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
  listPlans.mockResolvedValue({ plans: [MONTHLY, YEARLY], trial_days: 7, badge_presets: PRESETS });
  updatePlan.mockResolvedValue(MONTHLY);
});

describe("요금제 관리", () => {
  it("shows the two plans on sale, with no way to create or archive one or grant per-plan access", async () => {
    renderPage();
    await screen.findByText("Monthly");
    expect(screen.getByRole("heading", { name: "판매 중인 요금제" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "신규 회원 요금" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "수정" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /새 요금제/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "보관" })).toBeNull();
    expect(screen.queryByText("이용 권한")).toBeNull();
    // Every subscription includes the same access, stated once.
    expect(screen.getByText("모든 구독에 포함")).toBeInTheDocument();
    expect(screen.getByText(/AI 튜터\(챗봇\) 무제한/)).toBeInTheDocument();
    // Active now and cumulative to date, both shown.
    const counts = card("Monthly").querySelector(".hgadm-offer__counts") as HTMLElement;
    expect(counts).toHaveTextContent("현재 3명");
    expect(counts).toHaveTextContent("누적 1,250명");
  });

  it("states the free trial once, as a per-member policy, not per plan", async () => {
    renderPage();
    expect(await screen.findByText("무료 체험 · 회원당 1회, 7일")).toBeInTheDocument();
    expect(screen.queryByText(/체험 \(일\)/)).toBeNull();
  });

  it("shows the regular and the new-member price of each plan, yearly ones per month too", async () => {
    renderPage();
    const yearly = within(await screen.findByText("Yearly").then(() => card("Yearly")));
    expect(yearly.getByText("$71.88")).toBeInTheDocument();
    expect(yearly.getByText("$5.99")).toBeInTheDocument(); // 7188 / 12
    expect(yearly.getByText("54% 할인")).toBeInTheDocument();
    expect(yearly.getByText("$47.88")).toBeInTheDocument(); // the new-member price
    expect(yearly.getByText("$3.99")).toBeInTheDocument(); // 4788 / 12
    expect(yearly.getByText("69% 할인")).toBeInTheDocument();
    expect(within(card("Monthly")).getByText("일반 회원과 같은 가격")).toBeInTheDocument();
    expect(within(card("Monthly")).queryByText(/월 환산/)).toBeNull();
    expect(monthlyEquivalent(15588, "year")).toBe(1299);
    expect(monthlyEquivalent(999, "month")).toBe(999);
  });

  it("previews a published badge in both languages", async () => {
    renderPage();
    await screen.findByText("Yearly");
    expect(within(card("Yearly")).getByLabelText("배지 미리보기: 런칭 기념 특별 할인")).toBeInTheDocument();
    expect(within(card("Yearly")).getByLabelText("배지 미리보기: Launch special")).toBeInTheDocument();
    expect(within(card("Yearly")).getByText("기본 문구")).toBeInTheDocument();
    expect(within(card("Monthly")).getByText("숨김")).toBeInTheDocument();
  });

  it("sets a new-member price inside the plan", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Monthly");
    await user.click(within(card("Monthly")).getByRole("button", { name: "수정" }));
    await user.click(screen.getByRole("checkbox", { name: "신규 회원가 적용" }));
    await user.type(screen.getByLabelText("신규 회원 결제 금액"), "499");
    expect(screen.getByText(/62% 할인 · 이 가격으로 시작한 구독은 갱신 때도 유지돼요/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(updatePlan).toHaveBeenCalledWith("plan_monthly", {
      name: "Monthly",
      price_cents: 1299,
      promo_price_cents: 999,
      new_member_price_cents: 499,
      badge_text: { ko: "", en: "" },
      badge_published: false,
    });
  });

  it("stops offering a new-member price and refuses one above the list price", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Yearly");
    await user.click(within(card("Yearly")).getByRole("button", { name: "수정" }));
    const input = screen.getByLabelText("신규 회원 결제 금액");
    await user.clear(input);
    await user.type(input, "20000");
    expect(screen.getByText("신규 회원가는 정가보다 클 수 없어요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "신규 회원가 적용" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(updatePlan.mock.calls[0][1]).toMatchObject({ new_member_price_cents: null });
  });

  it("publishes a preset badge", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Monthly");
    await user.click(within(card("Monthly")).getByRole("button", { name: "수정" }));
    await user.click(screen.getByRole("radio", { name: "가장 알뜰한 선택 / Best value" }));
    await user.click(screen.getByRole("checkbox", { name: "배지 게시" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(updatePlan.mock.calls[0][1]).toMatchObject({
      badge_text: { ko: "가장 알뜰한 선택", en: "Best value" },
      badge_published: true,
    });
  });

  it("writes and publishes a custom badge with a new promo price", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Yearly");
    await user.click(within(card("Yearly")).getByRole("button", { name: "수정" }));
    // The yearly plan's badge is a preset: that one is selected.
    expect(screen.getByRole("radio", { name: "런칭 기념 특별 할인 / Launch special" })).toBeChecked();

    const promo = screen.getByPlaceholderText("할인 없음");
    await user.clear(promo);
    await user.type(promo, "9588");
    expect(screen.getByText(/38% 할인/)).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "직접 입력" }));
    await user.type(screen.getByPlaceholderText("예: 첫 달 특가"), "연말 특가");
    // English is still missing: publishing needs both languages.
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
    await user.type(screen.getByPlaceholderText("e.g. First month deal"), "Year-end deal");
    await user.click(screen.getByRole("button", { name: "저장" }));

    expect(updatePlan).toHaveBeenCalledWith("plan_yearly", {
      name: "Yearly",
      price_cents: 15588,
      promo_price_cents: 9588,
      new_member_price_cents: 4788,
      badge_text: { ko: "연말 특가", en: "Year-end deal" },
      badge_published: true,
    });
  });

  it("hides a badge and keeps its text", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Yearly");
    await user.click(within(card("Yearly")).getByRole("button", { name: "수정" }));
    await user.click(screen.getByRole("checkbox", { name: "배지 게시" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(updatePlan.mock.calls[0][1]).toMatchObject({
      badge_text: { ko: "런칭 기념 특별 할인", en: "Launch special" },
      badge_published: false,
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

  it("lists an older plan that still renews, read-only", async () => {
    listPlans.mockResolvedValue({
      plans: [MONTHLY, YEARLY, plan({ plan_id: "plan_old", name: "Old", interval: "month", slot: null, active_subscribers: 2, total_subscribers: 9 })],
      trial_days: 7,
      badge_presets: PRESETS,
    });
    renderPage();
    const row = (await screen.findByText("Old")).closest("tr")!;
    expect(within(row).getByText("2명")).toBeInTheDocument();
    expect(within(row).getByText("9명")).toBeInTheDocument();
    expect(within(row).queryByRole("button")).toBeNull();
  });
});

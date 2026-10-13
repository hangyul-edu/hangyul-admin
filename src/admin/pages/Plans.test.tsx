/**
 * 요금제 관리 shows the two plans on sale (no creating or archiving plans, no
 * plan per currency, no per-plan access), each with a price per currency
 * (KRW, USD) and who is offered it, the free trial as a per-member policy,
 * monthly equivalents for yearly prices, and edits each
 * currency's list, sale and new-member price and the badge — a preset or
 * custom text, published or hidden. The API is stubbed, so these assertions
 * are about what the page shows and sends.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import type { BadgePreset, Plan, PlanList, PlanPrice } from "../api";

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

const { PlansPage, monthlyEquivalent, parseAmount, toInput } = await import("./Plans");

function price(
  currency: string,
  price_cents: number,
  promo_price_cents: number | null,
  new_member_price_cents: number | null = null,
  interval: Plan["interval"] = "month",
): PlanPrice {
  const current = promo_price_cents ?? price_cents;
  return {
    currency,
    price_cents,
    promo_price_cents,
    new_member_price_cents,
    version: 1,
    current_total_cents: current,
    current_monthly_cents: interval === "year" ? Math.round(current / 12) : current,
    original_monthly_cents: interval === "year" ? Math.round(price_cents / 12) : price_cents,
    new_member_monthly_cents:
      new_member_price_cents === null ? null : interval === "year" ? Math.round(new_member_price_cents / 12) : new_member_price_cents,
    discount_percent: 0,
  };
}

function plan(over: Partial<Plan> & Pick<Plan, "plan_id" | "interval">): Plan {
  return {
    name: over.plan_id,
    prices: [],
    status: "active",
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
  prices: [price("KRW", 12900, 9900), price("USD", 1299, 999)],
  active_subscribers: 3,
  total_subscribers: 1250,
});
const YEARLY = plan({
  plan_id: "plan_yearly",
  name: "Yearly",
  interval: "year",
  prices: [price("USD", 15588, 7188, 4788, "year")], // not sold in KRW
  badge_text: { ko: "런칭 기념 특별 할인", en: "Launch special" },
  badge_published: true,
});
const PRESETS: BadgePreset[] = [
  { key: "launch_special", text: { ko: "런칭 기념 특별 할인", en: "Launch special" } },
  { key: "most_popular", text: { ko: "가장 인기 있는 플랜", en: "Most popular" } },
];

function list(plans: Plan[]): PlanList {
  return { plans, price_currencies: ["KRW", "USD"], trial_days: 7, badge_presets: PRESETS };
}

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

async function edit(name: string) {
  const user = userEvent.setup();
  renderPage();
  await screen.findByText(name);
  await user.click(within(card(name)).getByRole("button", { name: "수정" }));
  return user;
}

beforeEach(() => {
  listPlans.mockReset();
  updatePlan.mockReset();
  listPlans.mockResolvedValue(list([MONTHLY, YEARLY]));
  updatePlan.mockResolvedValue(MONTHLY);
});

describe("amount input", () => {
  it("reads won as whole numbers and dollars with cents", () => {
    expect(parseAmount("12,900", "KRW")).toBe(12900);
    expect(parseAmount("12900.5", "KRW")).toBeNull();
    expect(parseAmount("12.99", "USD")).toBe(1299);
    expect(parseAmount("12.9", "USD")).toBe(1290);
    expect(parseAmount("12", "USD")).toBe(1200);
    expect(parseAmount("12.999", "USD")).toBeNull();
    expect(parseAmount("-1", "USD")).toBeNull();
    expect(toInput(1299, "USD")).toBe("12.99");
    expect(toInput(9900, "KRW")).toBe("9900");
    expect(toInput(null, "KRW")).toBe("");
  });
});

describe("요금제 관리", () => {
  it("shows the two plans on sale, with no way to create or archive one or grant per-plan access", async () => {
    renderPage();
    await screen.findByText("Monthly");
    expect(screen.getByRole("heading", { name: "판매 중인 요금제" })).toBeInTheDocument();
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

  it("says which currency each billing country pays in", async () => {
    renderPage();
    await screen.findByText("Monthly");
    expect(screen.getByText(/대한민국은 원화\(KRW\), 그 밖의 국가는 미국 달러\(USD\)/)).toBeInTheDocument();  });

  it("states the free trial once, as a per-member policy, not per plan", async () => {
    renderPage();
    expect(await screen.findByText("무료 체험 · 회원당 1회, 7일")).toBeInTheDocument();
    expect(screen.queryByText(/체험 \(일\)/)).toBeNull();
  });

  it("shows each currency's regular and new-member price, yearly ones per month too", async () => {
    renderPage();
    await screen.findByText("Yearly");
    const monthly = within(card("Monthly"));
    const krw = within(monthly.getByLabelText("KRW 가격"));
    expect(krw.getByText("₩9,900")).toBeInTheDocument();
    expect(krw.getByText("₩12,900")).toBeInTheDocument();
    expect(krw.getByText("23% 할인")).toBeInTheDocument();
    expect(within(monthly.getByLabelText("USD 가격")).getByText("US$9.99")).toBeInTheDocument();
    expect(monthly.getAllByText("일반 회원과 같은 가격")).toHaveLength(2);
    expect(monthly.queryByText(/월 환산/)).toBeNull();

    const yearly = within(card("Yearly"));
    const usd = within(yearly.getByLabelText("USD 가격"));
    expect(usd.getByText("US$71.88")).toBeInTheDocument();
    expect(usd.getByText("US$5.99")).toBeInTheDocument(); // 7188 / 12
    expect(usd.getByText("54% 할인")).toBeInTheDocument();
    expect(usd.getByText("US$47.88")).toBeInTheDocument(); // the new-member price
    expect(usd.getByText("US$3.99")).toBeInTheDocument(); // 4788 / 12
    expect(usd.getByText("69% 할인")).toBeInTheDocument();
    // Not sold in KRW: said so.
    expect(within(yearly.getByLabelText("KRW 가격")).getByText(/판매 안 함/)).toBeInTheDocument();

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

  it("sets a new-member price in one currency and sends only that currency", async () => {
    const user = await edit("Monthly");
    await user.click(screen.getByRole("checkbox", { name: "KRW 신규 회원가 적용" }));
    await user.type(screen.getByLabelText("KRW 신규 회원 결제 금액"), "4900");
    expect(screen.getByText(/62% 할인 · 이 가격으로 시작한 구독은 갱신 때도 유지돼요/)).toBeInTheDocument();
    expect(screen.getByText(/바뀐 KRW 가격은 새로 구독하는 회원부터 적용돼요/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(updatePlan).toHaveBeenCalledWith("plan_monthly", {
      name: "Monthly",
      badge_text: { ko: "", en: "" },
      badge_published: false,
      prices: { KRW: { price_cents: 12900, promo_price_cents: 9900, new_member_price_cents: 4900 } },
    });
  });

  it("takes dollar amounts with cents", async () => {
    const user = await edit("Monthly");
    const list = screen.getByLabelText("USD 정가");
    await user.clear(list);
    await user.type(list, "14.99");
    expect(screen.getByText(/US\$14\.99 \/ 월/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(updatePlan.mock.calls[0][1].prices).toEqual({
      USD: { price_cents: 1499, promo_price_cents: 999, new_member_price_cents: null },
    });
  });

  it("starts selling in a currency the plan had no price in, with its monthly equivalent", async () => {
    const user = await edit("Yearly");
    await user.click(screen.getByRole("checkbox", { name: "KRW로 판매" }));
    await user.type(screen.getByLabelText("KRW 정가"), "154800");
    await user.type(screen.getByLabelText("KRW 할인가"), "69000");
    expect(screen.getByText(/₩69,000 \/ 년 · 월 환산 ₩5,750 · 55% 할인/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(updatePlan.mock.calls[0][1].prices).toEqual({
      KRW: { price_cents: 154800, promo_price_cents: 69000, new_member_price_cents: null },
    });
  });

  it("stops selling in a currency, but never in every currency", async () => {
    const user = await edit("Monthly");
    await user.click(screen.getByRole("checkbox", { name: "KRW로 판매" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(updatePlan.mock.calls[0][1].prices).toEqual({ KRW: null });

    updatePlan.mockClear();
    await user.click(within(card("Monthly")).getByRole("button", { name: "수정" }));
    await user.click(screen.getByRole("checkbox", { name: "KRW로 판매" }));
    await user.click(screen.getByRole("checkbox", { name: "USD로 판매" }));
    expect(screen.getByText("한 개 이상의 통화로 판매해야 해요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
  });

  it("refuses a sale or new-member price above the list price", async () => {
    const user = await edit("Yearly");
    const nm = screen.getByLabelText("USD 신규 회원 결제 금액");
    await user.clear(nm);
    await user.type(nm, "200");
    expect(screen.getByText("USD 신규 회원가는 정가보다 클 수 없어요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "USD 신규 회원가 적용" }));
    const promo = screen.getByLabelText("USD 할인가");
    await user.clear(promo);
    await user.type(promo, "160");
    expect(screen.getByText("USD 할인가는 정가보다 클 수 없어요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
  });

  it("ends a sale when the sale price is emptied", async () => {
    const user = await edit("Monthly");
    await user.clear(screen.getByLabelText("USD 할인가"));
    expect(screen.getAllByText("비우면 할인 없음 — 정가로 결제돼요")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(updatePlan.mock.calls[0][1].prices).toEqual({
      USD: { price_cents: 1299, promo_price_cents: null, new_member_price_cents: null },
    });
  });

  it("publishes a preset badge without touching prices", async () => {
    const user = await edit("Monthly");
    await user.click(screen.getByRole("radio", { name: "가장 인기 있는 플랜 / Most popular" }));
    await user.click(screen.getByRole("checkbox", { name: "배지 게시" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    const body = updatePlan.mock.calls[0][1];
    expect(body).toMatchObject({
      badge_text: { ko: "가장 인기 있는 플랜", en: "Most popular" },
      badge_published: true,
    });
    expect(body).not.toHaveProperty("prices");
  });

  it("writes and publishes a custom badge", async () => {
    const user = await edit("Yearly");
    // The yearly plan's badge is a preset: that one is selected.
    expect(screen.getByRole("radio", { name: "런칭 기념 특별 할인 / Launch special" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "직접 입력" }));
    await user.type(screen.getByPlaceholderText("예: 첫 달 특가"), "연말 특가");
    // English is still missing: publishing needs both languages.
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
    await user.type(screen.getByPlaceholderText("e.g. First month deal"), "Year-end deal");
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(updatePlan).toHaveBeenCalledWith("plan_yearly", {
      name: "Yearly",
      badge_text: { ko: "연말 특가", en: "Year-end deal" },
      badge_published: true,
    });
  });

  it("hides a badge and keeps its text", async () => {
    const user = await edit("Yearly");
    await user.click(screen.getByRole("checkbox", { name: "배지 게시" }));
    await user.click(screen.getByRole("button", { name: "저장" }));
    expect(updatePlan.mock.calls[0][1]).toMatchObject({
      badge_text: { ko: "런칭 기념 특별 할인", en: "Launch special" },
      badge_published: false,
    });
  });

  it("lists an older plan that still renews, read-only", async () => {
    listPlans.mockResolvedValue(
      list([
        MONTHLY,
        YEARLY,
        plan({
          plan_id: "plan_old",
          name: "Old",
          interval: "month",
          slot: null,
          prices: [price("USD", 799, null)],
          active_subscribers: 2,
          total_subscribers: 9,
        }),
      ]),
    );
    renderPage();
    const row = (await screen.findByText("Old")).closest("tr")!;
    expect(within(row).getByText("US$7.99 / 월")).toBeInTheDocument();
    expect(within(row).getByText("2명")).toBeInTheDocument();
    expect(within(row).getByText("9명")).toBeInTheDocument();
    expect(within(row).queryByRole("button")).toBeNull();
  });
});

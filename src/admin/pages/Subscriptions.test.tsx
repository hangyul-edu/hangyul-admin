/**
 * 구독 현황 lists subscriptions read-only: the seven stored states plus the
 * 해지 예정 filter, plan names from the catalogue (the list carries ids), the
 * provider in words, and the filters sent as the server takes them.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AdminSubscriptionRow } from "../api";

const listSubscriptions = vi.fn();
const listPlans = vi.fn();

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      listSubscriptions: (q: unknown) => listSubscriptions(q),
      listPlans: () => listPlans(),
    },
  };
});

const { SubscriptionsPage } = await import("./Subscriptions");

function row(overrides: Partial<AdminSubscriptionRow> = {}): AdminSubscriptionRow {
  return {
    subscription_id: "sub_1",
    user_id: "usr_1",
    user_email: "member@talkhangyul.co.kr",
    plan_id: "plan_monthly",
    status: "active",
    provider: "toss_card",
    trial_expires_at: null,
    current_period_end: "2026-11-01T00:00:00Z",
    next_billing_at: "2026-11-01T00:00:00Z",
    cancel_at_period_end: false,
    created_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

function page(items: AdminSubscriptionRow[]) {
  return { items, total: items.length, page: 1, page_size: 25 };
}

function plan(plan_id: string, name: string, slot: { interval: "month" | "year" } | null) {
  return {
    plan_id,
    name,
    interval: slot?.interval ?? "month",
    prices: [],
    status: slot ? "active" : "archived",
    slot,
    badge_text: { ko: "", en: "" },
    badge_published: false,
    active_subscribers: 0,
    total_subscribers: 0,
  };
}

function renderPage(path = "/subscriptions") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <SubscriptionsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  listSubscriptions.mockReset();
  listPlans.mockReset();
  listPlans.mockResolvedValue({
    plans: [plan("plan_monthly", "프리미엄 월간", { interval: "month" }), plan("plan_old", "구 요금제", null)],
    price_currencies: ["KRW", "USD"],
    trial_days: 7,
    badge_presets: [],
  });
});

describe("구독 현황", () => {
  it("names the plan and the provider, and flags a scheduled cancellation", async () => {
    listSubscriptions.mockResolvedValue(
      page([
        row(),
        row({
          subscription_id: "sub_2",
          user_email: "leaving@talkhangyul.co.kr",
          plan_id: "plan_old",
          provider: "naver_pay",
          cancel_at_period_end: true,
        }),
        row({ subscription_id: "sub_3", user_email: null, plan_id: "plan_unknown", provider: null, status: "expired", cancel_at_period_end: true }),
      ]),
    );
    renderPage();
    const first = (await screen.findByText("member@talkhangyul.co.kr")).closest("tr")!;
    expect(within(first).getByText("프리미엄 월간")).toBeInTheDocument();
    expect(within(first).getByText("토스페이먼츠 카드")).toBeInTheDocument();
    expect(within(first).getByText("이용 중")).toBeInTheDocument();
    expect(within(first).queryByText("기간 종료 시 해지")).toBeNull();

    const second = screen.getByText("leaving@talkhangyul.co.kr").closest("tr")!;
    expect(within(second).getByText("구 요금제")).toBeInTheDocument();
    expect(within(second).getByText("네이버페이")).toBeInTheDocument();
    expect(within(second).getByText("기간 종료 시 해지")).toBeInTheDocument();

    // A deleted account, an unknown plan id (shown as is) and no provider.
    const third = screen.getByText("(탈퇴한 사용자)").closest("tr")!;
    expect(within(third).getByText("plan_unknown")).toBeInTheDocument();
    expect(within(third).getByText("만료")).toBeInTheDocument();
    // An expired subscription is not "about to cancel" whatever the flag says.
    expect(within(third).queryByText("기간 종료 시 해지")).toBeNull();
  });

  it("offers the seven stored states and 해지 예정, and sends the chosen filters", async () => {
    listSubscriptions.mockResolvedValue(page([row()]));
    const user = userEvent.setup();
    renderPage("/subscriptions?status=canceling");
    await screen.findByText("member@talkhangyul.co.kr");
    expect(listSubscriptions).toHaveBeenLastCalledWith({ q: undefined, status: "canceling", plan_id: undefined, page: 1, page_size: 25 });

    await user.click(screen.getByRole("button", { name: "상태" }));
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual([
      "상태: 전체",
      "무료 체험",
      "이용 중",
      "결제 대기",
      "결제 실패",
      "유예 기간",
      "이용 중지",
      "만료",
      "해지 예정",
    ]);
    await user.click(screen.getByRole("option", { name: "유예 기간" }));
    await waitFor(() =>
      expect(listSubscriptions).toHaveBeenLastCalledWith(expect.objectContaining({ status: "grace_period", page: 1 })),
    );

    await user.click(screen.getByRole("button", { name: "요금제" }));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["요금제: 전체", "프리미엄 월간", "구 요금제 (이전 요금제)"]);
    await user.click(screen.getByRole("option", { name: "구 요금제 (이전 요금제)" }));
    await waitFor(() =>
      expect(listSubscriptions).toHaveBeenLastCalledWith(expect.objectContaining({ status: "grace_period", plan_id: "plan_old" })),
    );
  });

  it("ignores a status the server does not know", async () => {
    listSubscriptions.mockResolvedValue(page([]));
    renderPage("/subscriptions?status=trial_ending");
    await screen.findByText("조건에 맞는 구독이 없습니다.");
    expect(listSubscriptions).toHaveBeenLastCalledWith(expect.objectContaining({ status: undefined }));
  });
});

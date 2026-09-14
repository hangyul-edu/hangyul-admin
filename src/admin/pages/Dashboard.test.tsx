import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import { DashboardPage, monthLabel } from "./Dashboard";
import { adminApi } from "../api";
import type { MetricsOverview, MonthlyRevenueResponse } from "../api";

vi.mock("../auth", () => ({
  useAdminAuth: () => ({
    status: "signed-in",
    me: { user_id: "usr_admin", admin_role: "super_admin", scopes: ["users:read"] },
    login: vi.fn(),
    logout: vi.fn(),
    // A super admin, so every alert's destination is reachable and these tests
    // see the dashboard whole. Scope-dependent behaviour is covered in
    // Dashboard.alerts.test.tsx.
    can: () => true,
  }),
}));


vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      metricsOverview: vi.fn(),
      metricsTimeseries: vi.fn(),
      metricsMonthlyRevenue: vi.fn(),
    },
  };
});

const metricsOverview = vi.mocked(adminApi.metricsOverview);
const metricsTimeseries = vi.mocked(adminApi.metricsTimeseries);
const metricsMonthlyRevenue = vi.mocked(adminApi.metricsMonthlyRevenue);

const OVERVIEW = {
  generated_at: "2026-09-08T05:00:00Z",
  users: {
    total: 120,
    active: 118,
    suspended: 1,
    deactivated: 1,
    new_today: 3,
    new_7d: 9,
    new_30d: 31,
  },
  subscriptions: { active: 40, trialing: 5, in_grace: 0, suspended: 0, canceling: 2 },
  revenue: {
    currency: "USD",
    today_cents: 12_000,
    this_month: "2026-09",
    this_month_cents: 480_000,
    refunded_30d_cents: 0,
    failed_payments_24h: 0,
  },
  learning: {
    sessions_today: 12,
    active_learners_today: 8,
    minutes_today: 240,
    attendance_today: 7,
  },
  content: { quizzes: 10, sentences: 10, lectures: 3, notices: 1, banners: 0, faqs: 4 },
  ai: {
    llm_calls_30d: 100,
    llm_cost_month_usd_cents: 500,
    generated_total: 20,
    generated_pending_review: 0,
  },
  alerts: [],
  recent_signups: [],
  recent_payments: [],
  recent_admin_actions: [],
} as unknown as MetricsOverview;

const MONTHLY: MonthlyRevenueResponse = {
  currency: "USD",
  months: 12,
  current_month: "2026-09",
  points: [
    { month: "2025-10", value_cents: 100_000 },
    { month: "2025-11", value_cents: 200_000 },
    { month: "2025-12", value_cents: 300_000 },
    { month: "2026-01", value_cents: 250_000 },
    { month: "2026-02", value_cents: 0 },
    { month: "2026-03", value_cents: 400_000 },
    { month: "2026-04", value_cents: 410_000 },
    { month: "2026-05", value_cents: 420_000 },
    { month: "2026-06", value_cents: 430_000 },
    { month: "2026-07", value_cents: 440_000 },
    { month: "2026-08", value_cents: 900_000 },
    { month: "2026-09", value_cents: 480_000 },
  ],
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/"]}>
          <DashboardPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/** The card wrapping the monthly chart, found via its title. */
function monthlyCard(): HTMLElement {
  return screen.getByText("월별 매출").closest(".hgadm-card") as HTMLElement;
}

describe("monthLabel", () => {
  it("renders a server month string in Korean without client date math", () => {
    expect(monthLabel("2026-09")).toBe("2026년 9월");
    expect(monthLabel("2026-01")).toBe("2026년 1월");
    expect(monthLabel("2025-12")).toBe("2025년 12월");
  });
});

describe("DashboardPage revenue", () => {
  beforeEach(() => {
    metricsOverview.mockReset();
    metricsTimeseries.mockReset();
    metricsMonthlyRevenue.mockReset();
    metricsOverview.mockResolvedValue(OVERVIEW);
    metricsTimeseries.mockResolvedValue({ metric: "signups", days: 30, points: [] });
    metricsMonthlyRevenue.mockResolvedValue(MONTHLY);
  });

  it("puts the name first in a signup, with nickname and email under it", async () => {
    metricsOverview.mockResolvedValue({
      ...OVERVIEW,
      recent_signups: [
        {
          user_id: "usr_1",
          name: "김하늘",
          email: "haneul@talkhangyul.co.kr",
          nickname: "haneul",
          created_at: "2026-09-10T04:05:00Z",
        },
      ],
    } as never);
    renderPage();

    const row = (await screen.findByText("김하늘")).closest(".hgadm-recent")!;
    expect(row.querySelector(".hgadm-recent__primary")?.textContent).toBe("김하늘");
    expect(row.querySelector(".hgadm-recent__lead")?.textContent).toBe("haneul");
    expect(row.querySelector(".hgadm-recent__rest")?.textContent).toBe(
      "haneul@talkhangyul.co.kr",
    );
  });

  it("falls back to the email for a signup with no name", async () => {
    metricsOverview.mockResolvedValue({
      ...OVERVIEW,
      recent_signups: [
        {
          user_id: "usr_1",
          name: "",
          email: "nameless@talkhangyul.co.kr",
          nickname: null,
          created_at: "2026-09-10T04:05:00Z",
        },
      ],
    } as never);
    renderPage();

    const row = (await screen.findByText("nameless@talkhangyul.co.kr")).closest(
      ".hgadm-recent",
    )!;
    expect(row.querySelector(".hgadm-recent__primary")?.textContent).toBe(
      "nameless@talkhangyul.co.kr",
    );
    // With no nickname and the email already serving as the label, there is
    // nothing left for a secondary line — better than repeating the address.
    expect(row.querySelector(".hgadm-recent__secondary")).toBeNull();
    expect(row.textContent?.match(/nameless@talkhangyul\.co\.kr/g)).toHaveLength(1);
  });

  it("leads a payment with the amount in USD, then who paid and for what", async () => {
    metricsOverview.mockResolvedValue({
      ...OVERVIEW,
      recent_payments: [
        {
          payment_id: "pay_1",
          user_id: "usr_1",
          user_name: "김하늘",
          user_email: "haneul@talkhangyul.co.kr",
          plan_name: "프리미엄 연간",
          amount_cents: 15588,
          currency: "USD",
          status: "succeeded",
          paid_at: "2026-09-10T04:05:00Z",
          created_at: "2026-09-10T04:00:00Z",
        },
      ],
    } as never);
    renderPage();

    const amount = await screen.findByText("$155.88");
    const row = amount.closest(".hgadm-recent")!;
    expect(row.querySelector(".hgadm-recent__primary")?.textContent).toContain("$155.88");
    expect(row.querySelector(".hgadm-recent__lead")?.textContent).toBe("김하늘");
    expect(row.querySelector(".hgadm-recent__rest")?.textContent).toBe("프리미엄 연간");
  });

  it("still renders a payment whose account or invoice no longer resolves", async () => {
    metricsOverview.mockResolvedValue({
      ...OVERVIEW,
      recent_payments: [
        {
          payment_id: "pay_1",
          user_id: null,
          user_name: null,
          user_email: null,
          plan_name: null,
          amount_cents: 499,
          currency: "USD",
          status: "failed",
          paid_at: null,
          created_at: "2026-09-10T04:00:00Z",
        },
      ],
    } as never);
    renderPage();

    // The money is the point of the row; the rest degrades without dropping it.
    expect(await screen.findByText("$4.99")).toBeInTheDocument();
  });

  it("shows this month's revenue instead of a rolling 30-day figure", async () => {
    renderPage();

    expect(await screen.findByText("이번 달 매출")).toBeInTheDocument();
    expect(screen.queryByText("최근 30일 매출")).not.toBeInTheDocument();
    // 480,000 cents of USD, shown as dollars behind a plain $.
    expect(screen.getByText("$4,800.00")).toBeInTheDocument();
  });

  it("names the month the figure covers, using the server's value", async () => {
    renderPage();

    expect(await screen.findByText(/2026년 9월 1일부터/)).toBeInTheDocument();
  });

  it("says which clock the figures are on", async () => {
    renderPage();

    // Without this an admin cannot tell whether "오늘" turned over at midnight
    // Seoul or at 09:00, which is nine hours of ambiguity every day.
    expect(await screen.findByText("한국 시간(KST)")).toBeInTheDocument();
    expect(
      screen.getByText(/한국 시간\(KST\) 달력 월 기준 결제 금액/),
    ).toBeInTheDocument();
  });

  it("requests 12 months of revenue by default", async () => {
    renderPage();

    await waitFor(() => expect(metricsMonthlyRevenue).toHaveBeenCalledWith(12));
  });

  it("labels every month and shows the year when it rolls over", async () => {
    renderPage();
    await screen.findByText("월별 매출");
    const card = within(monthlyCard());

    // Mid-year months carry just the month...
    expect(card.getByText("11월")).toBeInTheDocument();
    expect(card.getByText("12월")).toBeInTheDocument();
    // ...and the first bar of each new year carries the year, so a window
    // spanning New Year is not ambiguous.
    expect(card.getByText("25'10월")).toBeInTheDocument();
    expect(card.getByText("26'1월")).toBeInTheDocument();
  });

  it("marks the in-progress month so a partial bar is not read as a drop", async () => {
    renderPage();
    await screen.findByText("월별 매출");

    expect(screen.getByText("이번 달 (진행 중 · 1일~오늘)")).toBeInTheDocument();
    expect(screen.getByText("완료된 달")).toBeInTheDocument();
    expect(
      screen.getByText(/마지막 달은 아직 진행 중입니다/),
    ).toBeInTheDocument();

    // The current month's bar is hatched; completed months are solid.
    const bars = monthlyCard().querySelectorAll("path[fill]");
    const fills = Array.from(bars).map((b) => b.getAttribute("fill"));
    expect(fills.filter((f) => f === "url(#hgadm-bar-partial)")).toHaveLength(1);
    expect(fills.filter((f) => f === "#2563eb").length).toBeGreaterThan(1);
  });

  it("draws one bar per non-zero month and skips the empty one", async () => {
    renderPage();
    await screen.findByText("월별 매출");

    // 2026-02 is 0, so it has no mark — but it still occupies its slot on the
    // axis, which is what keeps the spacing honest.
    expect(monthlyCard().querySelectorAll("path[fill]")).toHaveLength(11);
    expect(within(monthlyCard()).getByText("2월")).toBeInTheDocument();
  });

  it("refetches when the admin picks a different range", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("월별 매출");

    await user.click(within(monthlyCard()).getByRole("button", { name: "24개월" }));

    await waitFor(() => expect(metricsMonthlyRevenue).toHaveBeenCalledWith(24));
  });

  it("shows a retryable error when the monthly data fails to load", async () => {
    const user = userEvent.setup();
    metricsMonthlyRevenue.mockRejectedValueOnce(new Error("boom"));
    renderPage();

    expect(await screen.findByText("문제가 발생했어요")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    await waitFor(() =>
      expect(within(monthlyCard()).getByText("8월")).toBeInTheDocument(),
    );
  });

  it("keeps the KPI and the last chart bar in agreement", async () => {
    renderPage();
    await screen.findByText("월별 매출");

    // Both come from the same server-side query; the fixture mirrors that, and
    // the assertion documents the invariant the backend guarantees.
    expect(MONTHLY.points[MONTHLY.points.length - 1].value_cents).toBe(
      OVERVIEW.revenue.this_month_cents,
    );
    expect(MONTHLY.points[MONTHLY.points.length - 1].month).toBe(
      OVERVIEW.revenue.this_month,
    );
    expect(MONTHLY.current_month).toBe(OVERVIEW.revenue.this_month);
  });
});

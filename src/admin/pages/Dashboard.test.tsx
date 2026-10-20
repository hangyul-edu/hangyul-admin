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
    by_currency: [
      { currency: "KRW", today_cents: 9_900, this_month_cents: 1_234_000, refunded_30d_cents: 0 },
      { currency: "USD", today_cents: 12_000, this_month_cents: 480_000, refunded_30d_cents: 1_500 },
    ],
    this_month: "2026-09",
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

// Only the last two months have won payments.
const KRW_BY_MONTH: Record<string, number> = { "2026-08": 2_000_000, "2026-09": 1_234_000 };

const MONTHS = [
  "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03",
  "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09",
];

const MONTHLY: MonthlyRevenueResponse = {
  months: 12,
  current_month: "2026-09",
  series: [
    {
      currency: "KRW",
      points: MONTHS.map((month) => ({ month, value_cents: KRW_BY_MONTH[month] ?? 0 })),
    },
    {
      currency: "USD",
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
    },
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

/** The card wrapping the revenue figures and charts, found via its title. */
function monthlyCard(): HTMLElement {
  return screen.getByText("통화별 매출").closest(".hgadm-card") as HTMLElement;
}

/** One currency's monthly chart, found via its heading. */
function seriesSection(heading: string): HTMLElement {
  return screen.getByRole("region", { name: heading });
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

    const amount = await screen.findByText("US$155.88");
    const row = amount.closest(".hgadm-recent")!;
    expect(row.querySelector(".hgadm-recent__primary")?.textContent).toContain("US$155.88");
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
    expect(await screen.findByText("US$4.99")).toBeInTheDocument();
  });

  it("shows KRW and USD revenue side by side, each labelled, never summed", async () => {
    renderPage();

    const krw = (await screen.findByText("이번 달 매출 · 원화 (KRW)")).closest(".hgadm-stat")!;
    const usd = screen.getByText("이번 달 매출 · 미국 달러 (USD)").closest(".hgadm-stat")!;
    // Whole won for KRW; 480,000 cents of USD shown as dollars.
    expect(within(krw as HTMLElement).getByText("₩1,234,000")).toBeInTheDocument();
    expect(within(usd as HTMLElement).getByText("US$4,800.00")).toBeInTheDocument();
    // Next to each other in one row, KRW first.
    const pair = krw.parentElement!;
    expect(pair).toHaveClass("hgadm-revenue-pair");
    expect(Array.from(pair.children)).toEqual([krw, usd]);
    // No figure adds won and cents together, and nothing claims to be a total.
    expect(screen.queryByText(/합계|총 매출/)).not.toBeInTheDocument();
    expect(screen.queryByText("최근 30일 매출")).not.toBeInTheDocument();
    expect(
      within(monthlyCard()).getByText(/환산하거나 합산하지 않고 통화별로 따로 집계합니다/),
    ).toBeInTheDocument();
  });

  it("gives each currency its today and refund figures in that currency", async () => {
    renderPage();

    expect(
      await screen.findByText("2026년 9월 1일부터 · 오늘 ₩9,900 · 30일 환불 ₩0"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("2026년 9월 1일부터 · 오늘 US$120.00 · 30일 환불 US$15.00"),
    ).toBeInTheDocument();
  });

  it("says which clock the figures are on", async () => {
    renderPage();

    // Without this an admin cannot tell whether "오늘" turned over at midnight
    // Seoul or at 09:00, which is nine hours of ambiguity every day.
    expect(await screen.findByText("한국 시간(KST)")).toBeInTheDocument();
    expect(screen.getByText(/한국 시간\(KST\) 달력 월\s+기준/)).toBeInTheDocument();
  });

  it("offers the daily payment series one currency at a time", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("통화별 매출");

    expect(screen.queryByRole("button", { name: "결제 금액" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "결제 금액 (KRW)" }));
    await waitFor(() => expect(metricsTimeseries).toHaveBeenCalledWith("revenue_krw", 30));
    expect(
      await screen.findByText("KRW 결제 금액입니다. 다른 통화 결제는 포함하지 않습니다."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "결제 금액 (USD)" }));
    await waitFor(() => expect(metricsTimeseries).toHaveBeenCalledWith("revenue_usd", 30));
    expect(
      await screen.findByText("USD 결제 금액입니다. 다른 통화 결제는 포함하지 않습니다."),
    ).toBeInTheDocument();
  });

  it("requests 12 months of revenue by default", async () => {
    renderPage();

    await waitFor(() => expect(metricsMonthlyRevenue).toHaveBeenCalledWith(12));
  });

  it("draws one monthly chart per currency, each on its own axis", async () => {
    renderPage();
    await screen.findByText("원화 (KRW) 월별 매출");

    const krw = seriesSection("원화 (KRW) 월별 매출");
    const usd = seriesSection("미국 달러 (USD) 월별 매출");
    // Each axis is in its own currency — no shared scale between won and dollars.
    const ticks = (el: HTMLElement) =>
      Array.from(el.querySelectorAll("text[text-anchor='end']")).map((t) => t.textContent ?? "");
    expect(ticks(krw).every((t) => t.startsWith("₩"))).toBe(true);
    expect(ticks(usd).every((t) => t.startsWith("US$") || t.startsWith("$"))).toBe(true);
  });

  it("labels every month and shows the year when it rolls over", async () => {
    renderPage();
    await screen.findByText("미국 달러 (USD) 월별 매출");
    const chart = within(seriesSection("미국 달러 (USD) 월별 매출"));

    // Mid-year months carry just the month...
    expect(chart.getByText("11월")).toBeInTheDocument();
    expect(chart.getByText("12월")).toBeInTheDocument();
    // ...and the first bar of each new year carries the year, so a window
    // spanning New Year is not ambiguous.
    expect(chart.getByText("25'10월")).toBeInTheDocument();
    expect(chart.getByText("26'1월")).toBeInTheDocument();
  });

  it("marks the in-progress month so a partial bar is not read as a drop", async () => {
    renderPage();
    await screen.findByText("미국 달러 (USD) 월별 매출");

    expect(screen.getByText("이번 달 (진행 중 · 1일~오늘)")).toBeInTheDocument();
    expect(screen.getByText("완료된 달")).toBeInTheDocument();
    expect(screen.getByText(/마지막 달은 아직 진행 중입니다/)).toBeInTheDocument();

    // In each chart the current month's bar is hatched, by that chart's own
    // pattern; completed months are solid.
    for (const heading of ["원화 (KRW) 월별 매출", "미국 달러 (USD) 월별 매출"]) {
      const section = seriesSection(heading);
      const patternId = section.querySelector("pattern")!.id;
      const fills = Array.from(section.querySelectorAll("path[fill]")).map((b) => b.getAttribute("fill"));
      expect(fills.filter((f) => f === `url(#${patternId})`)).toHaveLength(1);
      expect(fills.filter((f) => f === "#2563eb").length).toBeGreaterThanOrEqual(1);
    }
    const ids = Array.from(monthlyCard().querySelectorAll("pattern")).map((p) => p.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("draws one bar per non-zero month and skips the empty ones", async () => {
    renderPage();
    await screen.findByText("미국 달러 (USD) 월별 매출");

    // USD 2026-02 is 0, so it has no mark — but it still occupies its slot on
    // the axis, which is what keeps the spacing honest.
    const usd = seriesSection("미국 달러 (USD) 월별 매출");
    expect(usd.querySelectorAll("path[fill]")).toHaveLength(11);
    expect(within(usd).getByText("2월")).toBeInTheDocument();
    expect(seriesSection("원화 (KRW) 월별 매출").querySelectorAll("path[fill]")).toHaveLength(2);
  });

  it("refetches when the admin picks a different range", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("통화별 매출");

    await user.click(within(monthlyCard()).getByRole("button", { name: "24개월" }));

    await waitFor(() => expect(metricsMonthlyRevenue).toHaveBeenCalledWith(24));
  });

  it("shows a retryable error when the monthly data fails to load", async () => {
    const user = userEvent.setup();
    metricsMonthlyRevenue.mockRejectedValueOnce(new Error("boom"));
    renderPage();

    expect(await screen.findByText("문제가 발생했어요")).toBeInTheDocument();
    // This month's figures come from the overview and stay on screen.
    expect(screen.getByText("₩1,234,000")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));

    await waitFor(() =>
      expect(within(seriesSection("미국 달러 (USD) 월별 매출")).getByText("8월")).toBeInTheDocument(),
    );
  });

  it("keeps each currency's KPI and its last chart bar in agreement", async () => {
    renderPage();
    await screen.findByText("통화별 매출");

    // Both come from the same server-side query; the fixture mirrors that, and
    // the assertion documents the invariant the backend guarantees.
    for (const series of MONTHLY.series) {
      const kpi = OVERVIEW.revenue.by_currency.find((e) => e.currency === series.currency)!;
      const last = series.points[series.points.length - 1];
      expect(last.value_cents).toBe(kpi.this_month_cents);
      expect(last.month).toBe(OVERVIEW.revenue.this_month);
    }
    expect(MONTHLY.current_month).toBe(OVERVIEW.revenue.this_month);
  });
});

describe("DashboardPage navigation", () => {
  beforeEach(() => {
    metricsOverview.mockReset();
    metricsTimeseries.mockReset();
    metricsMonthlyRevenue.mockReset();
    metricsOverview.mockResolvedValue(OVERVIEW);
    metricsTimeseries.mockResolvedValue({ metric: "signups", days: 30, points: [] });
    metricsMonthlyRevenue.mockResolvedValue(MONTHLY);
  });

  it("links each headline number to the page behind it", async () => {
    renderPage();
    const tile = (label: string) => screen.getByText(label).closest("a");
    expect(await screen.findByText("전체 사용자")).toBeInTheDocument();
    expect(tile("전체 사용자")).toHaveAttribute("href", "/users");
    expect(tile("활성 구독")).toHaveAttribute("href", "/subscriptions");
    // The failures it counts, not the whole list.
    expect(tile("결제 실패 (24시간)")).toHaveAttribute("href", "/payments?status=failed");
    expect(tile("이번 달 매출 · 원화 (KRW)")).toHaveAttribute("href", "/payments");
    expect(tile("이번 달 매출 · 미국 달러 (USD)")).toHaveAttribute("href", "/payments");
    expect(tile("AI 검수 대기")).toHaveAttribute("href", "/ai-content");
  });

  it("opens the full list behind each recent card", async () => {
    renderPage();
    await screen.findByText("최근 가입");
    const more = screen.getAllByRole("link", { name: "전체 보기" }).map((a) => a.getAttribute("href"));
    expect(more).toEqual(["/users", "/payments", "/audit-logs"]);
  });
});

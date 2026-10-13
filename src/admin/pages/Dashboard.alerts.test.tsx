/**
 * Dashboard alerts lead somewhere, so they follow the same rule as the menu.
 *
 * The dashboard opens on `users:read`, which every tier has. Its alert cards
 * link to pages that need more: 결제·청구서 wants `commerce:read`, which a
 * content manager does not hold. They were being offered a card straight into
 * 접근 권한이 없습니다 — a page the sidebar already hides from them. Scoping
 * the menu and then routing around it through the dashboard is the same leak
 * twice.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import { DashboardPage } from "./Dashboard";
import { adminApi } from "../api";
import type { MetricsOverview, MonthlyRevenueResponse } from "../api";

let scopes: string[] = [];
vi.mock("../auth", () => ({
  useAdminAuth: () => ({
    status: "signed-in",
    me: { user_id: "usr_admin", admin_role: "operator", scopes },
    login: vi.fn(),
    logout: vi.fn(),
    can: (scope: string) => scopes.includes(scope),
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

const ALERTS = [
  { code: "invoices_unpaid", severity: "warning", count: 12, message: "미납 청구서 12건" },
  { code: "lecture_videos_failed", severity: "critical", count: 2, message: "영상 인코딩 실패 2건" },
];

/* The same fixtures Dashboard.test.tsx uses, so this file exercises a page
   that renders rather than one stuck on a shape mismatch. */
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
  alerts: ALERTS,
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
  vi.mocked(adminApi.metricsOverview).mockResolvedValue(OVERVIEW);
  vi.mocked(adminApi.metricsTimeseries).mockResolvedValue({
    metric: "signups", range: "30d", points: [],
  } as never);
  vi.mocked(adminApi.metricsMonthlyRevenue).mockResolvedValue(MONTHLY);
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

beforeEach(() => vi.clearAllMocks());

describe("dashboard alerts", () => {
  it("shows every alert to someone who can open all of them", async () => {
    scopes = ["users:read", "content:read", "commerce:read"];
    renderPage();

    expect(await screen.findByText("미납 청구서 12건")).toBeInTheDocument();
    expect(screen.getByText("영상 인코딩 실패 2건")).toBeInTheDocument();
  });

  it("hides the payment alert from a content manager", async () => {
    // content_manager: content + users + ops, and no commerce:read.
    scopes = ["content:read", "content:write", "users:read", "ops:read"];
    renderPage();

    expect(await screen.findByText("영상 인코딩 실패 2건")).toBeInTheDocument();
    expect(screen.queryByText("미납 청구서 12건")).not.toBeInTheDocument();
  });

  it("keeps every alert a link, never a dead card", async () => {
    scopes = ["users:read", "content:read", "commerce:read"];
    renderPage();
    await screen.findByText("미납 청구서 12건");

    // Whatever is shown can be followed — the alternative fix, rendering an
    // unreachable alert as plain text, leaves a card that looks clickable and
    // is not.
    for (const message of ["미납 청구서 12건", "영상 인코딩 실패 2건"]) {
      expect(screen.getByText(message).closest("a")).toHaveAttribute("href");
    }
  });

  it("opens the invoices tab for the unpaid-invoice alert", async () => {
    scopes = ["users:read", "content:read", "commerce:read"];
    renderPage();

    // /payments alone lands on the 결제 tab, not on the invoices it is about.
    expect((await screen.findByText("미납 청구서 12건")).closest("a")).toHaveAttribute(
      "href",
      "/payments?tab=invoices",
    );
  });
});

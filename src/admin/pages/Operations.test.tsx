import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import { OperationsPage } from "./Operations";
import { adminApi } from "../api";
import { proficiencyAdminApi } from "../proficiencyApi";
import type { ScoringQueue } from "../proficiencyApi";

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
    adminApi: { ...actual.adminApi, deadWebhooks: vi.fn(), stuckOutbox: vi.fn(), retryOutbox: vi.fn() },
  };
});

vi.mock("../proficiencyApi", async () => {
  const actual = await vi.importActual<typeof import("../proficiencyApi")>("../proficiencyApi");
  return {
    ...actual,
    proficiencyAdminApi: { ...actual.proficiencyAdminApi, scoringQueue: vi.fn(), retryScoring: vi.fn() },
  };
});

const OPERATOR = ["users:read", "commerce:read", "learners:read", "ops:read", "ops:write"];

const QUEUE: ScoringQueue = {
  max_attempts: 8,
  total: 2,
  exhausted: 1,
  items: [
    {
      attempt_id: "pta_stuck",
      user_id: "usr_1",
      nickname: "haneul",
      email: "ha***@talkhangyul.co.kr",
      family_id: "conv_integrative",
      submitted_at: "2026-10-01T03:00:00Z",
      attempts: 8,
      next_scoring_at: null,
      failure: "error:TimeoutError",
      exhausted: true,
    },
    {
      attempt_id: "pta_waiting",
      user_id: "usr_2",
      nickname: "minsu",
      email: "mi***@talkhangyul.co.kr",
      family_id: "conv_delayed_check",
      submitted_at: "2026-10-15T03:00:00Z",
      attempts: 2,
      next_scoring_at: "2026-10-15T04:00:00Z",
      failure: "scorer:unavailable",
      exhausted: false,
    },
  ],
};

function renderPage(path = "/operations") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <OperationsPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  scopes = OPERATOR;
  vi.mocked(adminApi.deadWebhooks).mockResolvedValue({
    total: 1,
    items: [
      {
        event_id: "evt_1",
        provider: "toss",
        event_type: "PAYMENT_STATUS_CHANGED",
        received_at: "2026-10-15T01:00:00Z",
        dlq_at: "2026-10-15T02:00:00Z",
        attempts: 8,
        processing_error: "KeyError: 'paymentKey'",
      },
    ],
  });
  vi.mocked(adminApi.stuckOutbox).mockResolvedValue({
    total: 2,
    exhausted: 1,
    max_attempts: 10,
    items: [
      {
        event_id: "obx_dead",
        event_type: "payment.failed",
        aggregate_type: "subscription",
        aggregate_id: "sub_9",
        created_at: "2026-10-15T03:00:00Z",
        attempts: 10,
        last_error: "KeyError: 'user_id'",
        exhausted: true,
      },
      {
        event_id: "obx_1",
        event_type: "payment.succeeded",
        aggregate_type: "invoice",
        aggregate_id: "inv_1",
        created_at: "2026-10-15T01:00:00Z",
        attempts: 3,
        last_error: "ConnectionError",
        exhausted: false,
      },
    ],
  });
  vi.mocked(adminApi.retryOutbox).mockResolvedValue({
    event_id: "obx_dead",
    event_type: "payment.failed",
    attempts: 0,
    retry_within_seconds: 5,
  });
  vi.mocked(proficiencyAdminApi.scoringQueue).mockResolvedValue(QUEUE);
  vi.mocked(proficiencyAdminApi.retryScoring).mockResolvedValue({
    attempt_id: "pta_stuck",
    scoring_status: "pending",
    attempts: 0,
  });
});

describe("operations queues", () => {
  it("lists the dead-lettered webhooks the alert counts", async () => {
    renderPage("/operations?tab=webhooks");

    expect(await screen.findByText("PAYMENT_STATUS_CHANGED")).toBeInTheDocument();
    expect(screen.getByText("KeyError: 'paymentKey'")).toBeInTheDocument();
    expect(screen.getByText(/1건이 DLQ에 있습니다/)).toBeInTheDocument();
  });

  it("flags the outbox events the relay gave up on, and retries one after confirming", async () => {
    const user = userEvent.setup();
    renderPage("/operations?tab=outbox");

    const deadRow = (await screen.findByText("payment.failed")).closest("tr")!;
    expect(within(deadRow).getByText("재시도 소진")).toBeInTheDocument();
    expect(within(deadRow).getByText("10/10")).toBeInTheDocument();
    expect(within(deadRow).getByText("KeyError: 'user_id'")).toBeInTheDocument();
    // What is not going out, so the row is actionable without reading code.
    expect(within(deadRow).getByText(/결제 실패 안내/)).toBeInTheDocument();
    // The banner cannot be missed, and carries the alert's count.
    expect(screen.getByRole("alert")).toHaveTextContent("1건");
    expect(screen.getByText(/재시도 소진 1건/)).toBeInTheDocument();
    const stuckRow = screen.getByText("payment.succeeded").closest("tr")!;
    expect(within(stuckRow).getByText("자동 재시도 중")).toBeInTheDocument();
    expect(within(stuckRow).getByText("ConnectionError")).toBeInTheDocument();

    await user.click(within(deadRow).getByRole("button", { name: "다시 전송" }));
    expect(adminApi.retryOutbox).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "다시 전송" }));

    await waitFor(() => expect(adminApi.retryOutbox).toHaveBeenCalledWith("obx_dead"));
    await waitFor(() => expect(adminApi.stuckOutbox).toHaveBeenCalledTimes(2));
  });

  it("offers no outbox retry to an admin who cannot act on operations", async () => {
    scopes = ["users:read", "commerce:read", "learners:read", "ops:read"];
    renderPage("/operations?tab=outbox");

    expect(await screen.findByText("payment.failed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다시 전송" })).not.toBeInTheDocument();
  });

  it("marks exhausted scoring tasks and retries one after confirming", async () => {
    const user = userEvent.setup();
    renderPage("/operations?tab=scoring");

    const stuckRow = (await screen.findByText("haneul")).closest("tr")!;
    expect(within(stuckRow).getByText("재시도 소진")).toBeInTheDocument();
    expect(within(stuckRow).getByText("8/8")).toBeInTheDocument();
    // A task still in the automatic queue retries by itself: no button.
    const waitingRow = screen.getByText("minsu").closest("tr")!;
    expect(within(waitingRow).getByText("자동 재시도 대기")).toBeInTheDocument();
    expect(within(waitingRow).queryByRole("button", { name: "다시 채점" })).not.toBeInTheDocument();

    await user.click(within(stuckRow).getByRole("button", { name: "다시 채점" }));
    expect(proficiencyAdminApi.retryScoring).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "다시 채점" }));

    await waitFor(() => expect(proficiencyAdminApi.retryScoring).toHaveBeenCalledWith("pta_stuck"));
    await waitFor(() => expect(proficiencyAdminApi.scoringQueue).toHaveBeenCalledTimes(2));
  });

  it("offers no retry to an admin who cannot act on operations", async () => {
    scopes = ["users:read", "commerce:read", "learners:read", "ops:read"];
    renderPage("/operations?tab=scoring");

    expect(await screen.findByText("haneul")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "다시 채점" })).not.toBeInTheDocument();
  });

  it("shows only the tabs the admin can open", async () => {
    // An educator reads learners but not payments.
    scopes = ["content:read", "learners:read", "analytics:read"];
    renderPage("/operations?tab=webhooks");

    expect(await screen.findByText("haneul")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "결제 웹훅 (DLQ)" })).not.toBeInTheDocument();
    expect(adminApi.deadWebhooks).not.toHaveBeenCalled();
  });

  it("refuses an admin who can open none of the queues", () => {
    scopes = ["content:read", "users:read", "ops:read"];
    renderPage();

    expect(screen.getByText("접근 권한이 없습니다")).toBeInTheDocument();
  });
});

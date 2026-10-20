/**
 * Refunding a payment from the payments list. The API is stubbed, so these
 * assertions are about who sees the action, what the dialog sends and how a
 * refusal reads.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import { ApiError } from "../../lib/http";
import type { AdminInvoiceRow, AdminPaymentRow } from "../api";

const listPayments = vi.fn();
const refundPayment = vi.fn();
const listInvoices = vi.fn();
const invoiceRetryEligibility = vi.fn();
const retryInvoice = vi.fn();
let scopes = new Set<string>(["commerce:read", "commerce:write"]);

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      listPayments: (q: unknown) => listPayments(q),
      refundPayment: (id: string, body: unknown) => refundPayment(id, body),
      listInvoices: (q: unknown) => listInvoices(q),
      invoiceRetryEligibility: (id: string) => invoiceRetryEligibility(id),
      retryInvoice: (id: string) => retryInvoice(id),
    },
  };
});
vi.mock("../auth", () => ({ useAdminAuth: () => ({ can: (s: string) => scopes.has(s) }) }));

const { PaymentsPage, parseRefundAmount, refundErrorMessage, retryBlockedMessage, retryErrorMessage } =
  await import("./Payments");

function row(overrides: Partial<AdminPaymentRow> = {}): AdminPaymentRow {
  return {
    payment_id: "pay_7f3a9c2e1b",
    invoice_id: "inv_5d1e8a0c44",
    user_id: "usr_member_01",
    user_email: "member@talkhangyul.co.kr",
    provider: "toss_card",
    amount_cents: 15000,
    refunded_amount_cents: 0,
    currency: "KRW",
    status: "succeeded",
    failure_class: null,
    failure_reason: null,
    paid_at: "2026-10-01T00:00:00Z",
    created_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

function page(items: AdminPaymentRow[]) {
  return { items, total: items.length, page: 1, page_size: 25 };
}

function renderPage(path = "/payments") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <PaymentsPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  listPayments.mockReset();
  refundPayment.mockReset();
  listInvoices.mockReset();
  invoiceRetryEligibility.mockReset();
  retryInvoice.mockReset();
  scopes = new Set(["commerce:read", "commerce:write"]);
});

describe("who can refund what", () => {
  it("offers a refund only on a succeeded payment with money left", async () => {
    listPayments.mockResolvedValue(
      page([
        row(),
        row({ payment_id: "pay_done", user_email: "full@talkhangyul.co.kr", refunded_amount_cents: 15000, status: "refunded" }),
      ]),
    );
    renderPage();
    await screen.findByText("member@talkhangyul.co.kr");
    expect(screen.getAllByRole("button", { name: "환불" })).toHaveLength(1);
  });

  it("hides the action without commerce:write", async () => {
    scopes = new Set(["commerce:read"]);
    listPayments.mockResolvedValue(page([row()]));
    renderPage();
    await screen.findByText("member@talkhangyul.co.kr");
    expect(screen.queryByRole("button", { name: "환불" })).toBeNull();
  });
});

describe("the refund dialog", () => {
  it("refunds the remaining amount after a confirmation, without showing ids", async () => {
    listPayments.mockResolvedValue(page([row({ refunded_amount_cents: 5000 })]));
    refundPayment.mockResolvedValue({
      payment_id: "pay_7f3a9c2e1b", status: "refunded", amount_cents: 15000,
      refunded_amount_cents: 15000, refund_amount_cents: 10000, currency: "KRW",
      invoice_status: "refunded",
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "환불" }));

    const dialog = screen.getByRole("dialog", { name: "결제 환불" });
    expect(within(dialog).getByLabelText("환불 금액")).toHaveValue("10000");
    expect(within(dialog).getByRole("button", { name: "환불하기" })).toBeDisabled();
    await user.type(within(dialog).getByLabelText("환불 사유"), "중복 결제");
    await user.click(within(dialog).getByRole("button", { name: "환불하기" }));

    // A second, explicit confirmation before anything is sent.
    expect(refundPayment).not.toHaveBeenCalled();
    const confirm = screen.getByRole("dialog", { name: "환불할까요?" });
    expect(confirm).toHaveTextContent("₩10,000");
    await user.click(within(confirm).getByRole("button", { name: "환불" }));

    await waitFor(() =>
      expect(refundPayment).toHaveBeenCalledWith("pay_7f3a9c2e1b", {
        amount_cents: 10000,
        reason: "중복 결제",
        // One id per refund, re-sent on a retry so the provider never refunds twice.
        request_id: expect.stringMatching(/^[A-Za-z0-9_-]{6,64}$/),
      }),
    );
    expect(await screen.findByText("₩10,000을 환불했습니다.")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("pay_7f3a9c2e1b");
    expect(document.body.textContent).not.toContain("inv_5d1e8a0c44");
  });

  it("sends a partial amount in cents for a USD payment", async () => {
    listPayments.mockResolvedValue(page([row({ amount_cents: 1299, currency: "USD", provider: "toss_intl_card" })]));
    refundPayment.mockResolvedValue({
      payment_id: "pay_7f3a9c2e1b", status: "succeeded", amount_cents: 1299,
      refunded_amount_cents: 550, refund_amount_cents: 550, currency: "USD", invoice_status: "paid",
    });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "환불" }));
    const dialog = screen.getByRole("dialog", { name: "결제 환불" });
    const amount = within(dialog).getByLabelText("환불 금액");
    expect(amount).toHaveValue("12.99");
    await user.clear(amount);
    await user.type(amount, "5.50");
    await user.type(within(dialog).getByLabelText("환불 사유"), "부분 환불");
    await user.click(within(dialog).getByRole("button", { name: "환불하기" }));
    await user.click(within(screen.getByRole("dialog", { name: "환불할까요?" })).getByRole("button", { name: "환불" }));
    await waitFor(() =>
      expect(refundPayment).toHaveBeenCalledWith("pay_7f3a9c2e1b", {
        amount_cents: 550,
        reason: "부분 환불",
        request_id: expect.any(String),
      }),
    );
  });

  it("refuses an amount over what is left", async () => {
    listPayments.mockResolvedValue(page([row()]));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "환불" }));
    const dialog = screen.getByRole("dialog", { name: "결제 환불" });
    const amount = within(dialog).getByLabelText("환불 금액");
    await user.clear(amount);
    await user.type(amount, "20000");
    await user.type(within(dialog).getByLabelText("환불 사유"), "사유");
    expect(within(dialog).getByText(/환불 가능 금액\(₩15,000\)을 넘었습니다/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "환불하기" })).toBeDisabled();
  });

  it("explains a refusal from the provider and keeps the dialog open", async () => {
    listPayments.mockResolvedValue(page([row()]));
    refundPayment.mockRejectedValue(new ApiError(422, "payment_method.refund_refused", "Toss refused the cancel"));
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "환불" }));
    await user.type(screen.getByLabelText("환불 사유"), "고객 요청");
    await user.click(screen.getByRole("button", { name: "환불하기" }));
    await user.click(within(screen.getByRole("dialog", { name: "환불할까요?" })).getByRole("button", { name: "환불" }));
    const dialog = await screen.findByRole("dialog", { name: "결제 환불" });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("결제사가 환불을 거절했습니다");
  });
});

describe("retrying after the provider's answer was lost", () => {
  it("re-sends the same request_id and amount, with the fields frozen", async () => {
    listPayments.mockResolvedValue(page([row()]));
    refundPayment
      .mockRejectedValueOnce(new ApiError(502, "payment_method.provider_unavailable", "Toss did not answer"))
      .mockResolvedValueOnce({
        payment_id: "pay_7f3a9c2e1b", status: "succeeded", amount_cents: 15000,
        refunded_amount_cents: 5000, refund_amount_cents: 5000, currency: "KRW", invoice_status: "paid",
      });
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "환불" }));
    const dialog = screen.getByRole("dialog", { name: "결제 환불" });
    const amount = within(dialog).getByLabelText("환불 금액");
    await user.clear(amount);
    await user.type(amount, "5000");
    await user.type(within(dialog).getByLabelText("환불 사유"), "일부 환불");
    await user.click(within(dialog).getByRole("button", { name: "환불하기" }));
    await user.click(within(screen.getByRole("dialog", { name: "환불할까요?" })).getByRole("button", { name: "환불" }));

    // Unknown outcome: the dialog comes back (re-mounted after the confirm
    // step) and says what to do.
    const again = await screen.findByRole("dialog", { name: "결제 환불" });
    expect(within(again).getByRole("alert")).toHaveTextContent("같은 금액으로 다시 시도");
    // The amount and reason can no longer change: the server's idempotency key
    // includes the amount, so another amount would be a second refund.
    expect(within(again).getByLabelText("환불 금액")).toHaveValue("5000");
    expect(within(again).getByLabelText("환불 금액")).toHaveAttribute("readonly");
    expect(within(again).getByLabelText("환불 사유")).toHaveAttribute("readonly");
    expect(within(again).getByText(/같은 금액으로만 다시 보낼 수 있어요/)).toBeInTheDocument();

    await user.click(within(again).getByRole("button", { name: "같은 금액으로 다시 시도" }));
    await user.click(within(screen.getByRole("dialog", { name: "환불할까요?" })).getByRole("button", { name: "환불" }));
    await waitFor(() => expect(refundPayment).toHaveBeenCalledTimes(2));
    const [first, second] = refundPayment.mock.calls.map((c) => c[1] as { amount_cents: number; request_id: string });
    expect(second.request_id).toBe(first.request_id);
    expect(second.amount_cents).toBe(5000);
    expect(await screen.findByText("₩5,000을 환불했습니다.")).toBeInTheDocument();
  });

  it("starts every new refund with a new request_id", async () => {
    listPayments.mockResolvedValue(page([row({ refunded_amount_cents: 1000 })]));
    refundPayment.mockRejectedValue(new ApiError(422, "payment_method.refund_refused", "no"));
    const user = userEvent.setup();
    renderPage();
    for (let i = 0; i < 2; i++) {
      await user.click(await screen.findByRole("button", { name: "환불" }));
      const dialog = screen.getByRole("dialog", { name: "결제 환불" });
      await user.type(within(dialog).getByLabelText("환불 사유"), "사유");
      await user.click(within(dialog).getByRole("button", { name: "환불하기" }));
      await user.click(within(screen.getByRole("dialog", { name: "환불할까요?" })).getByRole("button", { name: "환불" }));
      const again = await screen.findByRole("dialog", { name: "결제 환불" });
      await within(again).findByRole("alert");
      await user.click(within(again).getByRole("button", { name: "취소" }));
    }
    const ids = refundPayment.mock.calls.map((c) => (c[1] as { request_id: string }).request_id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });
});

describe("the payments list", () => {
  it("names the provider and filters by it", async () => {
    listPayments.mockResolvedValue(page([row({ provider: "toss_intl_card", currency: "USD", amount_cents: 1299 })]));
    const user = userEvent.setup();
    renderPage("/payments?status=failed&provider=toss_card");
    expect(await screen.findByText("토스페이먼츠 해외카드")).toBeInTheDocument();
    expect(screen.getByText("US$12.99")).toBeInTheDocument();
    // Filters from the URL (a dashboard alert's link) are sent as given.
    expect(listPayments).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "failed", provider: "toss_card", page: 1 }),
    );
    await user.click(screen.getByRole("button", { name: "결제사" }));
    await user.click(await screen.findByRole("option", { name: "네이버페이" }));
    await waitFor(() =>
      expect(listPayments).toHaveBeenLastCalledWith(expect.objectContaining({ provider: "naver_pay", page: 1 })),
    );
  });
});

describe("helpers", () => {
  it("parses won as whole numbers and dollars to two decimals", () => {
    expect(parseRefundAmount("15,000", "KRW")).toBe(15000);
    expect(parseRefundAmount("12.5", "KRW")).toBeNull();
    expect(parseRefundAmount("12.99", "USD")).toBe(1299);
    expect(parseRefundAmount("0.1", "USD")).toBe(10);
    expect(parseRefundAmount("1.999", "USD")).toBeNull();
    expect(parseRefundAmount("0", "USD")).toBeNull();
    expect(parseRefundAmount("-5", "KRW")).toBeNull();
    expect(parseRefundAmount("", "KRW")).toBeNull();
  });

  it("tells an unknown provider outcome apart from a refusal", () => {
    expect(refundErrorMessage(new ApiError(502, "payment_method.provider_unavailable", "x"))).toContain(
      "같은 금액으로 다시 시도",
    );
    expect(refundErrorMessage(new ApiError(422, "billing.refund_exceeds_invoice", "x"))).toContain(
      "환불 가능한 금액을 넘었습니다",
    );
    expect(refundErrorMessage(new ApiError(404, "billing.payment_not_found", "x"))).toBe("결제를 찾을 수 없습니다.");
  });
});

/* ------------------------------ invoice retries ------------------------------ */

function invoice(overrides: Partial<AdminInvoiceRow> = {}): AdminInvoiceRow {
  return {
    invoice_id: "inv_5d1e8a0c44",
    user_id: "usr_member_01",
    user_email: "member@talkhangyul.co.kr",
    subscription_id: "sub_1",
    plan_name: "프리미엄 월간",
    subtotal_cents: 9900,
    discount_cents: 0,
    total_cents: 9900,
    refunded_cents: 0,
    currency: "KRW",
    status: "open",
    coupon_code: null,
    paid_at: null,
    created_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

function eligibility(overrides: Record<string, unknown> = {}) {
  return {
    invoice_id: "inv_5d1e8a0c44",
    allowed: true,
    reason: null,
    error_code: null,
    message: "",
    retry_after: null,
    replays_pending: false,
    manual_retries_today: 1,
    manual_retry_limit: 3,
    attempts: 2,
    max_attempts: 10,
    ...overrides,
  };
}

async function openRetry() {
  renderPage("/payments?tab=invoices");
  await userEvent.click(await screen.findByRole("button", { name: "결제 재시도" }));
  return screen.findByRole("dialog");
}

describe("retrying an invoice", () => {
  it("offers a retry only on open invoices, and only with commerce:write", async () => {
    listInvoices.mockResolvedValue({
      items: [invoice(), invoice({ invoice_id: "inv_paid", status: "paid" })],
      total: 2,
      page: 1,
      page_size: 25,
    });
    const { unmount } = renderPage("/payments?tab=invoices");
    expect(await screen.findAllByRole("button", { name: "결제 재시도" })).toHaveLength(1);
    unmount();

    scopes = new Set(["commerce:read"]);
    renderPage("/payments?tab=invoices");
    await screen.findAllByText("member@talkhangyul.co.kr");
    expect(screen.queryByRole("button", { name: "결제 재시도" })).not.toBeInTheDocument();
  });

  it("shows the counters, retries, and reports the outcome", async () => {
    listInvoices.mockResolvedValue({ items: [invoice()], total: 1, page: 1, page_size: 25 });
    invoiceRetryEligibility.mockResolvedValue(eligibility());
    retryInvoice.mockResolvedValue({
      invoice_id: "inv_5d1e8a0c44",
      invoice_status: "open",
      attempt_id: "pa_3",
      attempt_no: 3,
      attempt_status: "failed",
      failure_class: "insufficient_funds",
      failure_code: "REJECT_CARD_PAYMENT",
    });
    const dialog = await openRetry();
    expect(await within(dialog).findByText("1/3")).toBeInTheDocument();
    expect(within(dialog).getByText("2/10")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "지금 결제 시도" }));
    expect(retryInvoice).toHaveBeenCalledWith("inv_5d1e8a0c44");
    // The failure class in words, never the raw code.
    expect(await within(dialog).findByText(/결제가 거절되었습니다 \(시도 #3, 잔액 부족\)/)).toBeInTheDocument();
    // One attempt per dialog: the send button is gone once it ran.
    expect(within(dialog).queryByRole("button", { name: "지금 결제 시도" })).not.toBeInTheDocument();
  });

  it("explains a blocked retry before anything is sent", async () => {
    listInvoices.mockResolvedValue({ items: [invoice()], total: 1, page: 1, page_size: 25 });
    invoiceRetryEligibility.mockResolvedValue(
      eligibility({
        allowed: false,
        reason: "cooldown",
        error_code: "billing.retry_limit_reached",
        retry_after: "2026-10-01T00:10:00Z",
      }),
    );
    const dialog = await openRetry();
    expect(await within(dialog).findByText(/방금 결제를 시도했습니다/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "지금 결제 시도" })).toBeDisabled();
    expect(retryInvoice).not.toHaveBeenCalled();
  });

  it("shows the server's reason when the retry is refused at send time", async () => {
    listInvoices.mockResolvedValue({ items: [invoice()], total: 1, page: 1, page_size: 25 });
    invoiceRetryEligibility.mockResolvedValue(eligibility());
    retryInvoice.mockRejectedValue(
      new ApiError(429, "billing.retry_limit_reached", "x", { reason: "daily_limit", retry_after: null }),
    );
    const dialog = await openRetry();
    await userEvent.click(await within(dialog).findByRole("button", { name: "지금 결제 시도" }));
    expect(await within(dialog).findByText(/운영자 재시도 한도를 모두 사용했습니다/)).toBeInTheDocument();
  });

  it("words each refusal for an operator", () => {
    expect(retryBlockedMessage("obsolete")).toMatch(/현재 결제 기간의 청구서가 아닙니다/);
    expect(retryBlockedMessage("method_unusable")).toMatch(/새 결제수단을 등록해야/);
    expect(retryBlockedMessage("attempt_cap")).toMatch(/10회/);
    expect(retryErrorMessage(new ApiError(409, "billing.charge_in_progress", "x"))).toMatch(/처리 중/);
    expect(retryErrorMessage(new ApiError(409, "billing.cannot_retry_paid", "x"))).toBe("이미 결제된 청구서입니다.");
  });
});

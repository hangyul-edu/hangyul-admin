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
import type { AdminPaymentRow } from "../api";

const listPayments = vi.fn();
const refundPayment = vi.fn();
let scopes = new Set<string>(["commerce:read", "commerce:write"]);

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      listPayments: (q: unknown) => listPayments(q),
      refundPayment: (id: string, body: unknown) => refundPayment(id, body),
    },
  };
});
vi.mock("../auth", () => ({ useAdminAuth: () => ({ can: (s: string) => scopes.has(s) }) }));

const { PaymentsPage, parseRefundAmount, refundErrorMessage } = await import("./Payments");

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

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/payments"]}>
          <PaymentsPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  listPayments.mockReset();
  refundPayment.mockReset();
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

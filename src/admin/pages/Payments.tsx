import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { adminApi } from "../api";
import type { AdminInvoiceRow, AdminPaymentRow, AdminRetryResult } from "../api";
import { ApiError, errorMessage } from "../../lib/http";
import { randomUuid } from "../../lib/uuid";
import { useToast } from "../../hooks/toast";
import { useAdminAuth } from "../auth";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Dl,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Modal,
  Pagination,
  SearchBox,
  Select,
  Textarea,
  statusLabel,
  statusTone,
} from "../components/kit";
import {
  formatDateTime,
  formatMoney,
  isZeroDecimal,
  toMajorUnits,
} from "../lib/format";
import type { Column } from "../components/kit";

/** What is left to refund on a payment, in minor units. */
function refundableCents(p: AdminPaymentRow): number {
  return Math.max(p.amount_cents - p.refunded_amount_cents, 0);
}

/**
 * The admin's typed amount (major units: won, or dollars with up to two
 * decimals) as minor units, or null when it is not a valid amount.
 */
export function parseRefundAmount(input: string, currency: string): number | null {
  const text = input.trim().replace(/,/g, "");
  const pattern = isZeroDecimal(currency) ? /^\d+$/ : /^\d+(\.\d{1,2})?$/;
  if (!pattern.test(text)) return null;
  const minor = isZeroDecimal(currency) ? Number(text) : Math.round(Number(text) * 100);
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

/** Operator-facing sentence for a refund the server did not complete. */
export function refundErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "payment_method.refund_refused":
        return "결제사가 환불을 거절했습니다. 환불된 금액은 없습니다.";
      case "payment_method.provider_unavailable":
        return "결제사의 응답을 확인하지 못했습니다. 기록된 환불은 없습니다. 같은 금액으로 다시 시도하면 중복 환불 없이 처리됩니다.";
      case "payment_method.provider_not_configured":
        return "이 결제사의 연동 정보가 설정되어 있지 않아 환불할 수 없습니다.";
      case "billing.refund_exceeds_invoice":
        return "환불 가능한 금액을 넘었습니다. 목록을 새로 고친 뒤 다시 확인해 주세요.";
      case "billing.payment_not_refundable":
        return "성공한 결제만 환불할 수 있습니다.";
      case "billing.payment_not_found":
        return "결제를 찾을 수 없습니다.";
    }
  }
  return errorMessage(error);
}

function RefundDialog({
  payment,
  onClose,
}: {
  payment: AdminPaymentRow;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const remaining = refundableCents(payment);
  const [amount, setAmount] = useState(String(toMajorUnits(remaining, payment.currency)));
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // One id for this refund dialog: a retry after an unknown outcome (502)
  // re-sends it, so Toss answers the first request instead of refunding twice.
  const [requestId] = useState(() => randomUuid());

  const amountCents = parseRefundAmount(amount, payment.currency);
  const amountError =
    amount.trim() === ""
      ? null
      : amountCents === null
        ? isZeroDecimal(payment.currency)
          ? "1 이상의 정수로 입력해 주세요."
          : "0보다 큰 금액을 소수점 둘째 자리까지 입력해 주세요."
        : amountCents > remaining
          ? `환불 가능 금액(${formatMoney(remaining, payment.currency)})을 넘었습니다.`
          : null;
  const valid = amountCents !== null && amountCents <= remaining && reason.trim().length > 0;

  const refund = useMutation({
    mutationFn: () =>
      adminApi.refundPayment(payment.payment_id, {
        amount_cents: amountCents ?? undefined,
        reason: reason.trim(),
        request_id: requestId,
      }),
    onSuccess: (result) => {
      toast.success(`${formatMoney(result.refund_amount_cents, result.currency)}을 환불했습니다.`);
      void qc.invalidateQueries({ queryKey: ["admin", "payments"] });
      void qc.invalidateQueries({ queryKey: ["admin", "invoices"] });
      onClose();
    },
    onError: (error) => {
      setConfirming(false);
      setFailure(refundErrorMessage(error));
    },
  });

  return (
    <>
      <Modal
        open={!confirming}
        title="결제 환불"
        onClose={refund.isPending ? () => {} : onClose}
        footer={
          <>
            <Button variant="ghost" onClick={onClose} disabled={refund.isPending}>
              취소
            </Button>
            <Button
              variant="danger"
              disabled={!valid}
              onClick={() => {
                setFailure(null);
                setConfirming(true);
              }}
            >
              환불하기
            </Button>
          </>
        }
      >
        <Dl
          items={[
            ["회원", payment.user_email ?? "(탈퇴한 사용자)"],
            ["결제사", payment.provider],
            ["결제 금액", formatMoney(payment.amount_cents, payment.currency)],
            ["환불된 금액", formatMoney(payment.refunded_amount_cents, payment.currency)],
            ["환불 가능 금액", formatMoney(remaining, payment.currency)],
          ]}
        />
        <Field
          label={`환불 금액 (${payment.currency.toUpperCase()})`}
          required
          hint="일부만 환불하려면 금액을 줄이세요."
          error={amountError}
        >
          <Input
            inputMode={isZeroDecimal(payment.currency) ? "numeric" : "decimal"}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-label="환불 금액"
          />
        </Field>
        <Field label="환불 사유" required hint="결제사에 취소 사유로 전달되고 감사 로그에 남습니다. 최대 200자.">
          <Textarea
            value={reason}
            maxLength={200}
            rows={3}
            onChange={(e) => setReason(e.target.value)}
            aria-label="환불 사유"
          />
        </Field>
        {failure && (
          <span className="hgadm-field__error" role="alert">
            {failure}
          </span>
        )}
      </Modal>
      <ConfirmDialog
        open={confirming}
        title="환불할까요?"
        message={`${payment.user_email ?? "탈퇴한 사용자"}님의 결제에서 ${
          amountCents !== null ? formatMoney(amountCents, payment.currency) : ""
        }을 환불합니다. 결제사에 바로 취소가 요청되며 되돌릴 수 없습니다.`}
        danger
        confirmLabel="환불"
        loading={refund.isPending}
        onConfirm={() => refund.mutate()}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

/**
 * Why an operator retry is refused (`reason` from retry-eligibility, or
 * `details.reason` of a refused POST …/retry), in the operator's words.
 * Each charge is a real authorisation at the card company, so retries are
 * spaced (10 minutes on the same card), counted (3 per 24 hours by operators,
 * separately from the member's 3) and capped (10 attempts per invoice).
 */
export function retryBlockedMessage(reason: string | null | undefined, retryAfter?: string | null): string {
  const after = retryAfter ? formatDateTime(retryAfter) : null;
  switch (reason) {
    case "paid":
      return "이미 결제된 청구서입니다.";
    case "closed":
      return "무효 또는 환불된 청구서라 더 이상 결제할 수 없습니다.";
    case "obsolete":
      return "현재 결제 기간의 청구서가 아닙니다. 이전 기간의 청구서는 재시도하면 지금 기간을 예전 금액으로 결제하게 되어 막혀 있습니다.";
    case "cancelled":
      return "구독이 해지되어 있습니다. 회원이 구독을 재개한 뒤에 재시도할 수 있습니다.";
    case "in_progress":
      return "이전 결제 시도가 아직 결제사에서 처리 중입니다. 결과가 기록된 뒤 다시 확인해 주세요.";
    case "cooldown":
      return `같은 결제수단으로 방금 결제를 시도했습니다. 카드사 연속 승인 제한을 피하려고 10분 간격을 둡니다${
        after ? ` (${after} 이후 가능)` : ""
      }.`;
    case "daily_limit":
      return `이 청구서는 지난 24시간 동안 운영자 재시도 한도를 모두 사용했습니다${after ? ` (${after} 이후 가능)` : ""}.`;
    case "attempt_cap":
      return "이 청구서는 허용된 결제 시도 횟수(10회)를 모두 사용했습니다. 회원에게 새 결제수단 등록이나 재구독을 안내해 주세요.";
    case "no_payment_method":
      return "결제할 수 있는 결제수단이 없습니다. 회원이 결제수단을 등록해야 합니다.";
    case "method_unusable":
      return "청구될 결제수단이 만료·해지되었거나 통화가 맞지 않아 재시도해도 실패합니다. 회원이 새 결제수단을 등록해야 합니다.";
    default:
      return "지금은 이 청구서를 재시도할 수 없습니다.";
  }
}

/** Operator-facing sentence for a retry the server refused or could not run. */
export function retryErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const reason = typeof error.details?.reason === "string" ? error.details.reason : null;
    const retryAfter = typeof error.details?.retry_after === "string" ? error.details.retry_after : null;
    if (reason) return retryBlockedMessage(reason, retryAfter);
    switch (error.code) {
      case "billing.cannot_retry_paid":
        return retryBlockedMessage("paid");
      case "billing.charge_in_progress":
        return retryBlockedMessage("in_progress");
      case "billing.invoice_not_found":
        return "청구서를 찾을 수 없습니다.";
      case "billing.key_management_unavailable":
        return "결제 키를 읽을 수 없어 결제를 보내지 않았습니다. 잠시 뒤 다시 시도해 주세요.";
    }
  }
  return errorMessage(error);
}

/** The outcome of an operator retry, in one sentence. */
export function retryOutcomeMessage(result: AdminRetryResult): string {
  if (result.invoice_status === "paid") return `결제되었습니다 (시도 #${result.attempt_no}).`;
  if (result.attempt_status === "failed") {
    return `결제가 거절되었습니다 (시도 #${result.attempt_no}${result.failure_class ? `, ${result.failure_class}` : ""}). 자동 재시도 일정은 그대로 이어집니다.`;
  }
  return `결제사가 아직 결과를 주지 않았습니다 (시도 #${result.attempt_no}). 결제 스윕이 같은 요청으로 다시 확인합니다.`;
}

function RetryDialog({ invoice, onClose }: { invoice: AdminInvoiceRow; onClose: () => void }) {
  const qc = useQueryClient();
  const [result, setResult] = useState<AdminRetryResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const eligibility = useQuery({
    queryKey: ["admin", "invoice-retry", invoice.invoice_id],
    queryFn: () => adminApi.invoiceRetryEligibility(invoice.invoice_id),
    staleTime: 0,
  });

  const retry = useMutation({
    mutationFn: () => adminApi.retryInvoice(invoice.invoice_id),
    onSuccess: (outcome) => {
      setResult(outcome);
      setFailure(null);
    },
    onError: (error) => {
      setFailure(retryErrorMessage(error));
      void eligibility.refetch();
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "invoices"] });
      void qc.invalidateQueries({ queryKey: ["admin", "payments"] });
    },
  });

  const info = eligibility.data;
  const canSend = !!info?.allowed && !result && !retry.isPending;

  return (
    <Modal
      open
      title="결제 재시도"
      onClose={retry.isPending ? () => {} : onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={retry.isPending}>
            {result ? "닫기" : "취소"}
          </Button>
          {!result && (
            <Button
              variant="primary"
              disabled={!canSend}
              loading={retry.isPending}
              onClick={() => retry.mutate()}
            >
              지금 결제 시도
            </Button>
          )}
        </>
      }
    >
      <Dl
        items={[
          ["회원", invoice.user_email ?? "(탈퇴한 사용자)"],
          ["요금제", invoice.plan_name],
          ["금액", formatMoney(invoice.total_cents, invoice.currency)],
          ["상태", statusLabel(invoice.status)],
          ...(info
            ? ([
                ["오늘 재시도", `${info.manual_retries_today}/${info.manual_retry_limit}`],
                ["시도", `${info.attempts}/${info.max_attempts}`],
              ] as [string, string][])
            : []),
        ]}
      />
      {eligibility.isPending ? (
        <LoadingState />
      ) : eligibility.isError ? (
        <ErrorState message={retryErrorMessage(eligibility.error)} onRetry={() => void eligibility.refetch()} />
      ) : result ? (
        <p className="hgadm-retry__outcome" role="status">
          {retryOutcomeMessage(result)}
        </p>
      ) : info?.allowed ? (
        <p className="hgadm-retry__note">
          {info.replays_pending
            ? "이전 결제가 결제사에서 아직 결정되지 않았습니다. 같은 요청(같은 멱등키)으로 결과를 다시 확인하므로 중복 결제되지 않습니다."
            : "회원의 기본 결제수단으로 지금 바로 결제를 시도합니다. 시도와 결과는 감사 로그에 기록됩니다."}
        </p>
      ) : (
        <p className="hgadm-retry__blocked" role="alert">
          {retryBlockedMessage(info?.reason, info?.retry_after)}
        </p>
      )}
      {failure && (
        <span className="hgadm-field__error" role="alert">
          {failure}
        </span>
      )}
    </Modal>
  );
}

export function PaymentsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "invoices" ? "invoices" : "payments";
  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>결제·청구서</h1>
          <div className="hgadm-page-head__desc">
            결제 시도와 청구서 전체 내역입니다. 결제 수단 정보는 항상 마스킹된
            형태로만 저장·표시됩니다.
          </div>
        </div>
      </div>
      <div className="hgadm-tabs">
        <button
          className={`hgadm-tab ${tab === "payments" ? "active" : ""}`}
          onClick={() => setParams({ tab: "payments" }, { replace: true })}
        >
          결제
        </button>
        <button
          className={`hgadm-tab ${tab === "invoices" ? "active" : ""}`}
          onClick={() => setParams({ tab: "invoices" }, { replace: true })}
        >
          청구서
        </button>
      </div>
      {tab === "payments" ? <PaymentsTab /> : <InvoicesTab />}
    </div>
  );
}

function PaymentsTab() {
  const navigate = useNavigate();
  const { can } = useAdminAuth();
  const canRefund = can("commerce:write");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [refunding, setRefunding] = useState<AdminPaymentRow | null>(null);
  const pageSize = 25;

  const query = useQuery({
    queryKey: ["admin", "payments", { q, status, page }],
    queryFn: () =>
      adminApi.listPayments({
        q: q || undefined,
        status: status || undefined,
        page,
        page_size: pageSize,
      }),
  });

  const columns: Column<AdminPaymentRow>[] = [
    {
      key: "payment",
      header: "결제",
      render: (p) => (
        <div className="hgadm-cell-main">{p.user_email ?? "(탈퇴한 사용자)"}</div>
      ),
    },
    {
      key: "amount",
      header: "금액",
      numeric: true,
      render: (p) => (
        <div>
          <div className="hgadm-cell-main">{formatMoney(p.amount_cents, p.currency)}</div>
          {p.refunded_amount_cents > 0 && (
            <div className="hgadm-cell-sub">
              환불 {formatMoney(p.refunded_amount_cents, p.currency)}
            </div>
          )}
        </div>
      ),
    },
    { key: "provider", header: "결제사", render: (p) => p.provider },
    {
      key: "status",
      header: "상태",
      render: (p) => (
        <div>
          <Badge tone={statusTone(p.status)}>{statusLabel(p.status)}</Badge>
          {p.failure_class && <div className="hgadm-cell-sub">{p.failure_class}</div>}
        </div>
      ),
    },
    { key: "paid", header: "결제일", render: (p) => formatDateTime(p.paid_at ?? p.created_at) },
  ];
  if (canRefund) {
    columns.push({
      key: "actions",
      header: "",
      render: (p) =>
        p.status === "succeeded" && refundableCents(p) > 0 ? (
          <Button
            size="sm"
            variant="danger-soft"
            onClick={(e) => {
              // The row itself opens the member.
              e.stopPropagation();
              setRefunding(p);
            }}
          >
            환불
          </Button>
        ) : null,
    });
  }

  return (
    <div className="hgadm-card">
      {refunding && <RefundDialog payment={refunding} onClose={() => setRefunding(null)} />}
      <div className="hgadm-toolbar">
        <SearchBox
          value={q}
          placeholder="이메일·결제 ID·사용자 ID 검색"
          onSearch={(next) => {
            setQ(next);
            setPage(1);
          }}
        />
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">상태: 전체</option>
          {["succeeded", "failed", "refunded"].map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </Select>
      </div>
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={query.data.items}
            rowKey={(p) => p.payment_id}
            onRowClick={(p) => p.user_id && navigate(`/users/${p.user_id}`)}
            empty="결제 내역이 없습니다."
          />
          <Pagination
            page={query.data.page}
            pageSize={query.data.page_size}
            total={query.data.total}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}

function InvoicesTab() {
  const navigate = useNavigate();
  const { can } = useAdminAuth();
  const canRetry = can("commerce:write");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [retrying, setRetrying] = useState<AdminInvoiceRow | null>(null);
  const pageSize = 25;

  const query = useQuery({
    queryKey: ["admin", "invoices", { q, status, page }],
    queryFn: () =>
      adminApi.listInvoices({
        q: q || undefined,
        status: status || undefined,
        page,
        page_size: pageSize,
      }),
  });

  const columns: Column<AdminInvoiceRow>[] = [
    {
      key: "invoice",
      header: "청구서",
      render: (inv) => (
        <div className="hgadm-cell-main">{inv.user_email ?? "(탈퇴한 사용자)"}</div>
      ),
    },
    { key: "plan", header: "요금제", render: (inv) => inv.plan_name },
    {
      key: "amount",
      header: "금액",
      numeric: true,
      render: (inv) => (
        <div>
          <div className="hgadm-cell-main">{formatMoney(inv.total_cents, inv.currency)}</div>
          {inv.discount_cents > 0 && (
            <div className="hgadm-cell-sub">
              할인 {formatMoney(inv.discount_cents, inv.currency)}
              {inv.coupon_code ? ` (${inv.coupon_code})` : ""}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "상태",
      render: (inv) => <Badge tone={statusTone(inv.status)}>{statusLabel(inv.status)}</Badge>,
    },
    { key: "paid", header: "결제일", render: (inv) => formatDateTime(inv.paid_at) },
    { key: "created", header: "생성일", render: (inv) => formatDateTime(inv.created_at) },
  ];
  if (canRetry) {
    columns.push({
      key: "actions",
      header: "",
      render: (inv) =>
        inv.status === "open" || inv.status === "unpaid" ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => {
              // The row itself opens the member.
              e.stopPropagation();
              setRetrying(inv);
            }}
          >
            결제 재시도
          </Button>
        ) : null,
    });
  }

  return (
    <div className="hgadm-card">
      {retrying && <RetryDialog invoice={retrying} onClose={() => setRetrying(null)} />}
      <div className="hgadm-toolbar">
        <SearchBox
          value={q}
          placeholder="이메일·청구서 ID 검색"
          onSearch={(next) => {
            setQ(next);
            setPage(1);
          }}
        />
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">상태: 전체</option>
          {["open", "paid", "unpaid", "refunded", "void"].map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </Select>
      </div>
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={query.data.items}
            rowKey={(inv) => inv.invoice_id}
            onRowClick={(inv) => inv.user_id && navigate(`/users/${inv.user_id}`)}
            empty="청구서가 없습니다."
          />
          <Pagination
            page={query.data.page}
            pageSize={query.data.page_size}
            total={query.data.total}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}

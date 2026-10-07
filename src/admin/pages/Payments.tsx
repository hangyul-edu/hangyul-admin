import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { adminApi } from "../api";
import type { AdminInvoiceRow, AdminPaymentRow } from "../api";
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
          style={{ width: 140 }}
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
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
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

  return (
    <div className="hgadm-card">
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
          style={{ width: 140 }}
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

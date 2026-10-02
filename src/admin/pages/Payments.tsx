import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { adminApi } from "../api";
import type { AdminInvoiceRow, AdminPaymentRow } from "../api";
import { errorMessage } from "../../lib/http";
import {
  Badge,
  DataTable,
  ErrorState,
  LoadingState,
  Pagination,
  SearchBox,
  Select,
  statusLabel,
  statusTone,
} from "../components/kit";
import {
  formatDateTime,
  formatMoney,
} from "../lib/format";
import type { Column } from "../components/kit";

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
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
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

  return (
    <div className="hgadm-card">
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

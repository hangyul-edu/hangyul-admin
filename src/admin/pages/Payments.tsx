import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Download } from "lucide-react";
import { adminApi, downloadCsv } from "../api";
import type { AdminInvoiceRow, AdminPaymentRow } from "../api";
import { errorMessage } from "../../lib/http";
import { loadAdminSession } from "../lib/storage";
import { useToast } from "../../hooks/toast";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  ErrorState,
  LoadingState,
  Pagination,
  SearchBox,
  Select,
  formatDateTime,
  formatMoney,
  statusTone,
} from "../components/kit";
import type { Column } from "../components/kit";

export function PaymentsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "invoices" ? "invoices" : "payments";
  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>결제·인보이스</h1>
          <div className="hgadm-page-head__desc">
            결제 시도와 인보이스 전체 내역입니다. 결제 수단 정보는 항상 마스킹된
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
          인보이스
        </button>
      </div>
      {tab === "payments" ? <PaymentsTab /> : <InvoicesTab />}
    </div>
  );
}

function PaymentsTab() {
  const toast = useToast();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [confirmExport, setConfirmExport] = useState(false);
  const [exporting, setExporting] = useState(false);
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

  async function exportCsv() {
    try {
      await downloadCsv(
        adminApi.paymentsExportUrl({ q: q || undefined, status: status || undefined }),
        "payments.csv",
        loadAdminSession()?.accessToken ?? null,
      );
      toast.success("CSV 다운로드를 시작했어요.");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function runExport() {
    setExporting(true);
    try {
      await exportCsv();
    } finally {
      setExporting(false);
      setConfirmExport(false);
    }
  }

  const columns: Column<AdminPaymentRow>[] = [
    {
      key: "payment",
      header: "결제",
      render: (p) => (
        <div>
          <div className="hgadm-cell-main">{p.user_email ?? "(탈퇴한 사용자)"}</div>
          <div className="hgadm-cell-sub hgadm-cell-mono">{p.payment_id}</div>
        </div>
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
          <Badge tone={statusTone(p.status)}>{p.status}</Badge>
          {p.failure_class && <div className="hgadm-cell-sub">{p.failure_class}</div>}
        </div>
      ),
    },
    { key: "paid", header: "결제일", render: (p) => formatDateTime(p.paid_at ?? p.created_at) },
  ];

  return (
    <>
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
          <option value="succeeded">성공</option>
          <option value="failed">실패</option>
          <option value="refunded">환불</option>
        </Select>
        <span className="hgadm-toolbar__spacer" />
        <Button onClick={() => setConfirmExport(true)}>CSV 내보내기</Button>
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
    <ConfirmDialog
      open={confirmExport}
      title="CSV 내보내기"
      message="현재 검색·필터 조건에 해당하는 결제 내역을 CSV 파일로 내려받습니다. 계속할까요?"
      confirmLabel="내보내기"
      icon={<Download size={24} strokeWidth={2} />}
      loading={exporting}
      onConfirm={() => void runExport()}
      onCancel={() => setConfirmExport(false)}
    />
    </>
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
      header: "인보이스",
      render: (inv) => (
        <div>
          <div className="hgadm-cell-main">{inv.user_email ?? "(탈퇴한 사용자)"}</div>
          <div className="hgadm-cell-sub hgadm-cell-mono">{inv.invoice_id}</div>
        </div>
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
      render: (inv) => <Badge tone={statusTone(inv.status)}>{inv.status}</Badge>,
    },
    { key: "paid", header: "결제일", render: (inv) => formatDateTime(inv.paid_at) },
    { key: "created", header: "생성일", render: (inv) => formatDateTime(inv.created_at) },
  ];

  return (
    <div className="hgadm-card">
      <div className="hgadm-toolbar">
        <SearchBox
          value={q}
          placeholder="이메일·인보이스 ID 검색"
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
              {s}
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
            empty="인보이스가 없습니다."
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

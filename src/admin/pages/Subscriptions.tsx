import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { adminApi } from "../api";
import type { AdminSubscriptionRow } from "../api";
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
} from "../lib/format";
import type { Column } from "../components/kit";

const STATUSES = [
  "trial",
  "active",
  "payment_pending",
  "payment_failed",
  "grace_period",
  "suspended",
  "cancelled",
  "expired",
];

export function SubscriptionsPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const query = useQuery({
    queryKey: ["admin", "subscriptions", { q, status, page }],
    queryFn: () =>
      adminApi.listSubscriptions({
        q: q || undefined,
        status: status || undefined,
        page,
        page_size: pageSize,
      }),
  });

  const columns: Column<AdminSubscriptionRow>[] = [
    {
      key: "user",
      header: "가입자",
      render: (s) => (
        <div className="hgadm-cell-main">{s.user_email ?? "(탈퇴한 사용자)"}</div>
      ),
    },
    { key: "plan", header: "요금제", render: (s) => s.plan_id ?? "—" },
    {
      key: "status",
      header: "상태",
      render: (s) => (
        <div>
          <Badge tone={statusTone(s.status)}>{statusLabel(s.status)}</Badge>
          {s.cancel_at_period_end && (
            <div className="hgadm-cell-sub">기간 종료 시 해지</div>
          )}
        </div>
      ),
    },
    { key: "provider", header: "결제사", render: (s) => s.provider ?? "—" },
    {
      key: "period",
      header: "현재 주기 종료",
      render: (s) => formatDateTime(s.current_period_end),
    },
    {
      key: "next",
      header: "다음 결제",
      render: (s) => formatDateTime(s.next_billing_at),
    },
    { key: "created", header: "시작일", render: (s) => formatDateTime(s.created_at) },
  ];

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>구독 현황</h1>
          <div className="hgadm-page-head__desc">
            전체 구독 상태를 조회합니다. 가입자를 클릭하면 사용자 상세로 이동합니다.
            구독 변경(해지·환불)은 사용자 요청 기반 절차와 결제사 콘솔에서 처리합니다.
          </div>
        </div>
      </div>
      <div className="hgadm-card">
        <div className="hgadm-toolbar">
          <SearchBox
            value={q}
            placeholder="이메일·구독 ID·사용자 ID 검색"
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
            style={{ width: 170 }}
          >
            <option value="">상태: 전체</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </Select>
        </div>
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState
            message={errorMessage(query.error)}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={query.data.items}
              rowKey={(s) => s.subscription_id}
              onRowClick={(s) => s.user_id && navigate(`/users/${s.user_id}`)}
              empty="조건에 맞는 구독이 없습니다."
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
    </div>
  );
}

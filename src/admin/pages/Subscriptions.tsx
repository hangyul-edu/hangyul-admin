import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { adminApi } from "../api";
import type { AdminSubscriptionRow } from "../api";
import { errorMessage } from "../../lib/http";
import { PAYMENT_PROVIDER_LABEL, codeLabel } from "../lib/codeLabels";
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
  Timestamp,
} from "../components/kit";
import type { Column } from "../components/kit";

/**
 * `subscriptions.domain.entities.SubscriptionStatus` — the seven stored
 * states (the member-facing `trial_ending` is derived, never stored, so the
 * list never carries it) — and the list's one extra filter.
 */
const STATUSES = [
  "trial",
  "active",
  "payment_pending",
  "payment_failed",
  "grace_period",
  "suspended",
  "expired",
  // Not a status: a cancellation scheduled at period end (any status but expired).
  "canceling",
] as const;

/** `value` when it is one of the list's filters, else "" (all). */
function knownStatus(value: string | null): string {
  return value && (STATUSES as readonly string[]).includes(value) ? value : "";
}

export function SubscriptionsPage() {
  const navigate = useNavigate();
  // The dashboard's 활성 구독 tile and alerts link here with a status.
  const [params] = useSearchParams();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState(() => knownStatus(params.get("status")));
  const [planId, setPlanId] = useState(() => params.get("plan_id") ?? "");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const query = useQuery({
    queryKey: ["admin", "subscriptions", { q, status, planId, page }],
    queryFn: () =>
      adminApi.listSubscriptions({
        q: q || undefined,
        status: status || undefined,
        plan_id: planId || undefined,
        page,
        page_size: pageSize,
      }),
  });
  // The list carries plan ids only; the catalogue names them (and fills the
  // plan filter, older plans included — they still renew).
  const plans = useQuery({ queryKey: ["admin", "plans"], queryFn: adminApi.listPlans });
  const planName = (id: string | null) => {
    if (!id) return "—";
    return plans.data?.plans.find((p) => p.plan_id === id)?.name ?? id;
  };

  const columns: Column<AdminSubscriptionRow>[] = [
    {
      key: "user",
      header: "가입자",
      render: (s) => (
        <div className="hgadm-cell-main">{s.user_email ?? "(탈퇴한 사용자)"}</div>
      ),
    },
    { key: "plan", header: "요금제", render: (s) => planName(s.plan_id) },
    {
      key: "status",
      header: "상태",
      render: (s) => (
        <div>
          <Badge tone={statusTone(s.status)}>{statusLabel(s.status)}</Badge>
          {s.cancel_at_period_end && s.status !== "expired" && (
            <div className="hgadm-cell-sub">기간 종료 시 해지</div>
          )}
        </div>
      ),
    },
    { key: "provider", header: "결제사", render: (s) => (s.provider ? codeLabel(PAYMENT_PROVIDER_LABEL, s.provider) : "—") },
    {
      key: "period",
      header: "현재 주기 종료",
      render: (s) => <Timestamp at={s.status === "trial" ? (s.trial_expires_at ?? s.current_period_end) : s.current_period_end} />,
    },
    {
      key: "next",
      header: "다음 결제",
      render: (s) => <Timestamp at={s.next_billing_at} />,
    },
    { key: "created", header: "시작일", render: (s) => <Timestamp at={s.created_at} /> },
  ];

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>구독 현황</h1>
          <div className="hgadm-page-head__desc">
            전체 구독 상태를 조회합니다. 가입자를 클릭하면 사용자 상세로 이동합니다.
            환불·결제 재시도는 결제·청구서 화면에서 처리합니다. 해지는 회원이 앱에서 직접 합니다.
          </div>
        </div>
      </div>
      <div className="hgadm-card">
        <div className="hgadm-toolbar">
          <SearchBox
            value={q}
            placeholder="이메일·구독 ID·사용자 ID 검색"
            maxLength={254}
            onSearch={(next) => {
              setQ(next);
              setPage(1);
            }}
          />
          <Select
            value={status}
            aria-label="상태"
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">상태: 전체</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </Select>
          <Select
            value={planId}
            aria-label="요금제"
            onChange={(e) => {
              setPlanId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">요금제: 전체</option>
            {plans.data?.plans.map((p) => (
              <option key={p.plan_id} value={p.plan_id}>
                {p.name}
                {p.slot === null ? " (이전 요금제)" : ""}
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

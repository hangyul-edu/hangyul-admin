import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { adminApi } from "../api";
import type { CouponBatch, CouponRow } from "../api";
import { errorMessage } from "../../lib/http";
import { useToast, useToastError } from "../../hooks/toast";
import { useAdminAuth } from "../auth";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Modal,
  Pagination,
  SearchBox,
  Select,
  statusLabel,
  statusTone,
  Timestamp,
} from "../components/kit";
import {
  formatDateTime,
  fromAdminInputValue,
} from "../lib/format";
import type { Column } from "../components/kit";

/**
 * A batch's own words. The shared `statusLabel` reads `active` as the
 * subscription's "이용 중", but an active batch is one whose unused codes can
 * still be redeemed — nothing is "in use".
 */
const BATCH_STATUS_LABELS: Record<string, string> = { active: "발행됨" };

function batchStatusLabel(status: string): string {
  return BATCH_STATUS_LABELS[status] ?? statusLabel(status);
}

export function CouponsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "coupons" ? "coupons" : "batches";
  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>쿠폰 관리</h1>
          <div className="hgadm-page-head__desc">
            B2B/프로모션 쿠폰을 묶음으로 발행·회수하고 개별 코드를 조회합니다. 회수는 미사용
            쿠폰만 무효화하며, 이미 활성화된 이용권은 유지됩니다.
          </div>
        </div>
      </div>
      <div className="hgadm-tabs">
        <button
          className={`hgadm-tab ${tab === "batches" ? "active" : ""}`}
          onClick={() => setParams({ tab: "batches" }, { replace: true })}
        >
          발행 묶음
        </button>
        <button
          className={`hgadm-tab ${tab === "coupons" ? "active" : ""}`}
          onClick={() => setParams({ tab: "coupons" }, { replace: true })}
        >
          쿠폰 검색
        </button>
      </div>
      {tab === "batches" ? <BatchesTab /> : <CouponSearchTab />}
    </div>
  );
}

function BatchesTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const { can } = useAdminAuth();
  const canWrite = can("commerce:write");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [durationDays, setDurationDays] = useState("30");
  const [quantity, setQuantity] = useState("100");
  const [validUntil, setValidUntil] = useState("");
  const [created, setCreated] = useState<{ generated: number; sample: string[] } | null>(null);
  const [revoking, setRevoking] = useState<CouponBatch | null>(null);
  const pageSize = 25;

  const query = useQuery({
    queryKey: ["admin", "coupon-batches", page],
    queryFn: () =>
      adminApi.listCouponBatches({ limit: pageSize, offset: (page - 1) * pageSize }),
  });

  const generate = useMutation({
    mutationFn: () =>
      adminApi.generateCouponBatch({
        name,
        duration_days: Number(durationDays),
        quantity: Number(quantity),
        valid_until: fromAdminInputValue(validUntil),
      }),
    onSuccess: (result) => {
      setCreateOpen(false);
      setCreated({ generated: result.generated, sample: result.sample_codes });
      setName("");
      void qc.invalidateQueries({ queryKey: ["admin", "coupon-batches"] });
      void qc.invalidateQueries({ queryKey: ["admin", "coupons"] });
    },
    onError: toastError,
  });

  const revoke = useMutation({
    mutationFn: (batch: CouponBatch) => adminApi.revokeCouponBatch(batch.batch_id),
    onSuccess: () => {
      toast.success("발행 묶음을 회수했어요.");
      setRevoking(null);
      void qc.invalidateQueries({ queryKey: ["admin", "coupon-batches"] });
      // Its unused codes are now revoked; the search tab caches them.
      void qc.invalidateQueries({ queryKey: ["admin", "coupons"] });
    },
    onError: toastError,
  });

  const columns: Column<CouponBatch>[] = [
    {
      key: "name",
      header: "발행 묶음",
      render: (b) => (
        <div className="hgadm-cell-main">{b.name}</div>
      ),
    },
    { key: "duration", header: "이용 기간", render: (b) => `${b.duration_days}일` },
    {
      key: "quantity",
      header: "수량",
      numeric: true,
      render: (b) => b.quantity.toLocaleString(),
    },
    {
      key: "valid",
      header: "유효기한",
      render: (b) => (b.valid_until ? formatDateTime(b.valid_until) : "무기한"),
    },
    {
      key: "status",
      header: "상태",
      render: (b) => <Badge tone={statusTone(b.status)}>{batchStatusLabel(b.status)}</Badge>,
    },
    { key: "created", header: "생성일", render: (b) => <Timestamp at={b.created_at} /> },
    {
      key: "actions",
      header: "",
      render: (b) =>
        canWrite && b.status === "active" ? (
          <Button size="sm" variant="danger-soft" onClick={(e) => {
            e.stopPropagation();
            setRevoking(b);
          }}>
            회수
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="hgadm-card">
      <div className="hgadm-toolbar">
        <span className="hgadm-muted hgadm-text-sm">
          발행 묶음 목록
        </span>
        <span className="hgadm-toolbar__spacer" />
        {canWrite && (
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            + 쿠폰 발행
          </Button>
        )}
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
            rowKey={(b) => b.batch_id}
            empty="발행한 쿠폰 묶음이 없습니다."
          />
          <Pagination
            page={page}
            pageSize={pageSize}
            total={query.data.total}
            onPageChange={setPage}
          />
        </>
      )}

      <Modal
        open={createOpen}
        title="쿠폰 발행"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              취소
            </Button>
            <Button
              variant="primary"
              loading={generate.isPending}
              disabled={!name || Number(quantity) < 1 || Number(durationDays) < 1}
              onClick={() => generate.mutate()}
            >
              생성
            </Button>
          </>
        }
      >
        <Field label="캠페인 이름" required hint="예: 대학 제휴 2026-2학기">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </Field>
        <div className="hgadm-form-grid">
          <Field label="이용 기간 (일)" required>
            <Input
              type="number"
              min={1}
              max={3650}
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
            />
          </Field>
          <Field label="수량" required hint="최대 10,000">
            <Input
              type="number"
              min={1}
              max={10000}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </Field>
        </div>
        <Field label="사용 기한" hint="KST 기준. 비우면 무기한">
          <Input
            type="datetime-local"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
          />
        </Field>
      </Modal>

      <Modal
        open={created !== null}
        title="쿠폰을 발행했습니다"
        onClose={() => setCreated(null)}
        footer={
          <Button variant="primary" onClick={() => setCreated(null)}>
            확인
          </Button>
        }
      >
        {created && (
          <div className="hgadm-prose">
            <p>
              코드 <strong>{created.generated.toLocaleString()}개</strong>가
              생성되었습니다. 샘플:
            </p>
            <pre className="hgadm-json">{created.sample.join("\n")}</pre>
            <p className="hgadm-muted hgadm-text-xs">
              전체 코드는 '쿠폰 검색' 탭에서 발행 묶음으로 필터해 확인할 수 있습니다.
            </p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={revoking !== null}
        title="발행 묶음 회수"
        message={`'${revoking?.name ?? ""}' 발행 묶음의 미사용 쿠폰을 모두 무효화할까요? 이미 사용된 이용권은 유지됩니다.`}
        danger
        confirmLabel="회수"
        loading={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking)}
        onCancel={() => setRevoking(null)}
      />
    </div>
  );
}

function CouponSearchTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const { can } = useAdminAuth();
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [batchId, setBatchId] = useState("");
  const [page, setPage] = useState(1);
  const [revoking, setRevoking] = useState<CouponRow | null>(null);
  const pageSize = 25;

  const batches = useQuery({
    queryKey: ["admin", "coupon-batches", "all"],
    queryFn: () => adminApi.listCouponBatches({ limit: 200, offset: 0 }),
  });

  const query = useQuery({
    queryKey: ["admin", "coupons", { code, status, batchId, page }],
    queryFn: () =>
      adminApi.searchCoupons({
        code_starts_with: code || undefined,
        status: status || undefined,
        batch_id: batchId || undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
  });

  const revoke = useMutation({
    mutationFn: (coupon: CouponRow) => adminApi.revokeCoupon(coupon.coupon_id),
    onSuccess: () => {
      toast.success("쿠폰을 무효화했어요.");
      setRevoking(null);
      void qc.invalidateQueries({ queryKey: ["admin", "coupons"] });
    },
    onError: toastError,
  });

  const canReadUsers = can("users:read");
  const columns: Column<CouponRow>[] = [
    {
      key: "code",
      header: "코드",
      render: (c) => <span className="hgadm-cell-mono">{c.code}</span>,
    },
    {
      key: "batch",
      header: "발행 묶음",
      render: (c) => c.batch_name ?? "(이름 없는 배치)",
    },
    { key: "duration", header: "기간", render: (c) => `${c.duration_days}일` },
    {
      key: "status",
      header: "상태",
      render: (c) => <Badge tone={statusTone(c.status)}>{statusLabel(c.status)}</Badge>,
    },
    {
      key: "redeemed",
      header: "사용",
      render: (c) =>
        c.redeemed_by_user_id ? (
          <div>
            {/* The redeemer is linked, not shown by ID. */}
            {canReadUsers ? <Link to={`/users/${c.redeemed_by_user_id}`}>사용자 보기</Link> : <div>사용됨</div>}
            <div className="hgadm-cell-sub">{formatDateTime(c.redeemed_at)}</div>
          </div>
        ) : (
          "—"
        ),
    },
    {
      key: "actions",
      header: "",
      render: (c) =>
        can("commerce:write") && c.status === "unused" ? (
          <Button
            size="sm"
            variant="danger-soft"
            onClick={(e) => {
              e.stopPropagation();
              setRevoking(c);
            }}
          >
            무효화
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="hgadm-card">
      <div className="hgadm-toolbar">
        <SearchBox
          value={code}
          placeholder="코드 앞자리 검색 (예: ABCD)"
          onSearch={(next) => {
            setCode(next);
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
          {["unused", "redeemed", "revoked"].map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </Select>
        <Select
          value={batchId}
          onChange={(e) => {
            setBatchId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">발행 묶음: 전체</option>
          {batches.data?.items.map((b) => (
            <option key={b.batch_id} value={b.batch_id}>
              {b.name}
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
            rowKey={(c) => c.coupon_id}
            empty="조건에 맞는 쿠폰이 없습니다."
          />
          <Pagination
            page={page}
            pageSize={pageSize}
            total={query.data.total}
            onPageChange={setPage}
          />
        </>
      )}
      <ConfirmDialog
        open={revoking !== null}
        title="쿠폰 무효화"
        message={`코드 ${revoking?.code ?? ""}를 무효화할까요? 되돌릴 수 없습니다.`}
        danger
        confirmLabel="무효화"
        loading={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking)}
        onCancel={() => setRevoking(null)}
      />
    </div>
  );
}

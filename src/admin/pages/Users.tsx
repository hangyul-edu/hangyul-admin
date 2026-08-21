import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { UserPlus } from "lucide-react";
import { adminApi, downloadCsv } from "../api";
import type { AdminUserSummary } from "../api";
import { errorMessage } from "../../lib/http";
import { loadAdminSession } from "../lib/storage";
import { useToast } from "../../hooks/toast";
import { useAdminAuth } from "../auth";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  ErrorState,
  LoadingState,
  Modal,
  Pagination,
  SearchBox,
  Select,
  formatDateTime,
  statusTone,
} from "../components/kit";
import type { Column } from "../components/kit";

const ROLE_LABELS: Record<string, string> = {
  member: "일반",
  premium: "프리미엄",
  tester: "테스터",
  admin: "관리자",
};

export function UsersPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAdminAuth();
  const [testerInfo, setTesterInfo] = useState<{
    email: string;
    password: string;
    nickname: string;
  } | null>(null);
  const [confirmTester, setConfirmTester] = useState(false);

  const q = params.get("q") ?? "";
  const role = params.get("role") ?? "";
  const status = params.get("status") ?? "";
  const subscription = params.get("subscription_status") ?? "";
  const sort = params.get("sort") ?? "created_at";
  const order = (params.get("order") ?? "desc") as "asc" | "desc";
  const page = Number(params.get("page") ?? "1");

  function patchParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  }

  const query = useQuery({
    queryKey: ["admin", "users", { q, role, status, subscription, sort, order, page }],
    queryFn: () =>
      adminApi.listUsers({
        q: q || undefined,
        role: role || undefined,
        status: status || undefined,
        subscription_status: subscription || undefined,
        sort,
        order,
        page,
        page_size: 25,
      }),
  });

  const createTester = useMutation({
    mutationFn: adminApi.createTester,
    onSuccess: (created) => {
      setTesterInfo(created);
      void query.refetch();
    },
    onError: (e) => toast.error(errorMessage(e)),
    onSettled: () => setConfirmTester(false),
  });

  async function exportCsv() {
    try {
      await downloadCsv(
        adminApi.usersExportUrl({
          q: q || undefined,
          role: role || undefined,
          status: status || undefined,
          subscription_status: subscription || undefined,
        }),
        "users.csv",
        loadAdminSession()?.accessToken ?? null,
      );
      toast.success("CSV 다운로드를 시작했어요.");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const columns: Column<AdminUserSummary>[] = [
    {
      key: "user",
      header: "사용자",
      sortKey: "email",
      render: (u) => (
        <div>
          <div className="hgadm-cell-main">{u.nickname ?? "(닉네임 없음)"}</div>
          <div className="hgadm-cell-sub">{u.email}</div>
        </div>
      ),
    },
    {
      key: "phone",
      header: "전화번호",
      render: (u) => <span className="hgadm-cell-mono">{u.phone_masked ?? "—"}</span>,
    },
    {
      key: "role",
      header: "역할",
      render: (u) => (
        <Badge tone={u.role === "admin" ? "brand" : "neutral"}>
          {ROLE_LABELS[u.role] ?? u.role}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "상태",
      render: (u) => <Badge tone={statusTone(u.status)} dot>{u.status}</Badge>,
    },
    {
      key: "subscription",
      header: "구독",
      render: (u) =>
        u.subscription_status ? (
          <div>
            <Badge tone={statusTone(u.subscription_status)}>
              {u.subscription_status}
            </Badge>
            <div className="hgadm-cell-sub">{u.plan_id}</div>
          </div>
        ) : (
          <span className="hgadm-muted">없음</span>
        ),
    },
    {
      key: "created",
      header: "가입일",
      sortKey: "created_at",
      render: (u) => formatDateTime(u.created_at),
    },
  ];

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>사용자 관리</h1>
          <div className="hgadm-page-head__desc">
            검색·필터로 계정을 찾고, 상세 화면에서 역할·상태를 관리합니다. 전화번호 등
            민감 정보는 마스킹되어 표시됩니다.
          </div>
        </div>
        <div className="hgadm-page-head__actions">
          <Button onClick={() => void exportCsv()}>CSV 내보내기</Button>
          {can("users:write") && (
            <Button
              variant="primary"
              loading={createTester.isPending}
              onClick={() => setConfirmTester(true)}
            >
              + 테스터 계정 생성
            </Button>
          )}
        </div>
      </div>

      <div className="hgadm-card">
        <div className="hgadm-toolbar">
          <SearchBox
            value={q}
            placeholder="이메일·닉네임·이름·ID·전화번호 검색"
            onSearch={(next) => patchParams({ q: next, page: null })}
          />
          <Select
            value={role}
            onChange={(e) => patchParams({ role: e.target.value, page: null })}
            style={{ width: 130 }}
          >
            <option value="">역할: 전체</option>
            <option value="member">일반</option>
            <option value="tester">테스터</option>
            <option value="admin">관리자</option>
          </Select>
          <Select
            value={status}
            onChange={(e) => patchParams({ status: e.target.value, page: null })}
            style={{ width: 140 }}
          >
            <option value="">상태: 전체</option>
            <option value="active">활성</option>
            <option value="suspended">정지</option>
            <option value="deactivated">탈퇴</option>
          </Select>
          <Select
            value={subscription}
            onChange={(e) =>
              patchParams({ subscription_status: e.target.value, page: null })
            }
            style={{ width: 150 }}
          >
            <option value="">구독: 전체</option>
            <option value="active">구독 중</option>
            <option value="trial">체험 중</option>
            <option value="grace_period">유예 기간</option>
            <option value="cancelled">해지</option>
            <option value="none">구독 없음</option>
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
              rowKey={(u) => u.user_id}
              onRowClick={(u) => navigate(`/users/${u.user_id}`)}
              sort={sort}
              order={order}
              onSortChange={(s, o) => patchParams({ sort: s, order: o, page: null })}
              empty="조건에 맞는 사용자가 없습니다."
            />
            <Pagination
              page={query.data.page}
              pageSize={query.data.page_size}
              total={query.data.total}
              onPageChange={(next) => patchParams({ page: String(next) })}
            />
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmTester}
        title="테스터 계정 생성"
        message="구독 없이 프리미엄 기능 전체에 접근할 수 있는 테스터 계정을 새로 만듭니다. 생성 후 비밀번호는 한 번만 표시됩니다. 계속할까요?"
        confirmLabel="생성"
        icon={<UserPlus size={24} strokeWidth={2} />}
        loading={createTester.isPending}
        onConfirm={() => createTester.mutate()}
        onCancel={() => setConfirmTester(false)}
      />

      <Modal
        open={testerInfo !== null}
        title="테스터 계정이 생성되었습니다"
        onClose={() => setTesterInfo(null)}
        footer={
          <Button variant="primary" onClick={() => setTesterInfo(null)}>
            확인했어요
          </Button>
        }
      >
        {testerInfo && (
          <div style={{ fontSize: 14, lineHeight: 1.7 }}>
            <p>
              비밀번호는 <strong>지금 한 번만</strong> 표시됩니다. 안전한 채널로
              전달하고 이 창을 닫으세요.
            </p>
            <dl className="hgadm-dl" style={{ marginTop: 10 }}>
              <dt>이메일</dt>
              <dd className="hgadm-cell-mono">{testerInfo.email}</dd>
              <dt>닉네임</dt>
              <dd>{testerInfo.nickname}</dd>
              <dt>비밀번호</dt>
              <dd className="hgadm-cell-mono">{testerInfo.password}</dd>
            </dl>
          </div>
        )}
      </Modal>
    </div>
  );
}

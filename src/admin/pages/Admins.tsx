import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../api";
import type { AdminAccount, AdminTier } from "../api";
import { errorMessage } from "../../lib/http";
import { useToast } from "../../hooks/toast";
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
  Select,
  formatDateTime,
} from "../components/kit";
import type { Column } from "../components/kit";

const TIERS: { value: AdminTier; label: string; desc: string }[] = [
  { value: "super_admin", label: "최고 관리자", desc: "모든 권한 + 관리자 계정 관리" },
  { value: "operator", label: "운영자", desc: "관리자 관리를 제외한 모든 권한" },
  { value: "content_manager", label: "콘텐츠 관리자", desc: "콘텐츠 편집 + 사용자 조회" },
  { value: "support_agent", label: "고객지원", desc: "사용자 조회 + 운영 콘텐츠 + 커머스 조회" },
  { value: "viewer", label: "뷰어", desc: "전체 읽기 전용" },
];

const TIER_LABEL = Object.fromEntries(TIERS.map((t) => [t.value, t.label]));

export function AdminsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { me } = useAdminAuth();
  const [grantOpen, setGrantOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState<AdminTier>("viewer");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState<AdminAccount | null>(null);
  const [editTier, setEditTier] = useState<AdminTier>("viewer");
  const [revoking, setRevoking] = useState<AdminAccount | null>(null);

  const query = useQuery({ queryKey: ["admin", "admins"], queryFn: adminApi.listAdmins });

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["admin", "admins"] });
  }

  const grant = useMutation({
    mutationFn: () =>
      adminApi.grantAdmin({ email, admin_role: tier, note: note || undefined }),
    onSuccess: () => {
      toast.success("관리자 권한을 부여했어요.");
      setGrantOpen(false);
      setEmail("");
      setNote("");
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const update = useMutation({
    mutationFn: (target: AdminAccount) =>
      adminApi.updateAdmin(target.user_id, { admin_role: editTier }),
    onSuccess: () => {
      toast.success("티어를 변경했어요.");
      setEditing(null);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const revoke = useMutation({
    mutationFn: (target: AdminAccount) => adminApi.revokeAdmin(target.user_id),
    onSuccess: () => {
      toast.success("관리자 권한을 회수했어요.");
      setRevoking(null);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const columns: Column<AdminAccount>[] = [
    {
      key: "who",
      header: "계정",
      render: (a) => (
        <div>
          <div className="hgadm-cell-main">
            {a.nickname ?? a.name}
            {a.user_id === me?.user_id && (
              <span className="hgadm-muted"> (나)</span>
            )}
          </div>
          <div className="hgadm-cell-sub">{a.email}</div>
        </div>
      ),
    },
    {
      key: "tier",
      header: "티어",
      render: (a) => (
        <Badge tone={a.admin_role === "super_admin" ? "brand" : "info"}>
          {TIER_LABEL[a.admin_role] ?? a.admin_role}
        </Badge>
      ),
    },
    { key: "note", header: "메모", render: (a) => a.note ?? "—" },
    {
      key: "granted",
      header: "부여일",
      render: (a) => formatDateTime(a.granted_at),
    },
    {
      key: "actions",
      header: "",
      render: (a) =>
        a.user_id === me?.user_id ? (
          <span className="hgadm-muted" style={{ fontSize: 12 }}>
            본인 계정은 변경 불가
          </span>
        ) : (
          <div className="hgadm-row" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              onClick={() => {
                setEditing(a);
                setEditTier(a.admin_role as AdminTier);
              }}
            >
              티어 변경
            </Button>
            <Button size="sm" variant="danger-soft" onClick={() => setRevoking(a)}>
              권한 회수
            </Button>
          </div>
        ),
    },
  ];

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>관리자 계정</h1>
          <div className="hgadm-page-head__desc">
            관리자 권한 부여는 이 화면에서만 가능하며 모든 변경이 감사 로그에 기록됩니다.
            마지막 최고 관리자는 강등·회수할 수 없습니다.
          </div>
        </div>
        <div className="hgadm-page-head__actions">
          <Button variant="primary" onClick={() => setGrantOpen(true)}>
            + 관리자 추가
          </Button>
        </div>
      </div>

      <div className="hgadm-card">
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState
            message={errorMessage(query.error)}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={query.data.items}
            rowKey={(a) => a.user_id}
            empty="관리자 계정이 없습니다."
          />
        )}
      </div>

      <Modal
        open={grantOpen}
        title="관리자 권한 부여"
        onClose={() => setGrantOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setGrantOpen(false)}>
              취소
            </Button>
            <Button
              variant="primary"
              loading={grant.isPending}
              disabled={!email.includes("@")}
              onClick={() => grant.mutate()}
            >
              권한 부여
            </Button>
          </>
        }
      >
        <Field label="대상 이메일" required hint="이미 가입된 활성 계정이어야 합니다.">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="staff@talkhangyul.co.kr"
          />
        </Field>
        <Field label="티어" required>
          <Select value={tier} onChange={(e) => setTier(e.target.value as AdminTier)}>
            {TIERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label} — {t.desc}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="메모">
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: CS팀 온보딩"
            maxLength={200}
          />
        </Field>
      </Modal>

      <Modal
        open={editing !== null}
        title={`티어 변경 — ${editing?.email ?? ""}`}
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              취소
            </Button>
            <Button
              variant="primary"
              loading={update.isPending}
              onClick={() => editing && update.mutate(editing)}
            >
              변경
            </Button>
          </>
        }
      >
        <Field label="새 티어" required>
          <Select
            value={editTier}
            onChange={(e) => setEditTier(e.target.value as AdminTier)}
          >
            {TIERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label} — {t.desc}
              </option>
            ))}
          </Select>
        </Field>
      </Modal>

      <ConfirmDialog
        open={revoking !== null}
        title="관리자 권한 회수"
        message={`${revoking?.email ?? ""} 계정의 관리자 권한을 회수하고 일반 회원으로 되돌릴까요?`}
        danger
        confirmLabel="회수"
        loading={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking)}
        onCancel={() => setRevoking(null)}
      />
    </div>
  );
}

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../api";
import type { AdminAccount, AdminTier } from "../api";
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
  SearchBox,
  Select,
  Timestamp,
} from "../components/kit";
import {
  } from "../lib/format";
import type { Column } from "../components/kit";
import {
  ADMIN_TIERS as TIERS,
  ADMIN_TIER_LABEL as TIER_LABEL,
  DEFAULT_GRANT_TIER,
} from "../lib/adminTiers";
import { personName, personNameWithEmail } from "../lib/adminIdentity";


export function AdminsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const { me } = useAdminAuth();
  const [grantOpen, setGrantOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [tier, setTier] = useState<AdminTier>(DEFAULT_GRANT_TIER);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState<AdminAccount | null>(null);
  const [editTier, setEditTier] = useState<AdminTier>(DEFAULT_GRANT_TIER);
  const [revoking, setRevoking] = useState<AdminAccount | null>(null);
  const [search, setSearch] = useState("");

  const query = useQuery({ queryKey: ["admin", "admins"], queryFn: adminApi.listAdmins });

  /* Filtered here rather than server-side: the endpoint returns every admin in
     one unpaginated response — there are only ever a handful — so a round trip
     per keystroke would buy nothing. Matches name, nickname, email or tier, so
     "운영자" finds everyone at that tier as readily as a name does. */
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const items = query.data?.items ?? [];
    if (!needle) return items;
    return items.filter((a) =>
      [a.name, a.nickname, a.email, TIER_LABEL[a.admin_role], a.admin_role]
        .some((field) => field?.toLowerCase().includes(needle)),
    );
  }, [query.data, search]);

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["admin", "admins"] });
    // Granting or revoking flips the member's role, and a tier change shows
    // on their detail page — both are cached by the user screens.
    void qc.invalidateQueries({ queryKey: ["admin", "users"] });
    void qc.invalidateQueries({ queryKey: ["admin", "user"] });
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
    onError: toastError,
  });

  const update = useMutation({
    mutationFn: (target: AdminAccount) =>
      adminApi.updateAdmin(target.user_id, { admin_role: editTier }),
    onSuccess: () => {
      toast.success("권한 등급을 변경했어요.");
      setEditing(null);
      refresh();
    },
    onError: toastError,
  });

  const revoke = useMutation({
    mutationFn: (target: AdminAccount) => adminApi.revokeAdmin(target.user_id),
    onSuccess: () => {
      toast.success("관리자 권한을 회수했어요.");
      setRevoking(null);
      refresh();
    },
    onError: toastError,
  });

  const columns: Column<AdminAccount>[] = [
    {
      key: "who",
      header: "계정",
      render: (a) => (
        <div>
          <div className="hgadm-cell-main">
            {personName(a)}
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
      header: "권한 등급",
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
      render: (a) => <Timestamp at={a.granted_at} />,
    },
    {
      key: "actions",
      header: "",
      render: (a) =>
        a.user_id === me?.user_id ? (
          <span className="hgadm-muted hgadm-text-xs">
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
              권한 등급 변경
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
        <div className="hgadm-toolbar">
          <SearchBox
            value={search}
            placeholder="이름 · 닉네임 · 이메일 · 등급 검색"
            onSearch={setSearch}
          />
        </div>
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
            rows={visible}
            rowKey={(a) => a.user_id}
            empty={search ? "검색 결과가 없습니다." : "관리자 계정이 없습니다."}
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
        <Field label="권한 등급" required>
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
        title={`권한 등급 변경 — ${personNameWithEmail(editing)}`}
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
        <Field label="새 권한 등급" required>
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
        message={`${personNameWithEmail(revoking)} 계정의 관리자 권한을 회수하고 일반 회원으로 되돌릴까요?`}
        danger
        confirmLabel="회수"
        loading={revoke.isPending}
        onConfirm={() => revoking && revoke.mutate(revoking)}
        onCancel={() => setRevoking(null)}
      />
    </div>
  );
}

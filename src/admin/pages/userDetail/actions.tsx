import { useState } from "react";
import { Link } from "react-router-dom";
import type { AdminTier, AdminUserDetail } from "../../api";
import { Button, ConfirmDialog, Field, Input, Modal, Select } from "../../components/kit";
import { ADMIN_TIER_LABEL, ADMIN_TIERS, DEFAULT_GRANT_TIER } from "../../lib/adminTiers";
import { personNameWithEmail } from "../../lib/adminIdentity";
import { usePromoteToAdmin, useUpdateUser, type UserUpdate } from "./useUserDetail";

type Pending = { title: string; message: string; danger?: boolean; body: UserUpdate };

/**
 * The header's actions on a member: nickname, tester role, suspension, and
 * promotion to admin — each offered only where it can succeed (the server
 * checks every one again).
 */
export function UserActions({
  user,
  canWrite,
  canManageAdmins,
  isSelf,
}: {
  user: AdminUserDetail;
  canWrite: boolean;
  canManageAdmins: boolean;
  isSelf: boolean;
}) {
  const [confirm, setConfirm] = useState<Pending | null>(null);
  const [nicknameOpen, setNicknameOpen] = useState(false);
  const update = useUpdateUser(user.user_id, () => {
    setConfirm(null);
    setNicknameOpen(false);
  });
  const isAdminAccount = user.role === "admin";
  const editable = canWrite && !isAdminAccount && !isSelf && user.status !== "deactivated";
  // Offered only where the grant can actually succeed: the caller holds
  // `admins:manage`, and the target is somebody else who is not an admin
  // already and whose account is active.
  const canPromote = canManageAdmins && !isAdminAccount && !isSelf && user.status === "active";

  return (
    <>
      <div className="hgadm-page-head__actions">
        {editable && (
          <>
            <Button onClick={() => setNicknameOpen(true)}>닉네임 변경</Button>
            {user.role === "tester" ? (
              <Button
                onClick={() =>
                  setConfirm({
                    title: "일반 사용자로 전환",
                    message: `${user.email} 계정의 테스터 권한(프리미엄 상시 접근)을 해제할까요?`,
                    body: { role: "member" },
                  })
                }
              >
                테스터 해제
              </Button>
            ) : (
              <Button
                onClick={() =>
                  setConfirm({
                    title: "테스터로 전환",
                    message: `${user.email} 계정을 테스터로 전환하면 구독 없이 프리미엄 기능 전체에 접근할 수 있게 됩니다. 진행할까요?`,
                    body: { role: "tester" },
                  })
                }
              >
                테스터 지정
              </Button>
            )}
            {user.status === "suspended" ? (
              <Button
                variant="primary"
                onClick={() =>
                  setConfirm({
                    title: "계정 정지 해제",
                    message: `${user.email} 계정을 활성 상태로 되돌리고 로그인을 다시 허용할까요?`,
                    body: { status: "active" },
                  })
                }
              >
                정지 해제
              </Button>
            ) : (
              <Button
                variant="danger-soft"
                onClick={() =>
                  setConfirm({
                    title: "계정 정지",
                    message: `${user.email} 계정을 정지하면 로그인되어 있던 모든 기기에서 즉시 로그아웃되고, 다시 로그인할 수 없게 됩니다. 진행할까요?`,
                    danger: true,
                    // The reason is stored and read back by operators: Korean.
                    body: { status: "suspended", reason: "관리자 계정 정지" },
                  })
                }
              >
                계정 정지
              </Button>
            )}
          </>
        )}
        {canPromote && <PromoteToAdmin user={user} />}
        {/* Only for someone who can actually open that page: `admins:manage` is
            super_admin's alone, and the sidebar hides the destination from
            everyone else too. */}
        {isAdminAccount && canManageAdmins && (
          <Link to="/admins" className="hgadm-btn hgadm-btn--secondary">
            관리자 계정 관리에서 변경
          </Link>
        )}
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ""}
        message={confirm?.message ?? ""}
        danger={confirm?.danger}
        loading={update.isPending}
        confirmLabel="진행"
        onConfirm={() => confirm && update.mutate(confirm.body)}
        onCancel={() => setConfirm(null)}
      />
      {nicknameOpen && (
        <NicknameDialog
          initial={user.nickname ?? ""}
          saving={update.isPending}
          onSave={(nickname) => update.mutate({ nickname })}
          onClose={() => setNicknameOpen(false)}
        />
      )}
    </>
  );
}

function NicknameDialog({
  initial,
  saving,
  onSave,
  onClose,
}: {
  initial: string;
  saving: boolean;
  onSave: (nickname: string) => void;
  onClose: () => void;
}) {
  const [nickname, setNickname] = useState(initial);
  return (
    <Modal
      open
      title="닉네임 변경"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button
            variant="primary"
            loading={saving}
            // Trimmed: the server stores the value as sent and checks
            // uniqueness by exact match, so " kim" would sit beside "kim".
            onClick={() => onSave(nickname.trim())}
            disabled={nickname.trim().length < 2}
          >
            저장
          </Button>
        </>
      }
    >
      <Field label="새 닉네임" required hint="2~40자, 중복 불가">
        <Input value={nickname} maxLength={40} onChange={(e) => setNickname(e.target.value)} />
      </Field>
    </Modal>
  );
}

/**
 * Promotion is a two-step action: pick the tier, then confirm it. The tier
 * lives here rather than in the confirm dialog so the summary can name it.
 */
function PromoteToAdmin({ user }: { user: AdminUserDetail }) {
  const [open, setOpen] = useState(false);
  const [tier, setTier] = useState<AdminTier>(DEFAULT_GRANT_TIER);
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const promote = usePromoteToAdmin(user.user_id, {
    onDone: () => {
      setConfirming(false);
      setOpen(false);
      setNote("");
      setTier(DEFAULT_GRANT_TIER);
    },
    // Keep the dialog open so the reason is read next to the action that
    // caused it; the server rejects a duplicate or inactive target here.
    onRefused: () => setConfirming(false),
  });

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        관리자로 승격
      </Button>
      <Modal
        open={open}
        title="관리자로 승격"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button variant="primary" onClick={() => setConfirming(true)}>
              다음
            </Button>
          </>
        }
      >
        <p className="hgadm-muted hgadm-text-xs hgadm-mt-0">
          {personNameWithEmail(user)} 계정에 관리자 포털 접근 권한을 부여합니다. 권한 등급은 이후 관리자 계정 관리에서 변경하거나
          회수할 수 있어요.
        </p>
        <Field label="권한 등급" required hint={ADMIN_TIERS.find((t) => t.value === tier)?.desc}>
          <Select value={tier} onChange={(e) => setTier(e.target.value as AdminTier)}>
            {ADMIN_TIERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="메모" hint="부여 사유 등 (선택)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="예: 2026-09 고객지원 온보딩" />
        </Field>
      </Modal>
      <ConfirmDialog
        open={confirming}
        title="관리자 권한을 부여할까요?"
        message={`${personNameWithEmail(user)} 계정이 '${ADMIN_TIER_LABEL[tier] ?? tier}' 등급의 관리자가 됩니다. 이 변경은 관리자 활동 기록에 남습니다.`}
        danger
        loading={promote.isPending}
        confirmLabel="권한 부여"
        onConfirm={() => promote.mutate({ email: user.email, tier, note })}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

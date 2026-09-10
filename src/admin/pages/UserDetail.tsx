import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { adminApi } from "../api";
import type { AdminTier } from "../api";
import { errorMessage } from "../../lib/http";
import { useToast, useToastError } from "../../hooks/toast";
import { useAdminAuth } from "../auth";
import {
  Badge,
  Button,
  ConfirmDialog,
  Dl,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Modal,
  Select,
  statusLabel,
  statusTone,
} from "../components/kit";
import {
  formatDateTime,
  formatDuration,
  formatMoney,
} from "../lib/format";
import {
  ADMIN_TIERS,
  ADMIN_TIER_LABEL,
  DEFAULT_GRANT_TIER,
  ROLE_LABELS,
} from "../lib/adminTiers";

export function UserDetailPage() {
  const { userId = "" } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const { can, me } = useAdminAuth();
  const [tab, setTab] = useState<"overview" | "billing" | "learning" | "misc">("overview");
  const [confirm, setConfirm] = useState<null | {
    title: string;
    message: string;
    danger?: boolean;
    body: { role?: string; status?: string; reason?: string };
  }>(null);
  const [nicknameModal, setNicknameModal] = useState(false);
  const [nickname, setNickname] = useState("");
  // Promotion is a two-step action: pick the tier, then confirm it. The tier
  // lives here rather than in the confirm dialog so the summary can name it.
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteTier, setPromoteTier] = useState<AdminTier>(DEFAULT_GRANT_TIER);
  const [promoteNote, setPromoteNote] = useState("");
  const [promoteConfirm, setPromoteConfirm] = useState(false);

  const query = useQuery({
    queryKey: ["admin", "user", userId],
    queryFn: () => adminApi.userDetail(userId),
    enabled: Boolean(userId),
  });

  const update = useMutation({
    mutationFn: (body: { role?: string; status?: string; nickname?: string; reason?: string }) =>
      adminApi.updateUser(userId, body),
    onSuccess: () => {
      toast.success("변경 사항이 저장되었어요.");
      setConfirm(null);
      setNicknameModal(false);
      void qc.invalidateQueries({ queryKey: ["admin", "user", userId] });
      void qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: toastError,
  });

  /* Promotion goes through /admin/admins, the same endpoint the admin-accounts
     page uses — it is the only path that carries the `admins:manage` check and
     writes the tier row, so the user directory never becomes a second way to
     hand out privileges. The button below is a shortcut to it, not a bypass. */
  const promote = useMutation({
    mutationFn: (target: { email: string }) =>
      adminApi.grantAdmin({
        email: target.email,
        admin_role: promoteTier,
        note: promoteNote.trim() || undefined,
      }),
    onSuccess: (account) => {
      toast.success(
        `관리자 권한을 부여했어요. (${ADMIN_TIER_LABEL[account.admin_role] ?? account.admin_role})`,
      );
      setPromoteConfirm(false);
      setPromoteOpen(false);
      setPromoteNote("");
      setPromoteTier(DEFAULT_GRANT_TIER);
      void qc.invalidateQueries({ queryKey: ["admin", "user", userId] });
      void qc.invalidateQueries({ queryKey: ["admin", "users"] });
      void qc.invalidateQueries({ queryKey: ["admin", "admins"] });
    },
    onError: (error) => {
      // Keep the dialog open so the reason is read next to the action that
      // caused it; the server rejects a duplicate or inactive target here.
      setPromoteConfirm(false);
      toastError(error);
    },
  });

  if (query.isPending) return <LoadingState label="사용자 정보를 불러오는 중…" />;
  if (query.isError)
    return (
      <ErrorState
        message={errorMessage(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  const user = query.data;
  const canWrite = can("users:write");
  const isSelf = me?.user_id === user.user_id;
  const isAdminAccount = user.role === "admin";
  const actionsBlocked = !canWrite || isSelf || user.status === "deactivated";
  /* Offered only where the grant can actually succeed: the caller holds
     `admins:manage`, and the target is somebody else who is not an admin
     already and whose account is active. The server enforces every one of
     these again — this only keeps a doomed action off the screen. */
  const canPromote =
    can("admins:manage") && !isAdminAccount && !isSelf && user.status === "active";

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <div className="hgadm-row" style={{ marginBottom: 4 }}>
            <Link
              to="/users"
              className="hgadm-muted hgadm-row"
              style={{ fontSize: 13, gap: 4 }}
            >
              <ArrowLeft size={14} strokeWidth={2} />
              사용자 목록
            </Link>
          </div>
          <h1 className="hgadm-row">
            {user.nickname ?? user.name}
            <Badge tone={statusTone(user.status)} dot>
              {statusLabel(user.status)}
            </Badge>
            <Badge tone={isAdminAccount ? "brand" : "neutral"}>
              {ROLE_LABELS[user.role] ?? user.role}
            </Badge>
            {/* The tier decides what an admin can actually do, so it belongs
                next to the role rather than only on the admin-accounts page. */}
            {isAdminAccount && (
              <Badge tone="brand">
                {ADMIN_TIER_LABEL[user.admin_role ?? ""] ?? user.admin_role ?? "최고 관리자"}
              </Badge>
            )}
          </h1>
          <div className="hgadm-page-head__desc">
            {user.email} · <span className="hgadm-cell-mono">{user.user_id}</span>
          </div>
        </div>
        <div className="hgadm-page-head__actions">
          {canWrite && !isAdminAccount && !isSelf && user.status !== "deactivated" && (
            <>
              <Button
                onClick={() => {
                  setNickname(user.nickname ?? "");
                  setNicknameModal(true);
                }}
              >
                닉네임 변경
              </Button>
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
                      message: `${user.email} 계정의 정지를 해제하고 로그인을 다시 허용할까요?`,
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
                      message: `${user.email} 계정을 정지하면 즉시 로그인이 차단됩니다. 진행할까요?`,
                      danger: true,
                      body: { status: "suspended", reason: "admin suspension" },
                    })
                  }
                >
                  계정 정지
                </Button>
              )}
            </>
          )}
          {canPromote && (
            <Button variant="primary" onClick={() => setPromoteOpen(true)}>
              관리자로 승격
            </Button>
          )}
          {isAdminAccount && (
            <Link to="/admins" className="hgadm-btn hgadm-btn--secondary">
              관리자 계정 관리에서 변경
            </Link>
          )}
        </div>
      </div>

      <div className="hgadm-tabs">
        {(
          [
            ["overview", "개요"],
            ["billing", "구독·결제"],
            ["learning", "학습·게임"],
            ["misc", "쿠폰·기기"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={`hgadm-tab ${tab === key ? "active" : ""}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="hgadm-grid-2">
          <div className="hgadm-card">
            <div className="hgadm-card__head">
              <div className="hgadm-card__title">계정 정보</div>
            </div>
            <div className="hgadm-card__body">
              <Dl
                items={[
                  ["이름", user.name],
                  ["닉네임", user.nickname],
                  ["이메일", user.email],
                  ["전화번호", user.phone_masked ?? "—"],
                  ["전화 인증", user.phone_verified ? "완료" : "미인증"],
                  ["국적", user.nationality],
                  ["가입일", formatDateTime(user.created_at)],
                  [
                    "로그인 수단",
                    [
                      user.has_password ? "이메일" : null,
                      ...user.social_providers,
                    ]
                      .filter(Boolean)
                      .join(", "),
                  ],
                  ["마케팅 수신", user.marketing_opt_in ? "동의" : "거부"],
                  [
                    "탈퇴일",
                    user.deactivated_at ? formatDateTime(user.deactivated_at) : "—",
                  ],
                ]}
              />
            </div>
          </div>
          <div className="hgadm-card">
            <div className="hgadm-card__head">
              <div className="hgadm-card__title">온보딩 응답</div>
            </div>
            <div className="hgadm-card__body">
              {user.onboarding ? (
                <Dl
                  items={[
                    ["학습 목적", String(user.onboarding.purpose ?? "—")],
                    ["말하기 수준", String(user.onboarding.speaking_level ?? "—")],
                    ["TOPIK 목표", String(user.onboarding.topik_target ?? "—")],
                    [
                      "일일 목표",
                      `문장 ${user.onboarding.daily_sentence_goal ?? "—"} · 문제 ${user.onboarding.daily_question_goal ?? "—"}`,
                    ],
                  ]}
                />
              ) : (
                <span className="hgadm-muted">온보딩을 완료하지 않았습니다.</span>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "billing" && (
        <div>
          <div className="hgadm-card hgadm-section">
            <div className="hgadm-card__head">
              <div className="hgadm-card__title">현재 구독</div>
              {user.subscription && (
                <Badge tone={statusTone(user.subscription.status)}>
                  {statusLabel(user.subscription.status)}
                </Badge>
              )}
            </div>
            <div className="hgadm-card__body">
              {user.subscription ? (
                <Dl
                  items={[
                    [
                      "요금제",
                      `${user.subscription.plan_name ?? user.subscription.plan_id ?? "—"}`,
                    ],
                    ["결제 수단 제공자", user.subscription.provider],
                    [
                      "체험 종료",
                      formatDateTime(user.subscription.trial_expires_at),
                    ],
                    [
                      "현재 주기 종료",
                      formatDateTime(user.subscription.current_period_end),
                    ],
                    ["다음 결제", formatDateTime(user.subscription.next_billing_at)],
                    [
                      "해지 예약",
                      user.subscription.cancel_at_period_end ? "예" : "아니요",
                    ],
                    ["시작일", formatDateTime(user.subscription.created_at)],
                  ]}
                />
              ) : (
                <span className="hgadm-muted">활성 구독이 없습니다.</span>
              )}
            </div>
          </div>
          <div className="hgadm-card">
            <div className="hgadm-card__head">
              <div className="hgadm-card__title">최근 청구서</div>
            </div>
            <div className="hgadm-table-wrap">
              <table className="hgadm-table">
                <thead>
                  <tr>
                    <th>청구서</th>
                    <th>요금제</th>
                    <th className="num">금액</th>
                    <th>상태</th>
                    <th>결제일</th>
                  </tr>
                </thead>
                <tbody>
                  {user.recent_invoices.length === 0 && (
                    <tr>
                      <td colSpan={5}>
                        <div className="hgadm-table__empty">청구서가 없습니다.</div>
                      </td>
                    </tr>
                  )}
                  {user.recent_invoices.map((inv) => (
                    <tr key={inv.invoice_id}>
                      <td className="hgadm-cell-mono">{inv.invoice_id}</td>
                      <td>{inv.plan_name}</td>
                      <td className="num">{formatMoney(inv.total_cents, inv.currency)}</td>
                      <td>
                        <Badge tone={statusTone(inv.status)}>{statusLabel(inv.status)}</Badge>
                      </td>
                      <td>{formatDateTime(inv.paid_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === "learning" && (
        <div className="hgadm-grid-2">
          <div className="hgadm-card">
            <div className="hgadm-card__head">
              <div className="hgadm-card__title">학습 현황</div>
            </div>
            <div className="hgadm-card__body">
              <Dl
                items={[
                  [
                    "스트릭",
                    `${user.learning.current_streak}일 (최고 ${user.learning.best_streak}일)`,
                  ],
                  ["마지막 학습일", user.learning.last_active_date ?? "—"],
                  ["누적 학습", formatDuration(user.learning.total_minutes * 60)],
                  ["최근 30일 세션", `${user.learning.sessions_30d}회`],
                  [
                    "일일 목표",
                    `문장 ${user.learning.daily_sentence_goal ?? "—"} · 문제 ${user.learning.daily_question_goal ?? "—"}`,
                  ],
                ]}
              />
              <hr className="hgadm-divider" />
              {user.learning.tracks.length === 0 ? (
                <span className="hgadm-muted">트랙 진행 정보가 없습니다.</span>
              ) : (
                user.learning.tracks.map((t) => (
                  <div key={t.track_id} className="hgadm-row" style={{ marginBottom: 8 }}>
                    <Badge tone="brand">
                      {t.track_id === "track_topik" ? "TOPIK" : "회화"}
                    </Badge>
                    <span style={{ fontSize: 13.5 }}>
                      레벨 {t.current_level} · 진행률 {t.level_progress}% · 누적{" "}
                      {formatDuration(t.cumulative_seconds)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="hgadm-card">
            <div className="hgadm-card__head">
              <div className="hgadm-card__title">포인트·리그</div>
            </div>
            <div className="hgadm-card__body">
              <Dl
                items={[
                  ["보유 포인트", user.gamification.points_balance.toLocaleString()],
                  [
                    "시즌 포인트",
                    user.gamification.season_points.toLocaleString(),
                  ],
                  ["리그 티어", user.gamification.league_tier],
                  ["시즌", user.gamification.league_season_id],
                  [
                    "최근 30일 출석",
                    `${user.gamification.attendance_days_30d}일`,
                  ],
                  ["친구 수", user.friends_count.toLocaleString()],
                ]}
              />
            </div>
          </div>
        </div>
      )}

      {tab === "misc" && (
        <div className="hgadm-grid-2">
          <div className="hgadm-card">
            <div className="hgadm-card__head">
              <div className="hgadm-card__title">쿠폰 그랜트</div>
            </div>
            <div className="hgadm-table-wrap">
              <table className="hgadm-table">
                <thead>
                  <tr>
                    <th>쿠폰</th>
                    <th>기간</th>
                    <th>상태</th>
                    <th>만료</th>
                  </tr>
                </thead>
                <tbody>
                  {user.coupons.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <div className="hgadm-table__empty">쿠폰 사용 이력이 없습니다.</div>
                      </td>
                    </tr>
                  )}
                  {user.coupons.map((c) => (
                    <tr key={c.grant_id}>
                      <td className="hgadm-cell-mono">{c.coupon_id}</td>
                      <td>{c.duration_days}일</td>
                      <td>
                        <Badge tone={statusTone(c.status)}>{statusLabel(c.status)}</Badge>
                      </td>
                      <td>{formatDateTime(c.expires_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="hgadm-card">
            <div className="hgadm-card__head">
              <div className="hgadm-card__title">등록 기기</div>
              <Badge tone="neutral">미읽음 알림 {user.notifications_unread}</Badge>
            </div>
            <div className="hgadm-table-wrap">
              <table className="hgadm-table">
                <thead>
                  <tr>
                    <th>플랫폼</th>
                    <th>앱 버전</th>
                    <th>상태</th>
                    <th>마지막 접속</th>
                  </tr>
                </thead>
                <tbody>
                  {user.devices.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <div className="hgadm-table__empty">등록된 기기가 없습니다.</div>
                      </td>
                    </tr>
                  )}
                  {user.devices.map((d, i) => (
                    <tr key={i}>
                      <td>{d.platform}</td>
                      <td>{d.app_version ?? "—"}</td>
                      <td>
                        <Badge tone={d.is_active ? "success" : "neutral"}>
                          {d.is_active ? "활성" : "비활성"}
                        </Badge>
                      </td>
                      <td>{formatDateTime(d.last_seen_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

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

      <Modal
        open={nicknameModal}
        title="닉네임 변경"
        onClose={() => setNicknameModal(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setNicknameModal(false)}>
              취소
            </Button>
            <Button
              variant="primary"
              loading={update.isPending}
              onClick={() => update.mutate({ nickname })}
              disabled={nickname.trim().length < 2}
            >
              저장
            </Button>
          </>
        }
      >
        <Field label="새 닉네임" required hint="2~40자, 중복 불가">
          <Input value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </Field>
      </Modal>

      <Modal
        open={promoteOpen}
        title="관리자로 승격"
        onClose={() => setPromoteOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPromoteOpen(false)}>
              취소
            </Button>
            <Button variant="primary" onClick={() => setPromoteConfirm(true)}>
              다음
            </Button>
          </>
        }
      >
        <p className="hgadm-muted" style={{ marginTop: 0, fontSize: 12.5 }}>
          {user.email} 계정에 관리자 포털 접근 권한을 부여합니다. 권한 등급은
          이후 관리자 계정 관리에서 변경하거나 회수할 수 있어요.
        </p>
        <Field label="권한 등급" required hint={ADMIN_TIERS.find((t) => t.value === promoteTier)?.desc}>
          <Select
            value={promoteTier}
            onChange={(e) => setPromoteTier(e.target.value as AdminTier)}
          >
            {ADMIN_TIERS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="메모" hint="부여 사유 등 (선택)">
          <Input
            value={promoteNote}
            onChange={(e) => setPromoteNote(e.target.value)}
            placeholder="예: 2026-09 고객지원 온보딩"
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={promoteConfirm}
        title="관리자 권한을 부여할까요?"
        message={`${user.email} 계정이 '${ADMIN_TIER_LABEL[promoteTier] ?? promoteTier}' 등급의 관리자가 됩니다. 이 변경은 관리자 활동 기록에 남습니다.`}
        danger
        loading={promote.isPending}
        confirmLabel="권한 부여"
        onConfirm={() => promote.mutate({ email: user.email })}
        onCancel={() => setPromoteConfirm(false)}
      />

      {actionsBlocked && canWrite && (isSelf || user.status === "deactivated") && (
        <p className="hgadm-muted" style={{ marginTop: 16, fontSize: 12.5 }}>
          {isSelf
            ? "본인 계정의 역할·상태는 이 화면에서 변경할 수 없습니다."
            : "사용자가 직접 탈퇴한 계정은 관리자가 되살릴 수 없습니다."}
        </p>
      )}
    </div>
  );
}

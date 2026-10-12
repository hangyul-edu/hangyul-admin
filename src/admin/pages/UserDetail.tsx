import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { adminApi } from "../api";
import type { AdminPersonAccount, AdminTier } from "../api";
import { errorMessage } from "../../lib/http";
import { useToast, useToastError } from "../../hooks/toast";
import { useAdminAuth } from "../auth";
import { backNavigationState, useBackTarget } from "../lib/navigation";
import type { BackTarget, NavigationState } from "../lib/navigation";
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
  Timestamp,
  statusLabel,
  statusTone,
} from "../components/kit";
import {
  formatDateTime,
  formatDuration,
  formatMoney,
} from "../lib/format";
import { accountStatusLabel, accountStatusTone } from "../lib/accountStatus";
import {
  ADMIN_TIERS,
  ADMIN_TIER_LABEL,
  DEFAULT_GRANT_TIER,
  ROLE_LABELS,
} from "../lib/adminTiers";
import { personName, personNameWithEmail } from "../lib/adminIdentity";
import { TierChip } from "../components/TierChip";

/**
 * The member's daily goals: what they chose, and what is actually in force.
 *
 * Regular members are capped at 5 however high they set it, so one number
 * cannot distinguish "chose 20, capped to 5" from "chose 5" — and support was
 * reading the capped number as the member's choice. The cap is only shown when
 * it actually bites; for a premium member the two are equal and a "(적용: 20)"
 * beside a 20 would be noise.
 */
function DailyGoals({
  learning,
}: {
  learning: {
    daily_sentence_goal: number | null;
    daily_question_goal: number | null;
    effective_daily_sentence_goal: number | null;
    effective_daily_question_goal: number | null;
  };
}) {
  const part = (chosen: number | null, effective: number | null) => {
    if (chosen === null) return "—";
    if (effective === null || effective === chosen) return String(chosen);
    return `${chosen} (적용: ${effective})`;
  };
  const capped =
    learning.effective_daily_sentence_goal !== null &&
    learning.effective_daily_sentence_goal !== learning.daily_sentence_goal;
  return (
    <div>
      <div>
        문장 {part(learning.daily_sentence_goal, learning.effective_daily_sentence_goal)}
        {" · "}
        문제 {part(learning.daily_question_goal, learning.effective_daily_question_goal)}
      </div>
      {capped && (
        <div className="hgadm-cell-sub">
          일반 회원은 목표가 5로 제한됩니다. 구독 시 선택값이 그대로 적용됩니다.
        </div>
      )}
    </div>
  );
}

export function UserDetailPage() {
  const { userId = "" } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const { can, me } = useAdminAuth();
  const back = useBackTarget({ to: "/users", label: "사용자 목록" });
  const [tab, setTab] = useState<"overview" | "billing" | "learning" | "onboarding" | "misc">("overview");
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
            {/* Back to wherever this page was opened from — the directory by
                default, but the league that linked here if that is where the
                admin came from. */}
            <Link
              to={back.to}
              state={backNavigationState(back)}
              className="hgadm-muted hgadm-row"
              style={{ fontSize: 13, gap: 4 }}
            >
              <ArrowLeft size={14} strokeWidth={2} />
              {back.label}
            </Link>
          </div>
          <h1 className="hgadm-row">
            {personName(user)}
            <Badge tone={accountStatusTone(user.status)} dot>
              {accountStatusLabel(user.status)}
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
          {/* Nickname and email identify the account to a person; the
              user_id is a developer handle and stays in the URL, which is
              where support copies one from — the same rule the league screens
              follow. */}
          <div className="hgadm-page-head__desc">
            {user.nickname ? `${user.nickname} · ` : ""}
            {user.email}
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
          {/* Only for someone who can actually open that page. `admins:manage`
              is super_admin's alone, so an operator, content manager, support
              agent or viewer was being offered a door into 접근 권한이 없습니다.
              The sidebar already hides the same destination from them; this is
              the one place that did not. */}
          {isAdminAccount && can("admins:manage") && (
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
            ["onboarding", "온보딩"],
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
        <>
        <div className="hgadm-grid-2">
          <div className="hgadm-card">
            <div className="hgadm-card__head">
              <div className="hgadm-card__title">계정 정보</div>
            </div>
            <div className="hgadm-card__body">
              <Dl
                items={[
                  /* No 상태 row: the badge beside the name already states it,
                     and what each state means is on the user list's
                     계정 상태 안내 rather than repeated per account. */
                  ["이름", user.name],
                  ["닉네임", user.nickname],
                  ["이메일", user.email],
                  ["전화번호", user.phone_masked ?? "—"],
                  ["전화 인증", user.phone_verified ? "완료" : "미인증"],
                  ["국적", user.nationality],
                  ["가입일시", <Timestamp key="created" at={user.created_at} />],
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
                    "탈퇴일시",
                    user.deactivated_at ? (
                      <Timestamp key="deactivated" at={user.deactivated_at} />
                    ) : (
                      "—"
                    ),
                  ],
                ]}
              />
            </div>
          </div>
          {/* The overview answers "how is this account doing right now", so the
              second card is the learner's current state. The 학습·게임 tab
              keeps the full detail; these are the few figures worth reading
              before deciding whether to open it. */}
          <div className="hgadm-card">
            <div className="hgadm-card__head">
              <div className="hgadm-card__title">현재 학습·게임 현황</div>
            </div>
            <div className="hgadm-card__body">
              <Dl
                items={[
                  ["마지막 학습일", user.learning.last_active_date ?? "학습 기록 없음"],
                  [
                    "연속 학습",
                    `${user.learning.current_streak}일 (최고 ${user.learning.best_streak}일)`,
                  ],
                  ["최근 30일 학습 횟수", `${user.learning.sessions_30d}회`],
                  ["누적 학습", formatDuration(user.learning.total_minutes * 60)],
                  [
                    "일일 목표",
                    <DailyGoals key="goals" learning={user.learning} />,
                  ],
                  [
                    "리그",
                    /* The same chip the league screens use — the tier's proper
                       name in the app's own colour, rather than the raw
                       `green` this was printing. */
                    user.gamification.league_tier ? (
                      <div key="league" className="hgadm-row">
                        <TierChip tier={user.gamification.league_tier} />
                        <span style={{ fontSize: 13.5 }}>
                          {user.gamification.season_points.toLocaleString()}P
                        </span>
                      </div>
                    ) : (
                      <span key="league" className="hgadm-muted">
                        리그 미배정
                      </span>
                    ),
                  ],
                  [
                    "누적 포인트",
                    `${user.gamification.points_total.toLocaleString()}P`,
                  ],
                  ["최근 30일 출석", `${user.gamification.attendance_days_30d}일`],
                ]}
              />
            </div>
          </div>
        </div>
        {/* Only for a person with more than one account: for everyone else
            it would be this account again, in a table. */}
        {user.accounts.length > 1 && (
          <AccountHistory accounts={user.accounts} count={user.reregistration_count} back={back} />
        )}
        </>
      )}

      {tab === "onboarding" && (
        <div className="hgadm-card">
          <div className="hgadm-card__head">
            <div className="hgadm-card__title">온보딩 응답</div>
          </div>
          <div className="hgadm-card__body">
            {user.onboarding ? (
              <>
                <Dl
                  items={[
                    ["학습 목적", String(user.onboarding.purpose ?? "—")],
                    ["말하기 수준", String(user.onboarding.speaking_level ?? "—")],
                    ["TOPIK 목표", String(user.onboarding.topik_target ?? "—")],
                    [
                      "일일 목표 (선택값)",
                      `문장 ${user.onboarding.daily_sentence_goal ?? "—"} · 문제 ${user.onboarding.daily_question_goal ?? "—"}`,
                    ],
                  ]}
                />
                {/* These are the answers given at signup, kept as a record.
                    What the learner is actually held to now is on 학습·게임 —
                    the two drift apart as soon as they change a setting. */}
                <p className="hgadm-cell-sub" style={{ marginTop: 14 }}>
                  가입 시 응답한 내용입니다. 현재 적용 중인 값은 학습·게임 탭에서
                  확인하세요.
                </p>
              </>
            ) : (
              <span className="hgadm-muted">온보딩을 완료하지 않았습니다.</span>
            )}
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
                      `${user.subscription.plan_name ?? "—"}`,
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
              {user.free_trial && (
                <>
                  <hr className="hgadm-divider" />
                  <Dl
                    items={[
                      [
                        "무료 체험",
                        user.free_trial.available
                          ? "사용 가능 (회원당 1회)"
                          : `사용함 · ${formatDateTime(user.free_trial.started_at)} ~ ${formatDateTime(user.free_trial.ended_at)}`,
                      ],
                      ["신규 회원 요금", user.free_trial.new_member ? "대상 (체험·결제 이력 없음)" : "대상 아님"],
                    ]}
                  />
                </>
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
                    <th>요금제</th>
                    <th className="num">금액</th>
                    <th>상태</th>
                    <th>결제일</th>
                  </tr>
                </thead>
                <tbody>
                  {user.recent_invoices.length === 0 && (
                    <tr>
                      <td colSpan={4}>
                        <div className="hgadm-table__empty">청구서가 없습니다.</div>
                      </td>
                    </tr>
                  )}
                  {user.recent_invoices.map((inv) => (
                    <tr key={inv.invoice_id}>
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
                    "연속 학습",
                    `${user.learning.current_streak}일 (최고 ${user.learning.best_streak}일)`,
                  ],
                  ["마지막 학습일", user.learning.last_active_date ?? "—"],
                  ["누적 학습", formatDuration(user.learning.total_minutes * 60)],
                  ["최근 30일 학습 횟수", `${user.learning.sessions_30d}회`],
                  [
                    "일일 목표",
                    <DailyGoals key="goals" learning={user.learning} />,
                  ],
                ]}
              />
              <hr className="hgadm-divider" />
              {user.learning.tracks.length === 0 ? (
                <span className="hgadm-muted">학습 분야별 진행 정보가 없습니다.</span>
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
                  ["누적 포인트", user.gamification.points_total.toLocaleString()],
                  [
                    "이번 시즌 포인트",
                    user.gamification.season_points.toLocaleString(),
                  ],
                  [
                    "리그 등급",
                    user.gamification.league_tier ? (
                      <TierChip key="tier" tier={user.gamification.league_tier} />
                    ) : (
                      <span key="tier" className="hgadm-muted">리그 미배정</span>
                    ),
                  ],
                  ["시즌", user.gamification.league_season_id ?? "—"],
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
              <div className="hgadm-card__title">쿠폰 지급 내역</div>
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
                      <td>{c.batch_name ?? "(이름 없는 배치)"}</td>
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
              // Trimmed: the server stores the value as sent and checks
              // uniqueness by exact match, so " kim" would sit beside "kim".
              onClick={() => update.mutate({ nickname: nickname.trim() })}
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
          {personNameWithEmail(user)} 계정에 관리자 포털 접근 권한을 부여합니다. 권한 등급은
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
            maxLength={200}
            placeholder="예: 2026-09 고객지원 온보딩"
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={promoteConfirm}
        title="관리자 권한을 부여할까요?"
        message={`${personNameWithEmail(user)} 계정이 '${ADMIN_TIER_LABEL[promoteTier] ?? promoteTier}' 등급의 관리자가 됩니다. 이 변경은 관리자 활동 기록에 남습니다.`}
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

/** Every account this person has had, oldest first. Withdrawing releases an
    account's email / phone / nickname so the person can sign up again as a new
    account (the member app starts them fresh); the admin keeps the whole chain,
    with each withdrawn account shown under the identifiers it had. */
function AccountHistory({
  accounts,
  count,
  back,
}: {
  accounts: AdminPersonAccount[];
  count: number;
  /** Moving between one person's accounts keeps this page's own back link. */
  back: BackTarget;
}) {
  return (
    // Spaced from the cards above like they are from each other (the grid gap).
    <div className="hgadm-card hgadm-section" style={{ marginTop: 18 }}>
      <div className="hgadm-card__head">
        <div className="hgadm-card__title">
          계정 이력 · 재가입 {count}회
        </div>
      </div>
      <div className="hgadm-table-wrap">
        <table className="hgadm-table">
          <thead>
            <tr>
              <th>계정</th>
              <th>상태</th>
              <th>가입일시</th>
              <th>탈퇴일시</th>
              <th>전화번호</th>
              <th>로그인 수단</th>
              <th className="num">학습 시간</th>
              <th className="num">포인트</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.user_id}>
                <td>
                  {a.is_this_account ? (
                    <div className="hgadm-cell-main">
                      {a.email} <Badge tone="brand">현재 보는 계정</Badge>
                    </div>
                  ) : (
                    <Link
                      className="hgadm-cell-main"
                      to={`/users/${a.user_id}`}
                      state={{ from: back } satisfies NavigationState}
                    >
                      {a.email}
                    </Link>
                  )}
                  {a.nickname && <div className="hgadm-cell-sub">{a.nickname}</div>}
                </td>
                <td>
                  <Badge tone={accountStatusTone(a.status)} dot>
                    {accountStatusLabel(a.status)}
                  </Badge>
                </td>
                <td>
                  <Timestamp at={a.created_at} />
                </td>
                <td>{a.deactivated_at ? <Timestamp at={a.deactivated_at} /> : "—"}</td>
                <td className="hgadm-cell-mono">{a.phone_masked ?? "—"}</td>
                <td>{a.social_logins.join(", ") || "—"}</td>
                <td className="num">{formatDuration(a.study_minutes * 60)}</td>
                <td className="num">{a.points_total.toLocaleString()}P</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

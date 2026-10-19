import { Link } from "react-router-dom";
import type { AdminPersonAccount, AdminUserDetail } from "../../api";
import { Badge, Card, DataTable, Dl, Timestamp, statusLabel, statusTone } from "../../components/kit";
import type { Column } from "../../components/kit";
import { TierChip } from "../../components/TierChip";
import { accountStatusLabel, accountStatusTone } from "../../lib/accountStatus";
import { formatDateTime, formatDuration, formatMoney } from "../../lib/format";
import type { BackTarget, NavigationState } from "../../lib/navigation";
import { providerLabel, signInMethods } from "../../lib/signInMethods";

type User = AdminUserDetail;

/**
 * The member's daily goals: what they chose, and what is actually in force.
 *
 * Regular members are capped at 5 however high they set it, so one number
 * cannot distinguish "chose 20, capped to 5" from "chose 5" — and support was
 * reading the capped number as the member's choice. The cap is only shown when
 * it actually bites; for a premium member the two are equal and a "(적용: 20)"
 * beside a 20 would be noise.
 */
function DailyGoals({ learning }: { learning: User["learning"] }) {
  const part = (chosen: number | null, effective: number | null) => {
    if (chosen === null) return "—";
    if (effective === null || effective === chosen) return String(chosen);
    return `${chosen} (적용: ${effective})`;
  };
  const capped =
    learning.effective_daily_sentence_goal !== null && learning.effective_daily_sentence_goal !== learning.daily_sentence_goal;
  return (
    <div>
      <div>
        문장 {part(learning.daily_sentence_goal, learning.effective_daily_sentence_goal)}
        {" · "}
        문제 {part(learning.daily_question_goal, learning.effective_daily_question_goal)}
      </div>
      {capped && <div className="hgadm-cell-sub">일반 회원은 목표가 5로 제한됩니다. 구독 시 선택값이 그대로 적용됩니다.</div>}
    </div>
  );
}

const streak = (user: User) => `${user.learning.current_streak}일 (최고 ${user.learning.best_streak}일)`;

/** The league as the league screens show it: the tier's chip, or 미배정. */
function LeagueTier({ user, withPoints = false }: { user: User; withPoints?: boolean }) {
  if (!user.gamification.league_tier) return <span className="hgadm-muted">리그 미배정</span>;
  return withPoints ? (
    <div className="hgadm-row">
      <TierChip tier={user.gamification.league_tier} />
      <span className="hgadm-text-md">{user.gamification.season_points.toLocaleString()}P</span>
    </div>
  ) : (
    <TierChip tier={user.gamification.league_tier} />
  );
}

export function OverviewTab({ user, back }: { user: User; back: BackTarget }) {
  return (
    <>
      <div className="hgadm-grid-2">
        <Card title="계정 정보">
          <Dl
            items={[
              /* No 상태 row: the badge beside the name already states it, and
                 what each state means is on the user list's 계정 상태 안내
                 rather than repeated per account. */
              ["이름", user.name],
              ["닉네임", user.nickname],
              ["이메일", user.email],
              ["전화번호", user.phone_masked ?? "—"],
              ["전화 인증", user.phone_verified ? "완료" : "미인증"],
              ["국적", user.nationality],
              ["가입일시", <Timestamp key="created" at={user.created_at} />],
              ["로그인 수단", signInMethods(user.has_password, user.social_providers).join(", ") || "—"],
              ["마케팅 수신", user.marketing_opt_in ? "동의" : "거부"],
              ["탈퇴일시", user.deactivated_at ? <Timestamp key="deactivated" at={user.deactivated_at} /> : "—"],
            ]}
          />
        </Card>
        {/* The overview answers "how is this account doing right now", so the
            second card is the learner's current state. The 학습·게임 tab keeps
            the full detail; these are the few figures worth reading before
            deciding whether to open it. */}
        <Card title="현재 학습·게임 현황">
          <Dl
            items={[
              ["마지막 학습일", user.learning.last_active_date ?? "학습 기록 없음"],
              ["연속 학습", streak(user)],
              ["최근 30일 학습 횟수", `${user.learning.sessions_30d}회`],
              ["누적 학습", formatDuration(user.learning.total_minutes * 60)],
              ["일일 목표", <DailyGoals key="goals" learning={user.learning} />],
              ["리그", <LeagueTier key="league" user={user} withPoints />],
              ["누적 포인트", `${user.gamification.points_total.toLocaleString()}P`],
              ["최근 30일 출석", `${user.gamification.attendance_days_30d}일`],
            ]}
          />
        </Card>
      </div>
      {/* Only for a person with more than one account: for everyone else it
          would be this account again, in a table. */}
      {user.accounts.length > 1 && <AccountHistory accounts={user.accounts} count={user.reregistration_count} back={back} />}
    </>
  );
}

export function OnboardingTab({ user }: { user: User }) {
  const answers = user.onboarding;
  return (
    <Card title="온보딩 응답">
      {answers ? (
        <>
          <Dl
            items={[
              ["학습 목적", String(answers.purpose ?? "—")],
              ["말하기 수준", String(answers.speaking_level ?? "—")],
              ["TOPIK 목표", String(answers.topik_target ?? "—")],
              ["일일 목표 (선택값)", `문장 ${answers.daily_sentence_goal ?? "—"} · 문제 ${answers.daily_question_goal ?? "—"}`],
            ]}
          />
          {/* These are the answers given at signup, kept as a record. What the
              learner is actually held to now is on 학습·게임 — the two drift
              apart as soon as they change a setting. */}
          <p className="hgadm-cell-sub hgadm-mt-12">가입 시 응답한 내용입니다. 현재 적용 중인 값은 학습·게임 탭에서 확인하세요.</p>
        </>
      ) : (
        <span className="hgadm-muted">온보딩을 완료하지 않았습니다.</span>
      )}
    </Card>
  );
}

const INVOICE_COLUMNS: Column<User["recent_invoices"][number]>[] = [
  { key: "plan", header: "요금제", render: (inv) => inv.plan_name },
  { key: "amount", header: "금액", numeric: true, render: (inv) => formatMoney(inv.total_cents, inv.currency) },
  { key: "status", header: "상태", render: (inv) => <Badge tone={statusTone(inv.status)}>{statusLabel(inv.status)}</Badge> },
  { key: "paid", header: "결제일", render: (inv) => formatDateTime(inv.paid_at) },
];

export function BillingTab({ user }: { user: User }) {
  const sub = user.subscription;
  return (
    <div>
      <Card
        title="현재 구독"
        className="hgadm-section"
        aside={sub && <Badge tone={statusTone(sub.status)}>{statusLabel(sub.status)}</Badge>}
      >
        {sub ? (
          <Dl
            items={[
              ["요금제", `${sub.plan_name ?? "—"}`],
              ["결제 수단 제공자", sub.provider],
              ["체험 종료", formatDateTime(sub.trial_expires_at)],
              ["현재 주기 종료", formatDateTime(sub.current_period_end)],
              ["다음 결제", formatDateTime(sub.next_billing_at)],
              ["해지 예약", sub.cancel_at_period_end ? "예" : "아니요"],
              ["시작일", formatDateTime(sub.created_at)],
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
                ["신규 회원가", user.free_trial.new_member ? "대상 (체험·결제 이력 없음)" : "대상 아님"],
              ]}
            />
          </>
        )}
      </Card>
      <Card title="최근 청구서" flush>
        <DataTable columns={INVOICE_COLUMNS} rows={user.recent_invoices} rowKey={(inv) => inv.invoice_id} empty="청구서가 없습니다." />
      </Card>
    </div>
  );
}

export function LearningTab({ user }: { user: User }) {
  return (
    <div className="hgadm-grid-2">
      <Card title="학습 현황">
        <Dl
          items={[
            ["연속 학습", streak(user)],
            ["마지막 학습일", user.learning.last_active_date ?? "—"],
            ["누적 학습", formatDuration(user.learning.total_minutes * 60)],
            ["최근 30일 학습 횟수", `${user.learning.sessions_30d}회`],
            ["일일 목표", <DailyGoals key="goals" learning={user.learning} />],
          ]}
        />
        <hr className="hgadm-divider" />
        {user.learning.tracks.length === 0 ? (
          <span className="hgadm-muted">학습 분야별 진행 정보가 없습니다.</span>
        ) : (
          user.learning.tracks.map((t) => (
            <div key={t.track_id} className="hgadm-row hgadm-mb-8">
              <Badge tone="brand">{t.track_id === "track_topik" ? "TOPIK" : "회화"}</Badge>
              <span className="hgadm-text-md">
                {/* No progress figure: level_progress is the retired "5 correct
                    answers" counter, not a percentage (levels come from
                    proficiency assessment, on its own page). */}
                학습 난이도 레벨 {t.current_level} · 누적 {formatDuration(t.cumulative_seconds)}
              </span>
            </div>
          ))
        )}
      </Card>
      <Card title="포인트·리그">
        <Dl
          items={[
            ["누적 포인트", user.gamification.points_total.toLocaleString()],
            ["이번 시즌 포인트", user.gamification.season_points.toLocaleString()],
            ["리그 등급", <LeagueTier key="tier" user={user} />],
            ["시즌", user.gamification.league_season_id ?? "—"],
            ["최근 30일 출석", `${user.gamification.attendance_days_30d}일`],
            ["친구 수", user.friends_count.toLocaleString()],
          ]}
        />
      </Card>
    </div>
  );
}

const COUPON_COLUMNS: Column<User["coupons"][number]>[] = [
  { key: "coupon", header: "쿠폰", render: (c) => c.batch_name ?? "(이름 없는 배치)" },
  { key: "days", header: "기간", render: (c) => `${c.duration_days}일` },
  { key: "status", header: "상태", render: (c) => <Badge tone={statusTone(c.status)}>{statusLabel(c.status)}</Badge> },
  { key: "expires", header: "만료", render: (c) => formatDateTime(c.expires_at) },
];

const DEVICE_COLUMNS: Column<User["devices"][number]>[] = [
  { key: "platform", header: "플랫폼", render: (d) => d.platform },
  { key: "version", header: "앱 버전", render: (d) => d.app_version ?? "—" },
  {
    key: "status",
    header: "상태",
    render: (d) => <Badge tone={d.is_active ? "success" : "neutral"}>{d.is_active ? "활성" : "비활성"}</Badge>,
  },
  { key: "seen", header: "마지막 접속", render: (d) => formatDateTime(d.last_seen_at) },
];

export function MiscTab({ user }: { user: User }) {
  return (
    <div className="hgadm-grid-2">
      <Card title="쿠폰 지급 내역" flush>
        <DataTable columns={COUPON_COLUMNS} rows={user.coupons} rowKey={(c) => c.grant_id} empty="쿠폰 사용 이력이 없습니다." />
      </Card>
      <Card title="등록 기기" flush aside={<Badge tone="neutral">미읽음 알림 {user.notifications_unread}</Badge>}>
        <DataTable
          columns={DEVICE_COLUMNS}
          rows={user.devices}
          rowKey={(d) => `${d.platform}:${d.app_version ?? ""}:${d.last_seen_at ?? ""}`}
          empty="등록된 기기가 없습니다."
        />
      </Card>
    </div>
  );
}

/**
 * Every account this person has had, oldest first. Withdrawing releases an
 * account's email / phone / nickname so the person can sign up again as a new
 * account (the member app starts them fresh); the admin keeps the whole chain,
 * with each withdrawn account shown under the identifiers it had.
 */
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
  const columns: Column<AdminPersonAccount>[] = [
    {
      key: "account",
      header: "계정",
      render: (a) => (
        <>
          {a.is_this_account ? (
            <div className="hgadm-cell-main">
              {a.email} <Badge tone="brand">현재 보는 계정</Badge>
            </div>
          ) : (
            <Link className="hgadm-cell-main" to={`/users/${a.user_id}`} state={{ from: back } satisfies NavigationState}>
              {a.email}
            </Link>
          )}
          {a.nickname && <div className="hgadm-cell-sub">{a.nickname}</div>}
        </>
      ),
    },
    {
      key: "status",
      header: "상태",
      render: (a) => (
        <Badge tone={accountStatusTone(a.status)} dot>
          {accountStatusLabel(a.status)}
        </Badge>
      ),
    },
    { key: "created", header: "가입일시", render: (a) => <Timestamp at={a.created_at} /> },
    { key: "deactivated", header: "탈퇴일시", render: (a) => (a.deactivated_at ? <Timestamp at={a.deactivated_at} /> : "—") },
    { key: "phone", header: "전화번호", render: (a) => <span className="hgadm-cell-mono">{a.phone_masked ?? "—"}</span> },
    { key: "logins", header: "로그인 수단", render: (a) => a.social_logins.map(providerLabel).join(", ") || "—" },
    { key: "study", header: "학습 시간", numeric: true, render: (a) => formatDuration(a.study_minutes * 60) },
    { key: "points", header: "포인트", numeric: true, render: (a) => `${a.points_total.toLocaleString()}P` },
  ];
  return (
    // Spaced from the cards above like they are from each other (the grid gap).
    <Card title={`계정 이력 · 재가입 ${count}회`} flush className="hgadm-section hgadm-mt-20">
      <DataTable columns={columns} rows={accounts} rowKey={(a) => a.user_id} />
    </Card>
  );
}

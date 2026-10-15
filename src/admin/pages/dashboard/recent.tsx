import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { MetricsOverview, RecentAdminActionRow } from "../../api";
import { Badge, Timestamp, statusLabel, statusTone } from "../../components/kit";
import { personName } from "../../lib/adminIdentity";
import { describeAuditAction, objectTypeLabel } from "../../lib/auditActions";
import { formatMoney } from "../../lib/format";

/**
 * One line in any of the dashboard's three recent-activity cards.
 *
 * The cards show different things — a signup, a payment, an admin action — but
 * they are the same shape of information: something that happened, a line of
 * supporting detail, and when. Giving them one component is what makes the
 * three read as one dashboard rather than three blocks that happen to sit in a
 * row, and it means the alignment rules are written once.
 *
 * `trailing` is whatever belongs on the right — a timestamp on its own, or an
 * amount above one. It never wraps, so its column is as wide as its content and
 * no wider; because every row in a card carries the same kind of trailing
 * content, that width comes out identical down the card without a fixed size.
 */
function RecentRow({
  primary,
  secondary,
  tertiary,
  trailing,
  to,
}: {
  primary: ReactNode;
  secondary?: ReactNode;
  tertiary?: ReactNode;
  trailing: ReactNode;
  to?: string;
}) {
  const body = (
    <>
      <div className="hgadm-recent__body">
        <div className="hgadm-recent__primary">{primary}</div>
        {secondary && <div className="hgadm-recent__secondary">{secondary}</div>}
        {tertiary && <div className="hgadm-recent__tertiary">{tertiary}</div>}
      </div>
      <div className="hgadm-recent__trailing">{trailing}</div>
    </>
  );
  return to ? (
    <Link to={to} className="hgadm-recent hgadm-recent--link">
      {body}
    </Link>
  ) : (
    <div className="hgadm-recent">{body}</div>
  );
}

/**
 * One line of the dashboard's recent-activity list.
 *
 * Same reading order as the Activity History table — what was done, who did
 * it, on what, and the endpoint underneath — through the same
 * `describeAuditAction`, so the two screens can never describe one row two
 * ways.
 */
export function AdminActivityRow({ entry }: { entry: RecentAdminActionRow }) {
  const described = describeAuditAction({
    ...entry,
    actor_type: "admin",
    user_id: null,
    request_id: null,
    ip_address: null,
  });
  const actor = entry.actor_id
    ? personName({ name: entry.actor_name, email: entry.actor_email, user_id: entry.actor_id })
    : "시스템";
  const target = described.context ?? objectTypeLabel(entry.object_type);

  return (
    <RecentRow
      primary={described.label}
      secondary={
        <>
          <span className="hgadm-recent__lead">{actor}</span>
          <span className="hgadm-recent__sep" aria-hidden="true">·</span>
          <span className="hgadm-recent__rest">{target}</span>
        </>
      }
      tertiary={described.known ? described.raw : undefined}
      trailing={<RecentTime at={entry.occurred_at} />}
    />
  );
}

/**
 * A recent signup: name over nickname and email.
 *
 * The nickname leads the secondary line because it is the shorter and more
 * distinctive of the two, so the email is the half that gives way when the
 * line runs out of room. An account with no name is labelled by its email, and
 * then the email is not repeated underneath itself.
 */
function SignupRow({ user }: { user: MetricsOverview["recent_signups"][number] }) {
  const label = personName(user);
  const email = user.email === label ? null : user.email;
  return (
    <RecentRow
      to={`/users/${user.user_id}`}
      primary={label}
      secondary={
        user.nickname || email ? (
          <>
            {user.nickname && (
              <span className="hgadm-recent__lead">{user.nickname}</span>
            )}
            {user.nickname && email && (
              <span className="hgadm-recent__sep" aria-hidden="true">·</span>
            )}
            {email && <span className="hgadm-recent__rest">{email}</span>}
          </>
        ) : undefined
      }
      trailing={<RecentTime at={user.created_at} />}
    />
  );
}

/**
 * A recent charge: the amount first, then who paid and what for.
 *
 * The amount leads because it is what the card exists to show and what an
 * operator scans down the column; the status rides beside it since a number
 * without an outcome is ambiguous. A payment outlives the account and invoice
 * behind it, so both halves of the detail line are optional and the row
 * degrades to the money rather than disappearing.
 */
function PaymentRow({ payment }: { payment: MetricsOverview["recent_payments"][number] }) {
  const payer = personName({
    name: payment.user_name,
    email: payment.user_email,
    user_id: payment.user_id,
  });
  return (
    <RecentRow
      to={payment.user_id ? `/users/${payment.user_id}` : undefined}
      primary={
        <>
          {formatMoney(payment.amount_cents, payment.currency)}
          <Badge tone={statusTone(payment.status)}>{statusLabel(payment.status)}</Badge>
        </>
      }
      secondary={
        <>
          <span className="hgadm-recent__lead">{payer}</span>
          {payment.plan_name && (
            <>
              <span className="hgadm-recent__sep" aria-hidden="true">·</span>
              <span className="hgadm-recent__rest">{payment.plan_name}</span>
            </>
          )}
        </>
      }
      trailing={<RecentTime at={payment.paid_at ?? payment.created_at} />}
    />
  );
}

/** The timestamp every card ends its rows with — the shared two-line form. */
function RecentTime({ at }: { at: string }) {
  return <Timestamp at={at} />;
}

function RecentCard({
  title,
  more,
  empty,
  children,
}: {
  title: string;
  /** The full list behind the card, when the admin can open it. */
  more?: string;
  /** Shown instead of the rows when there are none. */
  empty: string;
  children: ReactNode[];
}) {
  return (
    <div className="hgadm-card">
      <div className="hgadm-card__head">
        <div className="hgadm-card__title">{title}</div>
        {more && (
          <Link to={more} className="hgadm-recent__more">
            전체 보기
          </Link>
        )}
      </div>
      <div className="hgadm-recent__list">
        {children.length > 0 ? children : <div className="hgadm-recent__empty">{empty}</div>}
      </div>
    </div>
  );
}

/** The three recent-activity cards, each linking to its full list when the admin can open it. */
export function RecentActivity({ data, can }: { data: MetricsOverview; can: (scope: string) => boolean }) {
  return (
    <div className="hgadm-recent-stack">
      <RecentCard title="최근 가입" more={can("users:read") ? "/users" : undefined} empty="아직 가입자가 없습니다.">
        {data.recent_signups.map((u) => (
          <SignupRow key={u.user_id} user={u} />
        ))}
      </RecentCard>
      <RecentCard title="최근 결제" more={can("commerce:read") ? "/payments" : undefined} empty="결제 내역이 없습니다.">
        {data.recent_payments.map((p) => (
          <PaymentRow key={p.payment_id} payment={p} />
        ))}
      </RecentCard>
      <RecentCard title="최근 관리자 활동" more={can("audit:read") ? "/audit-logs" : undefined} empty="기록이 없습니다.">
        {data.recent_admin_actions.map((a) => (
          <AdminActivityRow key={a.id} entry={a} />
        ))}
      </RecentCard>
    </div>
  );
}

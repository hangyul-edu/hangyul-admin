/**
 * The one vocabulary for a member account's status.
 *
 * `users.status` (`src/modules/auth/domain/entities.py:27`) is its own concept
 * and gets its own module, because the portal's shared `STATUS_LABELS` in the
 * component kit is a single flat map keyed by bare strings — shared with
 * subscriptions, payments, invoices, video uploads and coupons. An account and
 * a subscription both have an `active`, and they do not mean the same thing, so
 * routing account status through that map printed the *subscription* label:
 * a normal member read "이용 중" in the table while the filter beside it said
 * "활성" and the audit log said "활성" again. Same row, three words.
 *
 * Every user-management surface reads labels and tones from here — table,
 * detail page, filters, badges, league rosters, audit-log diffs — so the
 * wording cannot drift apart again.
 *
 * The descriptions are written from what the code does, not from what the
 * status is called; see each entry.
 */

import type { BadgeTone } from "../components/kit";

/** The values `users.status` can hold. */
type AccountStatus =
  | "active"
  | "suspended"
  | "deactivated"
  | "pending_verification";

interface AccountStatusMeta {
  /** The one word this status is called, everywhere in the portal. */
  label: string;
  tone: BadgeTone;
  /** What the state actually means for the member, for an admin to read. */
  description: string;
  /**
   * Whether admins are shown this as a state an account can be in — a filter
   * option, a row in the status legend.
   */
  documented: boolean;
}

const META: Record<AccountStatus, AccountStatusMeta> = {
  active: {
    label: "활성",
    tone: "success",
    description:
      "정상적으로 로그인하고 서비스를 이용할 수 있는 상태입니다. 가입 직후의 기본 상태이며, 관리자가 정지했다가 해제한 계정도 이 상태로 돌아옵니다.",
    documented: true,
  },
  suspended: {
    label: "정지",
    tone: "danger",
    /* Suspending ends every session and revokes every refresh token
       (`MemberAdministration._end_every_session`), so the cut-off is
       immediate on every device and the copy says so. */
    description:
      "관리자가 이용을 제한한 상태입니다. 로그인되어 있던 모든 기기에서 즉시 로그아웃되고 다시 로그인할 수 없습니다. 계정과 학습 기록은 그대로 남아 있으며, 관리자가 다시 활성으로 되돌리면 회원이 새로 로그인해 이용할 수 있습니다.",
    documented: true,
  },
  deactivated: {
    label: "탈퇴",
    tone: "neutral",
    /* "회원이 직접": the only writer is DELETE /auth/account
       (`AuthService.delete_account` in auth/application/services.py). No admin
       action and no scheduled job ever sets it — the admin PATCH schema does
       not even accept the value (admin/presentation/schemas.py), and any
       status change on such a row is refused with 409
       (member_administration.py).

       It deliberately does NOT claim the member's data is deleted.
       `delete_account` flips the status, revokes every session and cancels the
       subscription at period end; the row, payment records and learning
       records are all kept. Its email / phone / nickname are released so the
       same person can sign up again as a new account (the originals are kept
       for the admin: 계정 이력 on the detail page,
       tests/integration/test_reregistration.py). Saying the data was
       removed would tell an admin that a member's records are gone while they
       are still in the database. */
    description:
      "회원이 직접 탈퇴한 상태입니다. 모든 기기에서 로그아웃되고 다시 로그인할 수 없습니다. 관리자는 이 상태를 되돌릴 수 없습니다. 같은 이메일·전화번호로 새 계정으로 다시 가입할 수 있으며, 이전 계정은 상세 화면의 계정 이력에서 확인할 수 있습니다.",
    documented: true,
  },
  pending_verification: {
    /* Declared in the enum (auth/domain/entities.py) and never assigned
       anywhere in src/ or apps/. It is carried here so that a value the server
       one day starts sending renders as Korean instead of as the bare string
       `pending_verification`, but it is not offered as a filter and not listed
       in the legend: an account cannot currently be in it, and documenting a
       state that never occurs only invites an admin to look for it. */
    label: "인증 대기",
    tone: "warning",
    description:
      "가입 인증을 마치지 않은 상태입니다. 현재 서비스에서는 사용되지 않습니다.",
    documented: false,
  },
};

/** The statuses shown to admins as states an account can be in, in the order
 *  an account moves through them. */
export const DOCUMENTED_ACCOUNT_STATUSES = (
  Object.keys(META) as AccountStatus[]
).filter((s) => META[s].documented);

function meta(status: string | null | undefined): AccountStatusMeta | null {
  if (!status) return null;
  return META[status as AccountStatus] ?? null;
}

/**
 * The Korean label for an account status.
 *
 * An unrecognised value falls through to itself rather than to a placeholder,
 * so a status added on the server is visible — wrong-looking, but present —
 * instead of silently reading as something it is not.
 */
export function accountStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return meta(status)?.label ?? status;
}

export function accountStatusTone(status: string | null | undefined): BadgeTone {
  return meta(status)?.tone ?? "neutral";
}

/** The admin-facing explanation, or `null` for a status with none. */
export function accountStatusDescription(
  status: string | null | undefined,
): string | null {
  return meta(status)?.description ?? null;
}

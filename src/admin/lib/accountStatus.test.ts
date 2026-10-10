/**
 * One word per account status, everywhere.
 *
 * The bug these guard: account status used to be rendered by the component
 * kit's shared `statusLabel`, a flat map keyed by bare strings that also serves
 * subscriptions. Both domains have an `active`, so a normal member's row read
 * "이용 중" — the *subscription* word — while the filter beside it offered
 * "활성" and the audit log printed "활성" again. Three words, one state.
 */

import { describe, expect, it } from "vitest";

import { statusLabel, statusTone } from "../components/kit";
import {
  DOCUMENTED_ACCOUNT_STATUSES,
  accountStatusDescription,
  accountStatusLabel,
  accountStatusTone,
} from "./accountStatus";

describe("accountStatusLabel", () => {
  it("names each state the way the whole portal names it", () => {
    expect(accountStatusLabel("active")).toBe("활성");
    expect(accountStatusLabel("suspended")).toBe("정지");
    expect(accountStatusLabel("deactivated")).toBe("탈퇴");
  });

  it("gives distinct states distinct words", () => {
    const labels = DOCUMENTED_ACCOUNT_STATUSES.map(accountStatusLabel);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("does not print the subscription vocabulary for an account", () => {
    // The exact collision: both domains have `active`, and the shared map
    // answers with the subscription word. An account is never "이용 중".
    expect(statusLabel("active")).toBe("이용 중");
    expect(accountStatusLabel("active")).not.toBe(statusLabel("active"));
    expect(accountStatusLabel("suspended")).not.toBe(statusLabel("suspended"));
  });

  it("shows an unknown status rather than hiding it", () => {
    expect(accountStatusLabel("some_new_state")).toBe("some_new_state");
    expect(accountStatusLabel(null)).toBe("—");
    expect(accountStatusLabel(undefined)).toBe("—");
  });
});

describe("the documented set", () => {
  it("is the three states an account can actually be in", () => {
    expect(DOCUMENTED_ACCOUNT_STATUSES).toEqual([
      "active",
      "suspended",
      "deactivated",
    ]);
  });

  it("leaves out the status the server never assigns", () => {
    // `pending_verification` is declared in the enum and written nowhere. It
    // keeps a label so it would render in Korean if that changed, but
    // documenting a state that cannot occur only sends admins looking for it.
    expect(DOCUMENTED_ACCOUNT_STATUSES).not.toContain("pending_verification");
    expect(accountStatusLabel("pending_verification")).toBe("인증 대기");
  });

  it("explains every state it documents", () => {
    for (const status of DOCUMENTED_ACCOUNT_STATUSES) {
      expect(accountStatusDescription(status)?.length).toBeGreaterThan(20);
    }
  });
});

describe("the descriptions match what the backend does", () => {
  it("says suspension ends the sessions that are already running", () => {
    // Suspending revokes every session and refresh token, so the cut-off is
    // immediate. The copy said the opposite while that was true of the code;
    // both changed together, and this is what stops them drifting apart.
    const text = accountStatusDescription("suspended") ?? "";
    expect(text).toContain("즉시 로그아웃");
    expect(text).toContain("다시 로그인할 수 없");
  });

  it("says a withdrawal is the member's own and cannot be undone", () => {
    const text = accountStatusDescription("deactivated") ?? "";
    expect(text).toContain("직접 탈퇴");
    expect(text).toContain("되돌릴 수 없");
  });

  it("does not claim a withdrawal deletes the member's data", () => {
    // `DELETE /auth/account` flips the status and revokes tokens. It deletes
    // nothing, despite its own OpenAPI text saying it does.
    const text = accountStatusDescription("deactivated") ?? "";
    expect(text).not.toMatch(/삭제(됩니다|되며|하고)/);
  });

  it("says the person can sign up again, and where the old account is", () => {
    // Withdrawal releases the email / phone for a new signup; the admin keeps
    // the old account under 계정 이력.
    const text = accountStatusDescription("deactivated") ?? "";
    expect(text).toContain("다시 가입할 수 있으며");
    expect(text).toContain("계정 이력");
  });
});

describe("accountStatusTone", () => {
  it("separates a live account from a blocked one", () => {
    expect(accountStatusTone("active")).toBe("success");
    expect(accountStatusTone("suspended")).toBe("danger");
  });

  it("treats a withdrawal as a settled state, not an alarm", () => {
    // Nothing is wrong with a member who left, and nothing can be done about
    // it — the shared map's "danger" made every such row look actionable.
    expect(accountStatusTone("deactivated")).toBe("neutral");
    expect(statusTone("deactivated")).toBe("neutral");
  });

  it("falls back to neutral for an unknown status", () => {
    expect(accountStatusTone("some_new_state")).toBe("neutral");
    expect(accountStatusTone(null)).toBe("neutral");
  });
});

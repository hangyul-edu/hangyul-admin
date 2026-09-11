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
  it("does not promise that suspension ends a session already running", () => {
    // The status is read in the login paths only; `get_current_user` and the
    // refresh rotation never look at it, so a member already signed in stays
    // signed in. Copy claiming otherwise would have an admin watch a
    // "blocked" member keep working and think the button failed.
    const text = accountStatusDescription("suspended") ?? "";
    expect(text).toContain("새로 로그인할 수 없");
    expect(text).toContain("이미 로그인");
    expect(text).not.toContain("즉시");
  });

  it("says a withdrawal is the member's own and cannot be undone", () => {
    const text = accountStatusDescription("deactivated") ?? "";
    expect(text).toContain("직접 탈퇴");
    expect(text).toContain("되돌릴 수 없");
  });

  it("does not claim a withdrawal deletes the member's data", () => {
    // `DELETE /auth/account` flips the status and revokes tokens. It deletes
    // nothing, despite its own OpenAPI text saying it does — and the email and
    // phone keep their unique slots, which is what blocks re-registration.
    const text = accountStatusDescription("deactivated") ?? "";
    expect(text).not.toMatch(/삭제(됩니다|되며|하고)/);
    expect(text).toContain("그대로 남아");
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

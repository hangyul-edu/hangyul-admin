/**
 * What the activity history says an admin did.
 *
 * The completeness of the table — every audited route having copy — is checked
 * on the backend, which is the only side that knows the routes
 * (`tests/unit/test_audit_action_labels.py`). What is checked here is the
 * behaviour around it: that a label is preferred over the endpoint, that rows
 * carrying a before/after snapshot get the sharper of the two labels, that
 * context is drawn only from recorded fields, and that an unmapped action
 * degrades to its route rather than to a guess.
 */
import { describe, expect, it } from "vitest";
import { cliOperator, describeAuditAction, KNOWN_AUDIT_ACTIONS } from "./auditActions";
import type { AuditLogEntry } from "../api";

/** A promotion made on the server with scripts/promote_super_admin.py. */
function cliPromotion(before: Record<string, unknown>, operator?: Record<string, unknown>): AuditLogEntry {
  return entry({
    actor_type: "cli", actor_id: null, actor_name: null, actor_email: null,
    action: "CLI promote-super-admin", ip_address: null, request_id: null,
    before: { state: before },
    after: {
      state: { role: "admin", admin_role: "super_admin" },
      operator: operator ?? { login: "ec2-user", run_as: "hangyul", host: "ip-10-0-0-12" },
    },
  });
}

describe("a promotion run on the server CLI", () => {
  it("is named, not shown as a bare action", () => {
    const d = describeAuditAction(cliPromotion({ role: "member", admin_role: null }));
    expect(d.label).toBe("최고 관리자 지정 (서버 CLI)");
    expect(d.known).toBe(true);
  });

  it("says what the account was before, from the recorded snapshot", () => {
    expect(describeAuditAction(cliPromotion({ role: "member", admin_role: null })).context).toBe("일반 → 최고 관리자");
    expect(describeAuditAction(cliPromotion({ role: "admin", admin_role: "operator" })).context).toBe("운영자 → 최고 관리자");
  });

  it("names who ran it, as recorded", () => {
    expect(cliOperator(cliPromotion({ role: "member" }))).toBe("ec2-user (hangyul 계정)@ip-10-0-0-12");
    expect(cliOperator(cliPromotion({ role: "member" }, { login: "dev", run_as: "dev", host: "mbp" }))).toBe("dev@mbp");
    // Only CLI rows have an operator.
    expect(cliOperator(entry())).toBeNull();
  });
});

function entry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 1, actor_type: "admin", actor_id: "usr_admin",
    actor_name: "관리자", actor_email: "admin@talkhangyul.co.kr",
    action: "POST /admin/admins",
    object_type: "admin", object_id: "usr_target", user_id: "usr_target",
    request_id: "req_1", ip_address: "127.0.0.1", before: null, after: null,
    occurred_at: "2026-09-10T00:00:00Z",
    ...overrides,
  };
}

describe("the label", () => {
  it("names the operation instead of the endpoint", () => {
    const d = describeAuditAction(entry({ action: "POST /admin/admins" }));
    expect(d.label).toBe("관리자 권한 부여");
    expect(d.label).not.toContain("/admin");
    expect(d.known).toBe(true);
  });

  it("keeps the endpoint available as secondary detail", () => {
    expect(describeAuditAction(entry()).raw).toBe("POST /admin/admins");
  });

  it("falls back to the route for an action it does not know", () => {
    // Rather than inventing a description for something it cannot name.
    const d = describeAuditAction(entry({ action: "POST /admin/something-new" }));
    expect(d.label).toBe("POST /admin/something-new");
    expect(d.known).toBe(false);
  });

  it("never labels anything with filler", () => {
    for (const action of KNOWN_AUDIT_ACTIONS) {
      const { label } = describeAuditAction(entry({ action }));
      expect(label).not.toMatch(/요청 처리|데이터 변경|처리 완료/);
      expect(label.length).toBeGreaterThan(3);
    }
  });
});

describe("audited reads", () => {
  it("labels a proficiency read", () => {
    const d = describeAuditAction(entry({ action: "READ /admin/proficiency/learners/{user_id}" }));
    expect(d.label).toBe("학습자 레벨 판정 상세 조회");
    expect(d.known).toBe(true);
  });

  it("labels a read whose action the server cut at 64 characters", () => {
    // The row stores only the first 64 characters of a long route.
    const stored = "READ /admin/learning-analytics/learners/{user_id}/sessions/{session_id}".slice(0, 64);
    const d = describeAuditAction(entry({ action: stored }));
    expect(d.label).toBe("학습자 세션 추천 근거 조회");
  });
});

describe("payment refunds", () => {
  const refund = (after: unknown) =>
    describeAuditAction(
      entry({ action: "POST /admin/commerce/payments/{payment_id}/refund", after: after as never }),
    );

  it("says whether the refund was full or partial when the row records it", () => {
    expect(refund({ state: { status: "refunded" } }).label).toBe("결제 전액 환불");
    expect(refund({ state: { status: "succeeded" } }).label).toBe("결제 부분 환불");
  });

  it("falls back to the plain label without a snapshot", () => {
    expect(refund(null).label).toBe("결제 환불");
  });
});

describe("labels sharpened by the recorded snapshot", () => {
  const memberEdit = (before: unknown, after: unknown) =>
    describeAuditAction(
      entry({
        action: "PATCH /admin/users/{user_id}",
        before: { state: before } as never,
        after: { state: after } as never,
      }),
    );

  it("calls a suspension a suspension", () => {
    const d = memberEdit(
      { role: "member", status: "active", nickname: "n" },
      { role: "member", status: "suspended", nickname: "n" },
    );
    expect(d.label).toBe("회원 계정 정지");
    expect(d.context).toBe("상태 활성 → 정지");
  });

  it("distinguishes lifting a suspension from imposing one", () => {
    const d = memberEdit(
      { role: "member", status: "suspended", nickname: "n" },
      { role: "member", status: "active", nickname: "n" },
    );
    expect(d.label).toBe("회원 정지 해제");
  });

  it("names a tester grant and a tester removal separately", () => {
    expect(
      memberEdit({ role: "member", status: "active" }, { role: "tester", status: "active" }).label,
    ).toBe("테스터 지정");
    expect(
      memberEdit({ role: "tester", status: "active" }, { role: "member", status: "active" }).label,
    ).toBe("테스터 해제");
  });

  it("separates an approval from a rejection", () => {
    const review = (status: string) =>
      describeAuditAction(
        entry({
          action: "POST /admin/generated-content/{content_id}/review",
          before: { state: { review_status: "pending" } } as never,
          after: { state: { review_status: status } } as never,
        }),
      ).label;
    expect(review("approved")).toBe("AI 생성 콘텐츠 승인");
    expect(review("rejected")).toBe("AI 생성 콘텐츠 반려");
  });

  it("keeps the plain label when the snapshot shows nothing recognisable", () => {
    const d = memberEdit({ role: "member", status: "active" }, { role: "member", status: "active" });
    expect(d.label).toBe("회원 정보 변경");
    expect(d.context).toBeNull();
  });
});

describe("context", () => {
  it("names the promoted account and the tier it was given", () => {
    const d = describeAuditAction(
      entry({
        action: "POST /admin/admins",
        after: {
          request: { email: "new@talkhangyul.co.kr" },
          state: { role: "admin", admin_role: "support_agent" },
        } as never,
      }),
    );
    expect(d.context).toBe("new@talkhangyul.co.kr → 고객지원");
  });

  it("shows a tier change as a before/after pair", () => {
    const d = describeAuditAction(
      entry({
        action: "PATCH /admin/admins/{user_id}",
        before: { state: { admin_role: "viewer" } } as never,
        after: { state: { admin_role: "operator" } } as never,
      }),
    );
    expect(d.context).toBe("뷰어 → 운영자");
  });

  it("names the learning-era tiers too, not their raw keys", () => {
    // analyst / educator / content_publisher were added to the tier ladder
    // after this module kept its own copy of the tier names.
    const d = describeAuditAction(
      entry({
        action: "PATCH /admin/admins/{user_id}",
        before: { state: { admin_role: "analyst" } } as never,
        after: { state: { admin_role: "content_publisher" } } as never,
      }),
    );
    expect(d.context).toBe("분석가 → 콘텐츠 게시 담당");
  });

  it("lists every member field that actually changed", () => {
    const d = describeAuditAction(
      entry({
        action: "PATCH /admin/users/{user_id}",
        before: { state: { role: "member", status: "active", nickname: "before" } } as never,
        after: { state: { role: "tester", status: "active", nickname: "after" } } as never,
      }),
    );
    expect(d.context).toBe("역할 일반 → 테스터 · 닉네임 before → after");
  });

  it("stays empty rather than inventing detail for a row without a snapshot", () => {
    expect(describeAuditAction(entry({ before: null, after: null })).context).toBeNull();
    expect(
      describeAuditAction(entry({ action: "POST /admin/banners", after: null })).context,
    ).toBeNull();
  });

  it("survives a malformed payload without throwing", () => {
    const d = describeAuditAction(
      entry({ action: "PATCH /admin/users/{user_id}", before: "nope" as never, after: 7 as never }),
    );
    expect(d.label).toBe("회원 정보 변경");
    expect(d.context).toBeNull();
  });
});

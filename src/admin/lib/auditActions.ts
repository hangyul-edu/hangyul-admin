import type { AuditLogEntry } from "../api";
import { accountStatusLabel } from "./accountStatus";

/**
 * Turning an audit row into a sentence an operator can read.
 *
 * `action` is stored as `METHOD /route/template` — the *template*, so ids are
 * already collapsed to `{user_id}` and the string is a stable key rather than
 * something to parse. Every mutating `/admin/*` route therefore has exactly one
 * entry below, and `tests/unit/test_audit_action_labels.py` fails the build if
 * a new route is added without one.
 *
 * Two rules kept the wording honest:
 *
 * * Nothing here is inferred. A label refined by `refine()` reads the
 *   before/after snapshot the row actually stores; where the row says nothing,
 *   the plain label stands rather than a guess.
 * * No filler. "요청 처리" or "데이터 변경" would technically fit every row and
 *   tell an operator nothing, so each route names its own operation.
 *
 * The admin portal renders Korean only — it has no i18n layer — so `ko` is what
 * ships today. `en` is carried for the same reason the copy is written at all:
 * it is the wording an English portal would use, and keeping it beside the
 * Korean is the only way the two stay in step.
 */
export type ActionCopy = { ko: string; en: string };

const ACTION_COPY: Record<string, ActionCopy> = {
  // ---- Admin accounts ----------------------------------------------------
  "POST /admin/admins": { ko: "관리자 권한 부여", en: "Granted admin access" },
  "PATCH /admin/admins/{user_id}": { ko: "관리자 등급 변경", en: "Changed an admin's tier" },
  "DELETE /admin/admins/{user_id}": { ko: "관리자 권한 회수", en: "Revoked admin access" },

  // ---- Members -----------------------------------------------------------
  "PATCH /admin/users/{user_id}": { ko: "회원 정보 변경", en: "Updated a member" },
  "POST /admin/users/testers": { ko: "QA 테스터 계정 생성", en: "Created a QA tester account" },

  // ---- Bulk content resets (super-admin only) ----------------------------
  "DELETE /admin/content/sentences": { ko: "전체 문장 삭제", en: "Deleted every sentence" },
  "DELETE /admin/content/topik-questions": {
    ko: "TOPIK 문제 전체 삭제",
    en: "Deleted the whole TOPIK question bank",
  },
  "DELETE /admin/content/reset": {
    ko: "학습 콘텐츠 전체 초기화",
    en: "Reset all learning content",
  },

  // ---- Sentences ---------------------------------------------------------
  "POST /admin/sentences": { ko: "문장 등록", en: "Created a sentence" },
  "POST /admin/sentences/batch": { ko: "문장 일괄 등록", en: "Bulk-created sentences" },
  "PATCH /admin/sentences/{sentence_id}": { ko: "문장 수정", en: "Updated a sentence" },
  "DELETE /admin/sentences/{sentence_id}": { ko: "문장 삭제", en: "Deleted a sentence" },

  // ---- Questions ---------------------------------------------------------
  "POST /admin/quizzes": { ko: "문제 등록", en: "Created a question" },
  "POST /admin/quizzes/batch": { ko: "문제 일괄 등록", en: "Bulk-created questions" },
  "PUT /admin/quizzes/{quiz_id}": { ko: "문제 전체 수정", en: "Replaced a question" },
  "DELETE /admin/quizzes/{quiz_id}": { ko: "문제 삭제", en: "Deleted a question" },

  // ---- Courses & lectures ------------------------------------------------
  "POST /admin/courses": { ko: "코스 생성", en: "Created a course" },
  "PATCH /admin/courses/{course_id}": { ko: "코스 수정", en: "Updated a course" },
  "DELETE /admin/courses/{course_id}": { ko: "코스 삭제", en: "Deleted a course" },
  "POST /admin/lectures": { ko: "강의 생성", en: "Created a lecture" },
  "PATCH /admin/lectures/{lecture_id}": { ko: "강의 수정", en: "Updated a lecture" },
  "DELETE /admin/lectures/{lecture_id}": { ko: "강의 삭제", en: "Deleted a lecture" },
  "POST /admin/lectures/{lecture_id}/videos": {
    ko: "강의 영상 업로드",
    en: "Uploaded a lecture video",
  },
  "PUT /admin/lectures/{lecture_id}/video": {
    ko: "강의 영상 교체",
    en: "Replaced a lecture video",
  },
  "POST /admin/lectures/{lecture_id}/video/upload-session": {
    ko: "강의 영상 업로드 시작",
    en: "Started a lecture video upload",
  },
  "POST /admin/lectures/videos/{video_id}/refresh": {
    ko: "영상 처리 상태 갱신",
    en: "Refreshed a video's processing status",
  },
  "DELETE /admin/lectures/videos/{video_id}": {
    ko: "강의 영상 삭제",
    en: "Deleted a lecture video",
  },

  // ---- AI-generated content ----------------------------------------------
  "POST /admin/generated-content/{content_id}/review": {
    ko: "AI 생성 콘텐츠 검수",
    en: "Reviewed an AI-generated item",
  },
  "DELETE /admin/generated-content/{content_id}": {
    ko: "AI 생성 콘텐츠 삭제",
    en: "Deleted an AI-generated item",
  },

  // ---- Banners -----------------------------------------------------------
  "POST /admin/banners": { ko: "배너 등록", en: "Created a banner" },
  "PATCH /admin/banners/{banner_id}": { ko: "배너 수정", en: "Updated a banner" },
  "DELETE /admin/banners/{banner_id}": { ko: "배너 삭제", en: "Deleted a banner" },
  "POST /admin/banners/reorder": { ko: "배너 순서 변경", en: "Reordered banners" },

  // ---- FAQs --------------------------------------------------------------
  "POST /admin/support/faqs": { ko: "FAQ 등록", en: "Created a FAQ" },
  "PATCH /admin/support/faqs/{faq_id}": { ko: "FAQ 수정", en: "Updated a FAQ" },
  "DELETE /admin/support/faqs/{faq_id}": { ko: "FAQ 삭제", en: "Deleted a FAQ" },
  "POST /admin/support/faqs/{faq_id}/publish": { ko: "FAQ 게시", en: "Published a FAQ" },
  "POST /admin/support/faqs/{faq_id}/unpublish": {
    ko: "FAQ 게시 중단",
    en: "Unpublished a FAQ",
  },
  "DELETE /admin/support/faqs/{faq_id}/translations/{locale}": {
    ko: "FAQ 번역 삭제",
    en: "Deleted one language of a FAQ",
  },

  // ---- Notices -----------------------------------------------------------
  "POST /admin/support/notices": { ko: "공지 등록", en: "Created a notice" },
  "PATCH /admin/support/notices/{notice_id}": { ko: "공지 수정", en: "Updated a notice" },
  "DELETE /admin/support/notices/{notice_id}": { ko: "공지 삭제", en: "Deleted a notice" },
  "POST /admin/support/notices/{notice_id}/publish": { ko: "공지 게시", en: "Published a notice" },
  "POST /admin/support/notices/{notice_id}/unpublish": {
    ko: "공지 게시 중단",
    en: "Unpublished a notice",
  },
  "DELETE /admin/support/notices/{notice_id}/translations/{locale}": {
    ko: "공지 번역 삭제",
    en: "Deleted one language of a notice",
  },

  // ---- Coupons -----------------------------------------------------------
  "POST /admin/coupons/batches": { ko: "쿠폰 배치 생성", en: "Generated a coupon batch" },
  "POST /admin/coupons/batches/{batch_id}/revoke": {
    ko: "쿠폰 배치 회수",
    en: "Revoked a coupon batch",
  },
  "POST /admin/coupons/{coupon_id}/revoke": { ko: "쿠폰 회수", en: "Revoked a coupon" },

  // ---- Plans -------------------------------------------------------------
  "POST /admin/subscriptions/plans": { ko: "요금제 생성", en: "Created a plan" },
  "PATCH /admin/subscriptions/plans/{plan_id}": { ko: "요금제 수정", en: "Updated a plan" },
  "POST /admin/subscriptions/plans/{plan_id}/archive": {
    ko: "요금제 보관 처리",
    en: "Archived a plan",
  },

  // ---- Notifications -----------------------------------------------------
  "POST /admin/notifications/announcement": {
    ko: "서비스 공지 발송",
    en: "Broadcast a service announcement",
  },
  "POST /admin/notifications/marketing-notice": {
    ko: "마케팅 공지 발송",
    en: "Broadcast a marketing notice",
  },
  "POST /admin/notifications/marketing-push": {
    ko: "마케팅 푸시 발송",
    en: "Sent a marketing push",
  },
  "PUT /admin/notifications/daily-reminder": {
    ko: "일일 학습 알림 시간 설정",
    en: "Set the daily reminder time",
  },

  // ---- Media -------------------------------------------------------------
  "POST /admin/media": { ko: "이미지 업로드", en: "Uploaded an image" },
  // Starlette keeps the `:path` converter in the template, so the audit row
  // stores it verbatim — this key must match that, not the tidier form.
  "DELETE /admin/media/{key:path}": { ko: "이미지 삭제", en: "Deleted an image" },

  // ---- Versioned content catalogue ---------------------------------------
  "POST /admin/content-catalog/versions/{version_id}/submit": {
    ko: "콘텐츠 버전 검수 요청",
    en: "Submitted a content version for review",
  },
  "POST /admin/content-catalog/versions/{version_id}/blind-solve": {
    ko: "블라인드 풀이 제출",
    en: "Submitted a blind solve",
  },
  "POST /admin/content-catalog/versions/{version_id}/reviews": {
    ko: "교육 검수 결과 기록",
    en: "Recorded an educational review",
  },
  "POST /admin/content-catalog/versions/{version_id}/publish": {
    ko: "콘텐츠 버전 게시",
    en: "Published a content version",
  },
  "POST /admin/content-catalog/versions/{version_id}/retire": {
    ko: "콘텐츠 버전 회수",
    en: "Retired a content version",
  },
  "POST /admin/content-catalog/sync": {
    ko: "콘텐츠 새 버전 초안 생성",
    en: "Snapshotted a catalogue row into a draft version",
  },
  "POST /admin/content-catalog/backfill": {
    ko: "기존 콘텐츠 버전 일괄 생성",
    en: "Ran the legacy content-version backfill",
  },
  "PATCH /admin/content-catalog/issues/{issue_id}": {
    ko: "콘텐츠 문제 신고 처리",
    en: "Triaged a content issue",
  },
  "PUT /admin/ai/features/{feature}": {
    ko: "AI 기능 사용 여부·예산 변경",
    en: "Changed an AI feature's switch or budget",
  },
  "POST /admin/ai/tutor/turns/{turn_id}/reviews": {
    ko: "튜터 응답 품질 검수",
    en: "Reviewed a tutor reply",
  },
};

/** Every action string this module knows — the completeness test reads it. */
export const KNOWN_AUDIT_ACTIONS: readonly string[] = Object.keys(ACTION_COPY);

/**
 * Audited reads of restricted data. The server writes these rows explicitly
 * (`record_sensitive_read`) with the action `READ /route/template`, so they are
 * not derivable from the mutating routes and live apart from ACTION_COPY.
 */
const SENSITIVE_READ_COPY: Record<string, ActionCopy> = {
  "READ /admin/content-catalog/versions/{version_id}": {
    ko: "콘텐츠 버전 정답 포함 조회",
    en: "Viewed a content version including its answer key",
  },
  "READ /admin/learning-analytics/learners": { ko: "학습자 목록 조회", en: "Viewed the learner directory" },
  "READ /admin/ai/tutor/turns": {
    ko: "튜터 대화 원문 조회",
    en: "Viewed tutor transcripts",
  },
  "READ /admin/learning-analytics/learners/{user_id}": {
    ko: "학습자 상세 조회",
    en: "Viewed a learner's record",
  },
  "READ /admin/learning-analytics/learners/{user_id}/growth": {
    ko: "학습자 성장 분석 조회",
    en: "Viewed a learner's growth",
  },
  "READ /admin/learning-analytics/learners/{user_id}/evidence": {
    ko: "학습자 학습 증거 조회",
    en: "Viewed a learner's evidence",
  },
  "READ /admin/learning-analytics/learners/{user_id}/timeline": {
    ko: "학습자 학습 타임라인 조회",
    en: "Viewed a learner's timeline",
  },
  "READ /admin/learning-analytics/learners/{user_id}/sessions/{session_id}": {
    ko: "학습자 세션 추천 근거 조회",
    en: "Viewed why a learner's session contained what it did",
  },
};

const ROLE_KO: Record<string, string> = {
  member: "일반",
  premium: "프리미엄",
  tester: "테스터",
  admin: "관리자",
};
const TIER_KO: Record<string, string> = {
  super_admin: "최고 관리자",
  operator: "운영자",
  content_manager: "콘텐츠 관리자",
  support_agent: "고객지원",
  viewer: "뷰어",
};

function state(side: Record<string, unknown> | null): Record<string, unknown> {
  const nested = side?.["state"];
  return nested && typeof nested === "object" ? (nested as Record<string, unknown>) : {};
}

function request(entry: AuditLogEntry): Record<string, unknown> {
  const body = entry.after?.["request"];
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}

function str(bag: Record<string, unknown>, key: string): string | null {
  const v = bag[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * A sharper label for rows whose snapshot says which way the change went.
 *
 * "회원 정보 변경" is true of every member edit; "회원 계정 정지" is what
 * actually happened. Only fields present in the row are consulted — an edit
 * that changed nothing recognisable keeps the plain label.
 */
function refine(entry: AuditLogEntry): ActionCopy | null {
  const before = state(entry.before);
  const after = state(entry.after);

  if (entry.action === "PATCH /admin/users/{user_id}") {
    const wasStatus = str(before, "status");
    const nowStatus = str(after, "status");
    if (wasStatus !== nowStatus && nowStatus === "suspended")
      return { ko: "회원 계정 정지", en: "Suspended a member's account" };
    if (wasStatus !== nowStatus && nowStatus === "active")
      return { ko: "회원 정지 해제", en: "Lifted a member's suspension" };

    const wasRole = str(before, "role");
    const nowRole = str(after, "role");
    if (wasRole !== nowRole && nowRole === "tester")
      return { ko: "테스터 지정", en: "Made a member a tester" };
    if (wasRole !== nowRole && wasRole === "tester")
      return { ko: "테스터 해제", en: "Removed tester access" };

    if (str(before, "nickname") !== str(after, "nickname"))
      return { ko: "회원 닉네임 변경", en: "Changed a member's nickname" };
    return null;
  }

  if (entry.action === "POST /admin/generated-content/{content_id}/review") {
    const decision = str(after, "review_status");
    if (decision === "approved")
      return { ko: "AI 생성 콘텐츠 승인", en: "Approved an AI-generated item" };
    if (decision === "rejected")
      return { ko: "AI 생성 콘텐츠 반려", en: "Rejected an AI-generated item" };
  }

  return null;
}

/**
 * One short line of "on what", built only from fields the row stores.
 *
 * The 대상 column already carries object type + id for every row, so this adds
 * something only where the row holds a name a person recognises, or the shape
 * of the change itself. Returns null rather than padding the column.
 */
function context(entry: AuditLogEntry): string | null {
  const before = state(entry.before);
  const after = state(entry.after);

  if (entry.action === "POST /admin/admins") {
    const email = str(request(entry), "email");
    const tier = str(after, "admin_role");
    const named = tier ? TIER_KO[tier] ?? tier : null;
    if (email && named) return `${email} → ${named}`;
    return email ?? named;
  }

  if (entry.action === "PATCH /admin/admins/{user_id}") {
    const was = str(before, "admin_role");
    const now = str(after, "admin_role");
    if (was && now) return `${TIER_KO[was] ?? was} → ${TIER_KO[now] ?? now}`;
    return now ? TIER_KO[now] ?? now : null;
  }

  if (entry.action === "PATCH /admin/users/{user_id}") {
    const parts: string[] = [];
    /* `translate` renders each side of the change in the portal's own words.
       Account status goes through the shared vocabulary rather than a local
       copy, so a diff reads "상태 활성 → 정지" with the same two words the
       badges on the user screens use. */
    const pair = (
      key: string,
      label: string,
      translate: (value: string) => string = (v) => v,
    ): void => {
      const was = str(before, key);
      const now = str(after, key);
      if (was !== null && now !== null && was !== now)
        parts.push(`${label} ${translate(was)} → ${translate(now)}`);
    };
    pair("role", "역할", (v) => ROLE_KO[v] ?? v);
    pair("status", "상태", accountStatusLabel);
    pair("nickname", "닉네임");
    return parts.length ? parts.join(" · ") : null;
  }

  return null;
}

export type DescribedAction = {
  /** What the admin did, in the portal's language. */
  label: string;
  /** A short "on what", or null when the row records nothing worth adding. */
  context: string | null;
  /** `METHOD /route/template`, kept for debugging and for unmapped rows. */
  raw: string;
  /** False when the action has no entry here — the UI then leans on `raw`. */
  known: boolean;
};

export function describeAuditAction(entry: AuditLogEntry): DescribedAction {
  const copy =
    refine(entry) ?? ACTION_COPY[entry.action] ?? SENSITIVE_READ_COPY[entry.action] ?? null;
  return {
    // An unmapped action shows its route rather than a label that would be a
    // guess; the completeness test exists so this stays hypothetical.
    label: copy?.ko ?? entry.action,
    context: context(entry),
    raw: entry.action,
    known: copy !== null,
  };
}

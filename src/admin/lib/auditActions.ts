import type { AuditLogEntry } from "../api";
import { accountStatusLabel } from "./accountStatus";
import { ADMIN_TIER_LABEL, ROLE_LABELS } from "./adminTiers";

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
  "POST /admin/sentences/batch/check": { ko: "문장 일괄 추가 파일 확인 (저장 안 함)", en: "Checked a sentence upload (nothing saved)" },
  "PATCH /admin/sentences/{sentence_id}": { ko: "문장 수정", en: "Updated a sentence" },
  "DELETE /admin/sentences/{sentence_id}": { ko: "문장 삭제", en: "Deleted a sentence" },

  // ---- Questions ---------------------------------------------------------
  "POST /admin/quizzes": { ko: "문제 등록", en: "Created a question" },
  "POST /admin/quizzes/batch": { ko: "문제 일괄 등록", en: "Bulk-created questions" },
  "POST /admin/quizzes/batch/check": { ko: "문제 일괄 추가 파일 확인 (저장 안 함)", en: "Checked a question upload (nothing saved)" },
  "PUT /admin/quizzes/{quiz_id}": { ko: "문제 전체 수정", en: "Replaced a question" },
  "DELETE /admin/quizzes/{quiz_id}": { ko: "문제 삭제", en: "Deleted a question" },
  "PUT /admin/quizzes/{quiz_id}/audio": { ko: "듣기 음원 업로드", en: "Uploaded listening audio" },

  // ---- Courses & lectures ------------------------------------------------
  "POST /admin/courses": { ko: "코스 생성", en: "Created a course" },
  "POST /admin/courses/reorder": { ko: "코스 순서 변경", en: "Reordered courses" },
  "POST /admin/courses/{course_id}/series/reorder": { ko: "시리즈 순서 변경", en: "Reordered series" },
  "POST /admin/series/{series_id}/lectures/reorder": { ko: "강의 순서 변경", en: "Reordered lectures" },
  "PATCH /admin/courses/{course_id}": { ko: "코스 수정", en: "Updated a course" },
  "DELETE /admin/courses/{course_id}": { ko: "코스 삭제", en: "Deleted a course" },
  "POST /admin/courses/{course_id}/series": { ko: "시리즈 생성", en: "Created a series" },
  "PATCH /admin/series/{series_id}": { ko: "시리즈 수정", en: "Updated a series" },
  "DELETE /admin/series/{series_id}": { ko: "시리즈 삭제", en: "Deleted a series" },
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
  "PUT /admin/lectures/videos/{video_id}/file": {
    ko: "강의 영상 파일 업로드(로컬)",
    en: "Uploaded a lecture video file (offline provider)",
  },
  "POST /admin/lectures/{lecture_id}/checkpoints": {
    ko: "체크포인트 추가",
    en: "Added a lecture checkpoint",
  },
  "PUT /admin/lectures/{lecture_id}/checkpoints/{checkpoint_id}": {
    ko: "체크포인트 수정",
    en: "Updated a lecture checkpoint",
  },
  "DELETE /admin/lectures/{lecture_id}/checkpoints/{checkpoint_id}": {
    ko: "체크포인트 삭제",
    en: "Deleted a lecture checkpoint",
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

  // ---- Banners (served at /admin/home-cards; see RETIRED_ROUTE_COPY) -------
  "POST /admin/home-cards": { ko: "배너 등록", en: "Created a banner" },
  "PATCH /admin/home-cards/{banner_id}": { ko: "배너 수정", en: "Updated a banner" },
  "DELETE /admin/home-cards/{banner_id}": { ko: "배너 삭제", en: "Deleted a banner" },
  "POST /admin/home-cards/reorder": { ko: "배너 순서 변경", en: "Reordered banners" },

  // ---- FAQs --------------------------------------------------------------
  "POST /admin/support/faqs": { ko: "FAQ 등록", en: "Created a FAQ" },
  "POST /admin/support/faqs/reorder": { ko: "FAQ 순서 변경", en: "Reordered FAQs" },
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
  "POST /admin/support/notices/reorder": { ko: "공지 순서 변경", en: "Reordered notices" },
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

  // ---- Payments ----------------------------------------------------------
  "POST /admin/commerce/payments/{payment_id}/refund": {
    ko: "결제 환불",
    en: "Refunded a payment",
  },
  "POST /admin/commerce/invoices/{invoice_id}/retry": {
    ko: "청구서 결제 재시도",
    en: "Retried an unpaid invoice",
  },

  // ---- Plans -------------------------------------------------------------
  "PATCH /admin/subscriptions/plans/{plan_id}": { ko: "요금제 수정", en: "Updated a plan" },

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
  "POST /admin/content-catalog/package-import/plan": {
    ko: "콘텐츠 업데이트 미리보기 시작",
    en: "Started a content update preview (dry run)",
  },
  "POST /admin/content-catalog/package-import/import": {
    ko: "콘텐츠 업데이트 반영",
    en: "Applied a content update",
  },
  "POST /admin/content-catalog/generation-jobs": {
    ko: "콘텐츠 생성 작업 등록",
    en: "Queued a content-generation job",
  },
  "POST /admin/content-catalog/generation-jobs/{job_id}/cancel": {
    ko: "콘텐츠 생성 작업 취소",
    en: "Cancelled a content-generation job",
  },
  "POST /admin/content-catalog/generation-jobs/{job_id}/retry": {
    ko: "콘텐츠 생성 작업 재시도",
    en: "Retried a content-generation job",
  },
  "PATCH /admin/content-catalog/issues/{issue_id}": {
    ko: "콘텐츠 문제 신고 처리",
    en: "Triaged a content issue",
  },
  "PUT /admin/ai/features/{feature}": {
    ko: "AI 기능 사용 여부·예산 변경",
    en: "Changed an AI feature's switch or budget",
  },
  "PUT /admin/system-settings/integrations/{integration_id}": {
    ko: "외부 연동·서버 설정 변경",
    en: "Changed an integration or server setting",
  },
  "POST /admin/system-settings/integrations/{integration_id}/test": {
    ko: "외부 연동 연결 테스트",
    en: "Tested an integration's connection",
  },
  "POST /admin/ai/tutor/turns/{turn_id}/reviews": {
    ko: "튜터 응답 품질 검수",
    en: "Reviewed a tutor reply",
  },
  "POST /admin/learning-analytics/simulate": {
    ko: "학습자 세션 구성 시뮬레이션",
    en: "Simulated a learner's session assembly",
  },
  "POST /admin/learning-analytics/exports": {
    ko: "학습 통계 CSV 내보내기 생성",
    en: "Created a learning-analytics CSV export",
  },
  "POST /admin/learning-analytics/erasures": {
    ko: "학습자 학습 데이터 삭제",
    en: "Erased a learner's learning data",
  },
  "POST /admin/proficiency/learners/{user_id}/corrections": {
    ko: "학습자 실력 레벨 관리자 정정",
    en: "Corrected a learner's proficiency level",
  },
  "POST /admin/proficiency/learners/{user_id}/reprocess": {
    ko: "학습자 실력 판정 재처리",
    en: "Reprocessed a learner's proficiency evidence",
  },
  "POST /admin/proficiency/observations/{observation_id}/invalidate": {
    ko: "실력 평가 증거 무효 처리",
    en: "Invalidated a piece of proficiency evidence",
  },
  "POST /admin/proficiency/scoring-queue/{attempt_id}/retry": {
    ko: "말하기 과제 채점 다시 시도",
    en: "Put a speaking task back in the scoring queue",
  },
  "POST /admin/proficiency/ratings": {
    ko: "평가 응답 기준 채점 기록",
    en: "Recorded a reference rating for an assessment response",
  },
};

/**
 * The `object_type` values audit rows are actually written with, for the
 * activity page's 대상 filter (the API matches it exactly).
 *
 * A row gets its type one of two ways: a handler names it through
 * `enrich_audit` (`user`, `lecture`, `plan`, …), or `admin_audit` falls back to
 * the first path segment after `/admin` (`users`, `lectures`, `subscriptions`,
 * …). Some resources therefore appear under both — a lecture created is
 * `lecture`, a lecture edited is `lectures` — and both are listed. System
 * rows (billing) and audited reads (`record_sensitive_read`) add the rest.
 */
export const AUDIT_OBJECT_TYPES: readonly [value: string, label: string][] = [
  ["user", "회원 정보 변경"],
  ["users", "회원 (테스터 생성 등)"],
  ["admin", "관리자 권한"],
  ["courses", "코스"],
  ["series", "시리즈"],
  ["lecture", "강의 생성·삭제"],
  ["lectures", "강의·영상"],
  ["lecture_checkpoint", "강의 체크포인트"],
  ["sentences", "문장"],
  ["sentence_batch", "문장 일괄 추가"],
  ["quizzes", "문제"],
  ["quiz_batch", "문제 일괄 추가"],
  ["content_cleanup", "콘텐츠 일괄 정리"],
  ["catalog_import_job", "콘텐츠 업데이트"],
  ["generated_content", "AI 생성 검수"],
  ["generated-content", "AI 생성 삭제"],
  ["content_version", "콘텐츠 버전 검수·게시"],
  ["content-catalog", "콘텐츠 카탈로그"],
  ["media", "이미지"],
  ["banners", "배너"],
  ["support", "공지·FAQ"],
  ["notifications", "알림"],
  ["plan", "요금제 생성·수정"],
  ["subscriptions", "요금제 보관"],
  ["coupons", "쿠폰"],
  ["invoice", "청구서 (시스템)"],
  ["payment", "결제"],
  ["integration_settings", "연동 설정"],
  ["ai_feature", "AI 기능 설정"],
  ["ai", "AI 튜터 검수"],
  ["learner", "학습자 기록 조회"],
  ["tutor_turns", "튜터 대화 조회"],
  ["analytics_export", "학습 통계 내보내기"],
  ["learning-analytics", "학습 인사이트"],
  ["learner_proficiency", "학습자 실력 판정"],
  ["proficiency_rating", "평가 기준 채점"],
  ["proficiency_task", "말하기 과제 채점"],
];

const OBJECT_TYPE_LABEL = new Map(AUDIT_OBJECT_TYPES);

/**
 * An audit row's target as the 대상 filter names it (an unlisted type as
 * written). Rows name what KIND of thing changed this way; which one is told
 * by the action's context, never by the object's internal id.
 */
export function objectTypeLabel(type: string | null | undefined): string {
  return type ? OBJECT_TYPE_LABEL.get(type) ?? type : "—";
}

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
  "READ /admin/learning-analytics/simulate": {
    ko: "학습자 상태 조회(시뮬레이션)",
    en: "Viewed a learner's state for a simulation",
  },
  "READ /admin/learning-analytics/exports/{export_id}": {
    ko: "학습 통계 CSV 다운로드",
    en: "Downloaded a learning-analytics export",
  },
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
  "READ /admin/proficiency/learners": { ko: "레벨 판정 목록 조회", en: "Viewed the proficiency directory" },
  "READ /admin/proficiency/scoring-queue": { ko: "말하기 채점 대기열 조회", en: "Viewed the speaking-task scoring queue" },
  "READ /admin/proficiency/learners/{user_id}": {
    ko: "학습자 레벨 판정 상세 조회",
    en: "Viewed a learner's proficiency",
  },
  "READ /admin/proficiency/learners/{user_id}/evidence": {
    ko: "학습자 레벨 판정 근거 조회",
    en: "Viewed a learner's proficiency evidence",
  },
  "READ /admin/proficiency/learners/{user_id}/growth": {
    ko: "학습자 레벨 성장 조회",
    en: "Viewed a learner's proficiency growth",
  },
};

/** The server stores at most this many characters of an action. */
const STORED_ACTION_LENGTH = 64;

/** Read copy keyed the way the rows are stored: a long route arrives cut short. */
const SENSITIVE_READ_BY_STORED_ACTION: Record<string, ActionCopy> = Object.fromEntries(
  Object.entries(SENSITIVE_READ_COPY).map(([action, copy]) => [action.slice(0, STORED_ACTION_LENGTH), copy]),
);

/**
 * Changes made on the server's command line rather than through the portal.
 * They have no route, so the server stores them as `CLI <command>` with
 * `actor_type: "cli"` (hangyul-api `src/modules/admin/application/super_admins.py`);
 * hangyul-api's `tests/unit/test_audit_action_labels.py` checks each has a label here.
 */
const CLI_ACTION_COPY: Record<string, ActionCopy> = {
  "CLI promote-super-admin": { ko: "최고 관리자 지정 (서버 CLI)", en: "Made a super admin (server CLI)" },
};

/**
 * Routes that have moved: rows written before the move keep the old route
 * string, so they are labelled here. Kept out of ACTION_COPY, which lists only
 * live routes (hangyul-api's completeness test reads it).
 */
const RETIRED_ROUTE_COPY: Record<string, ActionCopy> = {
  // Banners moved to /admin/home-cards (ad blockers block "banner" URLs).
  "POST /admin/banners": { ko: "배너 등록", en: "Created a banner" },
  "PATCH /admin/banners/{banner_id}": { ko: "배너 수정", en: "Updated a banner" },
  "DELETE /admin/banners/{banner_id}": { ko: "배너 삭제", en: "Deleted a banner" },
  "POST /admin/banners/reorder": { ko: "배너 순서 변경", en: "Reordered banners" },
};

/**
 * Who ran a CLI row, as `login@host` (`login (as account)@host` under sudo),
 * from the operator the server recorded. Null for every other row.
 */
export function cliOperator(entry: AuditLogEntry): string | null {
  if (entry.actor_type !== "cli") return null;
  const raw = entry.after?.["operator"];
  if (!raw || typeof raw !== "object") return null;
  const op = raw as Record<string, unknown>;
  const login = str(op, "login");
  const runAs = str(op, "run_as");
  const host = str(op, "host");
  if (!login) return null;
  const who = runAs && runAs !== login ? `${login} (${runAs} 계정)` : login;
  return host ? `${who}@${host}` : who;
}

// The portal's one vocabulary for roles and tiers, so a tier added there is
// named here too.
const ROLE_KO = ROLE_LABELS;
const TIER_KO = ADMIN_TIER_LABEL;

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

  if (entry.action === "POST /admin/commerce/payments/{payment_id}/refund") {
    const status = str(after, "status");
    if (status === "refunded") return { ko: "결제 전액 환불", en: "Refunded a payment in full" };
    if (status === "succeeded") return { ko: "결제 부분 환불", en: "Partially refunded a payment" };
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

  if (entry.action === "CLI promote-super-admin") {
    // Was: a tier when it was already an admin, else its role (회원, 테스터).
    const wasTier = str(before, "admin_role");
    const wasRole = str(before, "role");
    const was = wasTier ? TIER_KO[wasTier] ?? wasTier : wasRole ? ROLE_KO[wasRole] ?? wasRole : null;
    const now = TIER_KO["super_admin"] ?? "super_admin";
    return was ? `${was} → ${now}` : now;
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
    refine(entry) ??
    ACTION_COPY[entry.action] ??
    SENSITIVE_READ_BY_STORED_ACTION[entry.action] ??
    CLI_ACTION_COPY[entry.action] ??
    RETIRED_ROUTE_COPY[entry.action] ??
    null;
  return {
    // An unmapped action shows its route rather than a label that would be a
    // guess; the completeness test exists so this stays hypothetical.
    label: copy?.ko ?? entry.action,
    context: context(entry),
    raw: entry.action,
    known: copy !== null,
  };
}

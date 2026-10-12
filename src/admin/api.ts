// Typed client for every /admin/* backend endpoint the portal uses.
// All requests go through src/lib/http.ts (Bearer auth + auto refresh).
import { http } from "../lib/http";
import type { ImageCrop } from "../lib/imageCrop";

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface AdminMe {
  user_id: string;
  email: string;
  name: string;
  nickname: string | null;
  admin_role: string;
  scopes: string[];
}

// ---- Metrics ---------------------------------------------------------------

export interface OperationalAlert {
  severity: "info" | "warning" | "critical";
  code: string;
  message: string;
  count: number;
}

/** One row of the dashboard's recent admin activity — an audit entry, trimmed
 *  to what that list needs plus the snapshots its action label reads. */
export interface RecentAdminActionRow {
  id: number;
  actor_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
  object_type: string;
  object_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  occurred_at: string;
}

export interface MetricsOverview {
  generated_at: string;
  users: {
    total: number;
    active: number;
    suspended: number;
    deactivated: number;
    new_today: number;
    new_7d: number;
    new_30d: number;
  };
  subscriptions: {
    active: number;
    trialing: number;
    in_grace: number;
    suspended: number;
    canceling: number;
  };
  revenue: {
    currency: string;
    today_cents: number;
    /** `YYYY-MM` the figure below covers — stated by the server, not derived here. */
    this_month: string;
    /** This CALENDAR month, 1st → now. Not a rolling 30-day window. */
    this_month_cents: number;
    refunded_30d_cents: number;
    failed_payments_24h: number;
  };
  learning: {
    sessions_today: number;
    active_learners_today: number;
    minutes_today: number;
    attendance_today: number;
  };
  content: {
    courses: number;
    lectures: number;
    lecture_videos_ready: number;
    sentences: number;
    quizzes: number;
    exam_sets: number;
    published_notices: number;
    published_faqs: number;
    active_banners: number;
  };
  ai: {
    llm_calls_30d: number;
    llm_cost_month_usd_cents: number;
    generated_pending_review: number;
    generated_total: number;
  };
  alerts: OperationalAlert[];
  recent_signups: {
    user_id: string;
    name: string;
    email: string;
    nickname: string | null;
    created_at: string;
  }[];
  recent_payments: {
    payment_id: string;
    user_id: string | null;
    user_name: string | null;
    user_email: string | null;
    plan_name: string | null;
    amount_cents: number;
    currency: string;
    status: string;
    paid_at: string | null;
    created_at: string;
  }[];
  recent_admin_actions: RecentAdminActionRow[];
}

export interface TimeseriesResponse {
  metric: string;
  days: number;
  points: { date: string; value: number }[];
}

/**
 * Revenue by calendar month, oldest first, ending with the month in progress.
 * The server derives every bucket — and the overview's `this_month_cents` —
 * from one query, so the last point always equals that KPI.
 */
export interface MonthlyRevenueResponse {
  currency: string;
  months: number;
  /** `YYYY-MM` of the in-progress month: its bar covers the 1st → today only. */
  current_month: string;
  points: { month: string; value_cents: number }[];
}

// ---- Users -----------------------------------------------------------------

export interface AdminUserSummary {
  user_id: string;
  email: string;
  name: string;
  nickname: string | null;
  phone_masked: string | null;
  role: string;
  status: string;
  subscription_status: string | null;
  plan_id: string | null;
  plan_name: string | null;
  created_at: string;
  deactivated_at: string | null;
  /** How many times this person signed up again after withdrawing. */
  reregistration_count: number;
}

/** One of a person's accounts; a withdrawn one with the identifiers it had. */
export interface AdminPersonAccount {
  user_id: string;
  status: string;
  is_this_account: boolean;
  created_at: string;
  deactivated_at: string | null;
  email: string;
  nickname: string | null;
  phone_masked: string | null;
  social_logins: string[];
  study_minutes: number;
  points_total: number;
}

/** What `…/batch/check` found for one uploaded item. */
export interface BulkCheckRow {
  index: number;
  ok: boolean;
  summary: string;
  errors: string[];
  warnings: string[];
  duplicate: "in_file" | "existing" | null;
  duplicate_of: number | null;
}

export interface BulkCheckResult {
  total: number;
  ready: number;
  invalid: number;
  duplicates: number;
  rows: BulkCheckRow[];
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface AdminUserDetail {
  user_id: string;
  email: string;
  name: string;
  nickname: string | null;
  phone_masked: string | null;
  phone_verified: boolean;
  nationality: string | null;
  role: string;
  admin_role: string | null;
  status: string;
  age_consent: boolean;
  marketing_opt_in: boolean;
  social_providers: string[];
  has_password: boolean;
  created_at: string;
  deactivated_at: string | null;
  onboarding: Record<string, unknown> | null;
  subscription: {
    subscription_id: string;
    plan_id: string | null;
    plan_name: string | null;
    status: string;
    provider: string | null;
    trial_expires_at: string | null;
    current_period_end: string | null;
    next_billing_at: string | null;
    cancel_at_period_end: boolean;
    canceled_at: string | null;
    created_at: string;
  } | null;
  /** The person's one free trial (any of their accounts) and whether
   *  new-member prices apply to them. */
  free_trial: {
    available: boolean;
    started_at: string | null;
    ended_at: string | null;
    new_member: boolean;
  };
  recent_invoices: {
    invoice_id: string;
    plan_name: string;
    total_cents: number;
    currency: string;
    status: string;
    paid_at: string | null;
    created_at: string;
  }[];
  learning: {
    current_streak: number;
    best_streak: number;
    last_active_date: string | null;
    total_minutes: number;
    sessions_30d: number;
    tracks: {
      track_id: string;
      current_level: number;
      level_progress: number;
      cumulative_seconds: number;
    }[];
    /** What the member chose. */
    daily_sentence_goal: number | null;
    daily_question_goal: number | null;
    /** What their tier allows — capped to 5 for regular members. */
    effective_daily_sentence_goal: number | null;
    effective_daily_question_goal: number | null;
  };
  gamification: {
    /** Earned all time, across every season. Only ever grows. */
    points_total: number;
    season_points: number;
    league_tier: string | null;
    league_season_id: string | null;
    attendance_days_30d: number;
  };
  coupons: {
    grant_id: string;
    coupon_id: string;
    batch_id: string;
    batch_name: string | null;
    duration_days: number;
    status: string;
    activated_at: string | null;
    expires_at: string | null;
  }[];
  devices: {
    platform: string;
    app_version: string | null;
    locale: string | null;
    is_active: boolean;
    last_seen_at: string | null;
  }[];
  friends_count: number;
  notifications_unread: number;
  /** The person this account belongs to across withdrawals and re-signups. */
  person_id: string;
  reregistration_count: number;
  /** Every account of that person, oldest first (this one included). */
  accounts: AdminPersonAccount[];
}

export interface UserListParams {
  q?: string;
  role?: string;
  status?: string;
  subscription_status?: string;
  sort?: string;
  order?: string;
  page?: number;
  page_size?: number;
}

// ---- Admin accounts --------------------------------------------------------

export interface AdminAccount {
  user_id: string;
  email: string;
  name: string;
  nickname: string | null;
  admin_role: string;
  granted_by: string | null;
  note: string | null;
  granted_at: string | null;
}

export type AdminTier =
  | "super_admin"
  | "operator"
  | "content_manager"
  | "support_agent"
  | "viewer"
  | "analyst"
  | "educator"
  | "content_publisher";

// ---- Audit -----------------------------------------------------------------

/** One competing group on the Active Leagues page. */
export interface AdminLeagueSummary {
  season_id: string;
  group_id: string;
  group_ordinal: number;
  tier: string;
  tier_label: string;
  season_name: string;
  starts_at: string;
  ends_at: string;
  status: string;
  participants: number;
  capacity: number;
  total_points: number;
  top_points: number;
  promote_cutoff_rank: number;
  demote_cutoff_rank: number;
}

/** The cycle every league on the page belongs to, named as the member app names it. */
export interface AdminLeagueSeasonContext {
  season_id: string;
  name: string;
  calendar_label: string;
  week_ordinal: number;
  starts_at: string;
  ends_at: string;
  league_count: number;
  participant_count: number;
  /** Active accounts not placed in any league this season. */
  unassigned_count: number;
}

/** Where a member currently stands, if they are in a league at all. */
export interface AdminMemberLeagueAssignment {
  season_id: string;
  group_id: string;
  group_ordinal: number;
  tier: string;
  rank: number;
  points: number;
  band: string;
  participants: number;
  season_name: string;
  starts_at: string;
  ends_at: string;
}

export interface AdminMemberLookupResult {
  user_id: string;
  name: string | null;
  nickname: string | null;
  email: string;
  status: string;
  role: string;
  assignment: AdminMemberLeagueAssignment | null;
}

export interface AdminMemberLookupPage {
  items: AdminMemberLookupResult[];
  total: number;
  truncated: boolean;
  seasons: AdminLeagueSeasonContext[];
}

/**
 * Why a member has no league. Two different problems, never one number.
 *
 * `DORMANT` — they have not studied this week. It resolves itself: allocation
 * runs on qualifying activity, so they are seated the moment they start.
 *
 * `WAITING_FOR_ALLOCATION` — they have studied and there is still nowhere to
 * put them, because every league in their tier is full and fewer than five are
 * waiting to open another. Nothing the member does changes that.
 */
export type AdminUnassignedState = "DORMANT" | "WAITING_FOR_ALLOCATION";

/** One member with no league this week. */
export interface AdminUnassignedMember {
  user_id: string;
  name: string | null;
  nickname: string | null;
  email: string;
  status: string;
  role: string;
  created_at: string;
  last_activity_at: string | null;
  days_since_activity: number | null;
  never_studied: boolean;
  days_since_signup: number;
  /**
   * Days since the last session, or since signup for an account that never
   * studied. Informational — it does not decide `state`: somebody who studied
   * on Monday and found every league full is waiting with an `idle_days` of 0.
   */
  idle_days: number;
  state: AdminUnassignedState;
  /** They had qualifying learning activity in the previous weekly season. */
  studied_last_week: boolean;
  last_tier: string | null;
  last_season_points: number | null;
}

export interface AdminUnassignedMembersPage extends Page<AdminUnassignedMember> {
  dormant_total: number;
  /** Studied and still unplaced. Growing week on week means leagues are not opening. */
  waiting_total: number;
  idle_last_week_total: number;
  /** The weekly season `studied_last_week` was measured against. */
  previous_season_id: string | null;
  seasons: AdminLeagueSeasonContext[];
}

export interface AdminLeaguesPage extends Page<AdminLeagueSummary> {
  seasons: AdminLeagueSeasonContext[];
}

/** One person's standing inside a league. */
export interface AdminLeagueMember {
  user_id: string;
  name: string | null;
  nickname: string | null;
  email: string | null;
  account_status: string | null;
  role: string | null;
  rank: number;
  points: number;
  band: string;
  outcome: string | null;
  last_activity_at: string | null;
}

export interface AdminLeagueDetail {
  league: AdminLeagueSummary;
  season: AdminLeagueSeasonContext;
  members: AdminLeagueMember[];
  member_total: number;
  /** Counted over the whole league, not the filtered member list. */
  promote_count: number;
  demote_count: number;
  promote_cutoff_rank: number;
  demote_cutoff_rank: number;
}

export interface AuditLogEntry {
  id: number;
  actor_type: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
  object_type: string;
  object_id: string;
  user_id: string | null;
  request_id: string | null;
  ip_address: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  occurred_at: string;
}

// ---- Commerce --------------------------------------------------------------

export interface AdminSubscriptionRow {
  subscription_id: string;
  user_id: string | null;
  user_email: string | null;
  plan_id: string | null;
  status: string;
  provider: string | null;
  trial_expires_at: string | null;
  current_period_end: string | null;
  next_billing_at: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
}

export interface AdminInvoiceRow {
  invoice_id: string;
  user_id: string | null;
  user_email: string | null;
  subscription_id: string;
  plan_name: string;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  refunded_cents: number;
  currency: string;
  status: string;
  coupon_code: string | null;
  paid_at: string | null;
  created_at: string;
}

export interface AdminPaymentRow {
  payment_id: string;
  invoice_id: string;
  user_id: string | null;
  user_email: string | null;
  provider: string;
  amount_cents: number;
  refunded_amount_cents: number;
  currency: string;
  status: string;
  failure_class: string | null;
  failure_reason: string | null;
  paid_at: string | null;
  created_at: string;
}

/** POST /admin/commerce/payments/{payment_id}/refund. Omit `amount_cents` to
 *  refund everything not yet refunded. */
export interface AdminRefundRequest {
  amount_cents?: number;
  reason: string;
  /** New for each refund the admin starts, re-sent unchanged when retrying
   *  one whose outcome was unknown (502): the provider then never refunds twice. */
  request_id?: string;
}

export interface AdminRefundResult {
  payment_id: string;
  status: string;
  amount_cents: number;
  refunded_amount_cents: number;
  refund_amount_cents: number;
  currency: string;
  invoice_status: string;
}

/** GET /admin/commerce/invoices/{invoice_id}/retry-eligibility — whether an
 *  operator retry would be accepted now, and if not why (`reason`). */
export interface AdminRetryEligibility {
  invoice_id: string;
  allowed: boolean;
  reason: string | null;
  error_code: string | null;
  message: string;
  retry_after: string | null;
  /** The last charge is undecided: a retry re-asks about it, it cannot charge twice. */
  replays_pending: boolean;
  manual_retries_today: number;
  manual_retry_limit: number;
  attempts: number;
  max_attempts: number;
}

/** POST /admin/commerce/invoices/{invoice_id}/retry — the attempt made. */
export interface AdminRetryResult {
  invoice_id: string;
  invoice_status: string;
  attempt_id: string;
  attempt_no: number;
  attempt_status: string;
  failure_class: string | null;
  failure_code: string | null;
}

// ---- Plans -----------------------------------------------------------------

/** A plan card's promotional ribbon, in each app language. */
export interface PlanBadge {
  ko: string;
  en: string;
}

/** A ready-made badge the editor offers next to custom text. */
export interface BadgePreset {
  key: string;
  text: PlanBadge;
}

/** The fixed place a plan is sold in: the monthly or the yearly plan. Every
 *  plan unlocks the same full access; they differ in period and price. */
export interface OfferSlot {
  interval: "month" | "year";
}

export interface Plan {
  plan_id: string;
  name: string;
  /** List price, shown struck through under a lower one. */
  price_cents: number;
  currency: string;
  interval: "month" | "year";
  /** The regular price while a promotion runs; null = the list price. */
  promo_price_cents: number | null;
  /** What new members (never trialled or paid) pay instead; null = the regular price. */
  new_member_price_cents: number | null;
  /** `active` = on offer; `archived` = not sold (keeps renewing its subscribers). */
  status: "active" | "archived";
  version: number;
  /** null for an older plan outside the slots, which only renews its subscribers. */
  slot: OfferSlot | null;
  badge_text: PlanBadge;
  badge_published: boolean;
  /** Subscribed now: in the free trial or paid. */
  active_subscribers: number;
  /** Everyone who ever started a trial on it or paid for it, current and former. */
  total_subscribers: number;
}

/** Longest badge text per language (the server's limit). */
export const BADGE_MAX_LENGTH = 20;

export interface PlanUpdate {
  name?: string;
  price_cents?: number;
  promo_price_cents?: number | null;
  new_member_price_cents?: number | null;
  badge_text?: PlanBadge;
  badge_published?: boolean;
}

// ---- Coupons ---------------------------------------------------------------

export interface CouponBatch {
  batch_id: string;
  name: string;
  duration_days: number;
  quantity: number;
  valid_until: string | null;
  status: "active" | "revoked";
  created_at: string;
  issued_by_user_id: string;
}

export interface CouponRow {
  coupon_id: string;
  batch_id: string;
  batch_name: string | null;
  code: string;
  status: string;
  redeemed_by_user_id: string | null;
  redeemed_at: string | null;
  duration_days: number;
  created_at: string;
}

// ---- Content ---------------------------------------------------------------

export interface AdminBanner {
  banner_id: string;
  image_url: string;
  /** The part of the image shown (fractions of the original); null = centred cover. */
  image_crop: ImageCrop | null;
  alt_text: string;
  action_url: string | null;
  sort_order: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A non-English version of a catalogue item's title and description. English
 * is the base (the item's own `title` / `description`); members whose app runs
 * in another language see that language's text, falling back to English per
 * field when it is empty.
 */
export interface CatalogTranslation {
  locale: "ko";
  title: string;
  description: string;
}

export interface AdminCourse {
  course_id: string;
  track_id: string;
  title: string;
  description: string;
  cover_image_url: string | null;
  /** Position within the track (managed with the reorder endpoint). */
  sequence: number;
  lecture_count: number;
  /** Series in the course; it can only be deleted at 0. */
  series_count: number;
  translations: CatalogTranslation[];
}

export interface AdminCourseWrite {
  title?: string;
  description?: string;
  cover_image_url?: string | null;
  /** Replaces every translation when sent. */
  translations?: CatalogTranslation[];
}

/** A series inside a course: its own key art, and the lessons filed under it. */
export interface AdminSeries {
  series_id: string;
  course_id: string;
  title: string;
  description: string;
  thumbnail_url: string | null;
  /** Position within the course (managed with the reorder endpoint). */
  sequence: number;
  lecture_count: number;
  translations: CatalogTranslation[];
}

export interface AdminSeriesWrite {
  title?: string;
  description?: string;
  /** null clears it on an update. */
  thumbnail_url?: string | null;
  /** Replaces every translation when sent. */
  translations?: CatalogTranslation[];
}

/**
 * `*_archived` = catalogue content retired from study (the rows stay, so a
 * member's history and saved items keep rendering). `*_preserved` = member
 * records left untouched. Only the regenerable AI cache is deleted.
 */
export interface SentenceCleanupCounts {
  sentences_archived: number;
  generated_sentences: number;
  sentence_histories_preserved: number;
  speech_attempts_preserved: number;
  saved_sentences_preserved: number;
}

/** See `SentenceCleanupCounts` for what the two suffixes mean. */
export interface TopikCleanupCounts {
  questions_archived: number;
  exam_sets_archived: number;
  practice_sets: number;
  generated_questions: number;
  quiz_histories_preserved: number;
  quiz_attempts_preserved: number;
  exam_attempts_preserved: number;
  saved_quizzes_preserved: number;
}

export interface AdminLecture {
  lecture_id: string;
  track_id: string;
  course_id: string | null;
  /** Every lesson belongs to a series (and through it, a course). */
  series_id: string | null;
  series_title: string | null;
  course_title: string | null;
  title: string;
  /** The lesson's Korean description (other languages in `translations`). */
  description: string;
  kind: string;
  duration_seconds: number;
  thumbnail_url: string | null;
  access: string;
  /** Position within its series (managed with the reorder endpoint). */
  sequence: number;
  topik_question_type: string | null;
  video_status: string | null;
  checkpoint_count: number;
  translations: CatalogTranslation[];
}

/**
 * The lecture fields an admin edits; kind and length come from the video, and
 * its position is set by reordering the series, never typed.
 */
export type AdminLectureFields = Partial<
  Pick<AdminLecture, "title" | "description" | "thumbnail_url" | "access" | "topik_question_type" | "translations"> & {
    series_id: string;
  }
>;

/** speaking_exercise → conversation modal; multiple_choice / short_answer → TOPIK modal. */
export type CheckpointInteractionType = "speaking_exercise" | "multiple_choice" | "short_answer";

export interface AdminCheckpoint {
  checkpoint_id: string;
  lecture_id: string;
  interaction_type: CheckpointInteractionType;
  at_second: number;
  sentence_id: string | null;
  quiz_id: string | null;
  content_label: string | null;
  content_detail: string | null;
  content_archived: boolean;
  /** Placed on an earlier video; the lecture's video was replaced since. */
  needs_review: boolean;
  /** At or past the end of the current video, so it would never fire. */
  out_of_range: boolean;
  /**
   * The content was written on this checkpoint and belongs to the lecture.
   * False for an older checkpoint linking shared catalogue content.
   */
  content_owned?: boolean;
  /** The full sentence / question, for editing in place. */
  sentence?: AdminSentence | null;
  quiz?: AdminQuiz | null;
}

export interface AdminCheckpointList {
  lecture_id: string;
  /** The ready video checkpoints sit on; null until one is uploaded and ready. */
  video_id: string | null;
  duration_seconds: number;
  items: AdminCheckpoint[];
}

/** Exactly one of sentence_id / quiz_id; the server derives interaction_type from it. */
/**
 * Exactly one of: `sentence` / `quiz` — the content itself, stored as the
 * lecture's own — or `sentence_id` / `quiz_id`, keeping a link to shared
 * catalogue content (older checkpoints whose content was not edited).
 */
export interface AdminCheckpointWrite {
  at_second: number;
  sentence?: Record<string, unknown>;
  quiz?: Record<string, unknown>;
  sentence_id?: string;
  quiz_id?: string;
}

export interface AdminLectureVideo {
  video_id: string;
  lecture_id: string;
  provider: string;
  provider_video_id: string | null;
  is_primary: boolean;
  upload_status: string;
  duration_seconds: number;
  thumbnail_url: string | null;
  preview_url: string | null;
  original_file_name: string | null;
  file_size_bytes: number;
  mime_type: string | null;
  uploaded_by_admin_id: string | null;
  uploaded_at: string | null;
  processed_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  deleted_at: string | null;
}

export interface UploadSession {
  video_id: string;
  provider: string;
  provider_video_id: string;
  upload_url: string;
  upload_protocol: string;
  expires_at: string;
}

export interface AdminSentence {
  sentence_id: string;
  korean: string;
  display_text: string | null;
  translation: string;
  translation_language: string;
  romanization: string | null;
  topic: string | null;
  level: number;
  grammar_points: string[];
  blanks_json: Record<string, unknown>[] | null;
  has_audio: boolean;
  audio_voice: string;
  is_ai_generated: boolean;
}

export interface AdminQuizChoice {
  key: string;
  text: string;
}

export interface AdminQuizBlank {
  label: string;
  answer: string | null;
}

export interface AdminQuiz {
  quiz_id: string;
  answer_format: string;
  material_kind: string;
  topik_section: string | null;
  topik_question_type: string | null;
  is_ai_generated: boolean;
  image_url: string | null;
  prompt: string;
  prompt_translation: string | null;
  content_html: string | null;
  level: number;
  correct_choice: string | null;
  choices: AdminQuizChoice[];
  blanks: AdminQuizBlank[];
  hint: string | null;
  explanation: string | null;
  has_listening_audio: boolean;
  audio_duration_ms: number;
  answer_max_length: number | null;
  answer_min_length: number | null;
  scoring_criteria: string[];
  max_score: number | null;
}

export interface GeneratedSummary {
  content_id: string;
  content_kind: string;
  level: number;
  topik_question_type: string | null;
  topic: string | null;
  model: string;
  preview: string;
  created_at: string;
  review_status: string;
}

export interface GeneratedDetail {
  content_id: string;
  content_kind: string;
  source: string;
  level: number;
  topik_section: string | null;
  topik_question_type: string | null;
  topic: string | null;
  language: string | null;
  model: string;
  payload: Record<string, unknown>;
  fingerprint: string;
  materialized_item_id: string | null;
  created_by_user_id: string | null;
  created_at: string;
  review_status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
}

// ---- Support ---------------------------------------------------------------

/** One authored language of a FAQ. */
export interface FaqTranslation {
  locale: string;
  question: string;
  answer: string;
}

export interface AdminFaq {
  faq_id: string;
  category: string;
  /** Every authored locale, sorted by locale. At least one is always present. */
  translations: FaqTranslation[];
  order: number;
  published: boolean;
}

/** Body for creating/updating a FAQ. On update every field is optional; the
 *  translations sent are upserted by locale and others are left untouched. */
export interface AdminFaqBody {
  category?: string;
  translations?: FaqTranslation[];
  published?: boolean;
}

export interface NoticeTranslation {
  locale: string;
  title: string;
  body: string;
}

export interface AdminNotice {
  notice_id: string;
  translations: NoticeTranslation[];
  pinned: boolean;
  display_order: number;
  published: boolean;
  published_at: string | null;
}

// ---- Notification settings -------------------------------------------------

/**
 * The one admin-owned send time for the daily study reminder. `HH:MM` is a
 * wall-clock time read on each recipient's OWN clock — the timezone of the
 * country their verified phone number belongs to — never a UTC instant and
 * never derived from their app language.
 */
export interface DailyReminderSettings {
  daily_reminder_time: string;
  /** When an admin last changed it; null while it is still the default. */
  updated_at: string | null;
  updated_by_admin_id: string | null;
}

// ---------------------------------------------------------------------------

type Query = Record<string, string | number | boolean | undefined | null>;

/* ---- Settings page (/admin/system-settings) ---- */
export type SettingSource = "admin" | "env" | "default" | "unreadable";
export type IntegrationStatus = "active" | "incomplete" | "off" | "not_configured" | "settings";
export type SettingFieldKind =
  | "secret"
  | "multiline_secret"
  | "text"
  | "url"
  | "email"
  | "bool"
  | "number"
  | "integer"
  | "choice"
  | "model"
  | "provider";
export interface SettingField {
  key: string;
  label: string;
  help: string;
  kind: SettingFieldKind;
  required: boolean;
  restart_required: boolean;
  placeholder: string;
  choices: { value: string; label: string }[];
  env_var: string;
  source: SettingSource;
  cleared: boolean;
  /** Always null for secrets. */
  value: string | number | boolean | null;
  secret: { is_set: boolean; hint: string | null } | null;
  updated_at: string | null;
  updated_by: string | null;
}
export interface IntegrationCheck {
  ok: boolean;
  message: string;
  latency_ms: number | null;
  checked_at: string;
  checked_by: string | null;
  used_unsaved_values: boolean;
  details?: { provider: string; ok: boolean; message: string }[] | null;
}
export interface IntegrationSettings {
  id: string;
  group: string;
  name: string;
  description: string;
  note: string;
  kind: "integration" | "settings";
  status: IntegrationStatus;
  status_label: string;
  toggle: { enabled: boolean; source: "admin" | "env" } | null;
  testable: boolean;
  restart_pending: string[];
  last_check: IntegrationCheck | null;
  fields: SettingField[];
}
export interface SettingsGroup {
  id: string;
  label: string;
  description: string;
  integrations: IntegrationSettings[];
}
export interface SettingsPageData {
  groups: SettingsGroup[];
  restart_pending: { key: string; label: string }[];
  encryption_key_source: "env" | "derived";
  environment: { app_env: string; database: string };
  revision: number;
}
export type SettingChange =
  | { key: string; action: "set"; value?: unknown; secret?: string }
  | { key: string; action: "clear" | "reset" };
export interface SettingsSaveResult {
  integration: IntegrationSettings;
  applied: Record<string, "live" | "restart">;
  message: string;
}
export type AiPurpose = "generation" | "reasoning";
export interface AiModelOption {
  id: string;
  display_name: string;
  provider: string;
  provider_name: string;
  /** On the rate card; otherwise charged at the (high) fallback rate. */
  priced: boolean;
  /** `live`: from the provider's own list; `suggested`: from the rate card. */
  source: "live" | "suggested";
  /** Can generate text through the app's adapters. */
  compatible: boolean;
  incompatible_reason: string | null;
  /** Purposes it suits (fast/cheap → generation, strong → reasoning). */
  recommended_for: AiPurpose[];
}
export interface AiModelProvider {
  id: string;
  name: string;
  supported: boolean;
  enabled: boolean;
  key_configured: boolean;
  listing: "live" | "suggested" | "no_key" | "disabled" | "error" | "unsupported";
  message: string;
}
export interface AiTierModel {
  key: string;
  provider_key: string;
  label: string;
  purpose: string;
  model: string;
  provider: string;
  provider_name: string;
  supported: boolean;
  provider_enabled: boolean;
  key_configured: boolean;
  priced: boolean;
  /** Price per 1M tokens used for this model (card or fallback). */
  rate: string;
  /** Found in the provider's live list; null when no live list was available. */
  listed: boolean | null;
  /** Why this model cannot be used with this provider, if it cannot. */
  problem: string | null;
}
export interface AiModelsData {
  tiers: AiTierModel[];
  providers: AiModelProvider[];
  models: AiModelOption[];
}
export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  latency_ms: number;
  details: { provider: string; ok: boolean; message: string; error_code?: string }[];
  used_unsaved_values: boolean;
}

export const adminApi = {
  // Dashboard
  metricsOverview: () => http.get<MetricsOverview>("/admin/metrics/overview"),
  metricsTimeseries: (metric: string, days: number) =>
    http.get<TimeseriesResponse>("/admin/metrics/timeseries", { metric, days }),
  metricsMonthlyRevenue: (months: number) =>
    http.get<MonthlyRevenueResponse>("/admin/metrics/monthly-revenue", { months }),

  // Users
  listUsers: (params: UserListParams) =>
    http.get<Page<AdminUserSummary>>("/admin/users", params as Query),
  userDetail: (userId: string) =>
    http.get<AdminUserDetail>(`/admin/users/${userId}`),
  updateUser: (
    userId: string,
    body: {
      role?: string;
      status?: string;
      nickname?: string;
      reason?: string;
    },
  ) => http.patch<AdminUserSummary>(`/admin/users/${userId}`, body),
  createTester: () =>
    http.post<{
      user_id: string;
      email: string;
      nickname: string;
      name: string;
      password: string;
      role: string;
    }>("/admin/users/testers"),
  // Admin accounts
  listAdmins: () => http.get<{ items: AdminAccount[] }>("/admin/admins"),
  grantAdmin: (body: { email: string; admin_role: AdminTier; note?: string }) =>
    http.post<AdminAccount>("/admin/admins", body),
  updateAdmin: (userId: string, body: { admin_role: AdminTier; note?: string }) =>
    http.patch<AdminAccount>(`/admin/admins/${userId}`, body),
  revokeAdmin: (userId: string) => http.del<void>(`/admin/admins/${userId}`),

  // Audit
  listAuditLogs: (params: Query) =>
    http.get<Page<AuditLogEntry>>("/admin/audit-logs", params),

  // Leagues
  listActiveLeagues: (params: Query) =>
    http.get<AdminLeaguesPage>("/admin/leagues", params),
  lookupMemberLeague: (params: Query) =>
    http.get<AdminMemberLookupPage>("/admin/leagues/member-lookup", params),
  listUnassignedMembers: (params: Query) =>
    http.get<AdminUnassignedMembersPage>("/admin/leagues/unassigned", params),
  getLeague: (seasonId: string, groupId: string, params?: Query) =>
    http.get<AdminLeagueDetail>(
      `/admin/leagues/${encodeURIComponent(seasonId)}/${encodeURIComponent(groupId)}`,
      params,
    ),

  // Commerce
  listSubscriptions: (params: Query) =>
    http.get<Page<AdminSubscriptionRow>>("/admin/commerce/subscriptions", params),
  listInvoices: (params: Query) =>
    http.get<Page<AdminInvoiceRow>>("/admin/commerce/invoices", params),
  listPayments: (params: Query) =>
    http.get<Page<AdminPaymentRow>>("/admin/commerce/payments", params),
  refundPayment: (paymentId: string, body: AdminRefundRequest) =>
    http.post<AdminRefundResult>(
      `/admin/commerce/payments/${encodeURIComponent(paymentId)}/refund`,
      body,
    ),
  invoiceRetryEligibility: (invoiceId: string) =>
    http.get<AdminRetryEligibility>(
      `/admin/commerce/invoices/${encodeURIComponent(invoiceId)}/retry-eligibility`,
    ),
  retryInvoice: (invoiceId: string) =>
    http.post<AdminRetryResult>(`/admin/commerce/invoices/${encodeURIComponent(invoiceId)}/retry`, {}),

  // Plans
  /** The four offer slots' plans in order, then older plans still renewing. */
  listPlans: () =>
    http.get<{ plans: Plan[]; trial_days: number; badge_presets: BadgePreset[] }>("/admin/subscriptions/plans"),
  updatePlan: (planId: string, body: PlanUpdate) =>
    http.patch<Plan>(`/admin/subscriptions/plans/${planId}`, body),

  // Coupons
  listCouponBatches: (params: Query) =>
    http.get<{ items: CouponBatch[]; total: number; limit: number; offset: number }>(
      "/admin/coupons/batches",
      params,
    ),
  generateCouponBatch: (body: {
    name: string;
    duration_days: number;
    quantity: number;
    valid_until?: string | null;
  }) =>
    http.post<{ batch: CouponBatch; generated: number; sample_codes: string[] }>(
      "/admin/coupons/batches",
      body,
    ),
  revokeCouponBatch: (batchId: string) =>
    http.post<CouponBatch>(`/admin/coupons/batches/${batchId}/revoke`),
  searchCoupons: (params: Query) =>
    http.get<{ items: CouponRow[]; total: number; limit: number; offset: number }>(
      "/admin/coupons",
      params,
    ),
  revokeCoupon: (couponId: string) =>
    http.post<CouponRow>(`/admin/coupons/${couponId}/revoke`),

  // Banners
  listBanners: () => http.get<{ items: AdminBanner[] }>("/admin/banners"),
  createBanner: (body: Partial<AdminBanner>) =>
    http.post<AdminBanner>("/admin/banners", body),
  updateBanner: (
    bannerId: string,
    body: Partial<AdminBanner> & { clear_window?: boolean; clear_action_url?: boolean },
  ) => http.patch<AdminBanner>(`/admin/banners/${bannerId}`, body),
  reorderBanners: (bannerIds: string[]) =>
    http.post<{ items: AdminBanner[] }>("/admin/banners/reorder", {
      banner_ids: bannerIds,
    }),
  deleteBanner: (bannerId: string) => http.del<void>(`/admin/banners/${bannerId}`),

  // Media
  uploadMedia: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return http.upload<{ key: string; url: string; bytes: number }>(
      "/admin/media",
      form,
    );
  },

  // Courses / lectures
  listCourses: (trackId?: string) =>
    http.get<{ items: AdminCourse[] }>("/admin/courses", { track_id: trackId }),
  // A new course goes to the end of its track; order is changed by reordering.
  createCourse: (body: AdminCourseWrite & { track_id: string; title: string }) =>
    http.post<AdminCourse>("/admin/courses", body),
  updateCourse: (courseId: string, body: AdminCourseWrite) =>
    http.patch<AdminCourse>(`/admin/courses/${courseId}`, body),
  deleteCourse: (courseId: string) => http.del<void>(`/admin/courses/${courseId}`),
  /** Sets a track's course order: the ids given come first, in that order. */
  reorderCourses: (trackId: string, courseIds: string[]) =>
    http.post<{ items: AdminCourse[] }>("/admin/courses/reorder", { track_id: trackId, course_ids: courseIds }),
  reorderSeries: (courseId: string, seriesIds: string[]) =>
    http.post<{ items: AdminSeries[] }>(`/admin/courses/${courseId}/series/reorder`, { series_ids: seriesIds }),
  reorderSeriesLectures: (seriesId: string, lectureIds: string[]) =>
    http.post<{ items: AdminLecture[] }>(`/admin/series/${seriesId}/lectures/reorder`, { lecture_ids: lectureIds }),
  // Series: a course's rows of lessons, each with its own thumbnail.
  listSeries: (courseId: string) =>
    http.get<{ items: AdminSeries[] }>(`/admin/courses/${courseId}/series`),
  createSeries: (courseId: string, body: AdminSeriesWrite & { title: string }) =>
    http.post<AdminSeries>(`/admin/courses/${courseId}/series`, body),
  updateSeries: (seriesId: string, body: AdminSeriesWrite) =>
    http.patch<AdminSeries>(`/admin/series/${seriesId}`, body),
  deleteSeries: (seriesId: string) => http.del<void>(`/admin/series/${seriesId}`),
  listLectures: (params: Query) =>
    http.get<Page<AdminLecture>>("/admin/lectures", params),
  // A lecture is always a video and its length is read from the video, so
  // neither kind nor duration is ever sent (the server refuses both). Its
  // course and track come from the series it is filed under.
  createLecture: (body: AdminLectureFields & { series_id: string; title: string }) =>
    http.post<AdminLecture>("/admin/lectures", body),
  updateLecture: (lectureId: string, body: AdminLectureFields) =>
    http.patch<AdminLecture>(`/admin/lectures/${lectureId}`, body),
  deleteLecture: (lectureId: string) =>
    http.del<void>(`/admin/lectures/${lectureId}`),
  // Checkpoints: where the player pauses for a conversation / TOPIK modal.
  listCheckpoints: (lectureId: string) =>
    http.get<AdminCheckpointList>(`/admin/lectures/${lectureId}/checkpoints`),
  createCheckpoint: (lectureId: string, body: AdminCheckpointWrite) =>
    http.post<AdminCheckpoint>(`/admin/lectures/${lectureId}/checkpoints`, body),
  replaceCheckpoint: (lectureId: string, checkpointId: string, body: AdminCheckpointWrite) =>
    http.put<AdminCheckpoint>(`/admin/lectures/${lectureId}/checkpoints/${checkpointId}`, body),
  deleteCheckpoint: (lectureId: string, checkpointId: string) =>
    http.del<void>(`/admin/lectures/${lectureId}/checkpoints/${checkpointId}`),
  listLectureVideos: (lectureId: string) =>
    http.get<{ lecture_id: string; items: AdminLectureVideo[] }>(
      `/admin/lectures/${lectureId}/videos`,
    ),
  // Provision a direct (browser → Cloudflare) resumable upload session. The
  // backend returns a one-time upload URL; our Cloudflare token never leaves it.
  createVideoUploadSession: (
    lectureId: string,
    body: {
      filename: string;
      file_size_bytes: number;
      content_type: string;
      /** Length the browser read from the file; the provider's measurement replaces it. */
      duration_seconds?: number;
    },
  ) =>
    http.post<UploadSession>(
      `/admin/lectures/${lectureId}/video/upload-session`,
      body,
    ),
  /** Send the file for an `api`-protocol session (the offline provider). */
  sendOfflineVideoFile: (videoId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return http.upload<AdminLectureVideo>(`/admin/lectures/videos/${videoId}/file`, form, { method: "PUT" });
  },
  /** Signed URL to play the lecture's ready video in the checkpoint editor. */
  previewLectureVideo: (lectureId: string) =>
    http.get<{ video_id: string; url: string; duration_seconds: number; expires_at: string }>(
      `/admin/lectures/${lectureId}/video/playback`,
    ),
  refreshLectureVideo: (videoId: string) =>
    http.post<AdminLectureVideo>(`/admin/lectures/videos/${videoId}/refresh`),
  deleteLectureVideo: (videoId: string) =>
    http.del<void>(`/admin/lectures/videos/${videoId}`),

  // Sentences
  listSentences: (params: Query) =>
    http.get<Page<AdminSentence>>("/admin/sentences", params),
  sentenceTopics: () => http.get<{ topics: string[] }>("/admin/sentences/topics"),
  createSentence: (body: Partial<AdminSentence> & { korean: string; translation: string }) =>
    http.post<AdminSentence>("/admin/sentences", body),
  createSentencesBatch: (items: Record<string, unknown>[]) =>
    http.post<{ created: number; items: AdminSentence[] }>("/admin/sentences/batch", {
      items,
    }),
  /** Per-row check of an upload; saves nothing. */
  checkSentencesBatch: (items: Record<string, unknown>[]) =>
    http.post<BulkCheckResult>("/admin/sentences/batch/check", { items }),
  updateSentence: (sentenceId: string, body: Partial<AdminSentence>) =>
    http.patch<AdminSentence>(`/admin/sentences/${sentenceId}`, body),
  deleteSentence: (sentenceId: string) =>
    http.del<void>(`/admin/sentences/${sentenceId}`),

  // Quizzes
  listQuizzes: (params: Query) =>
    http.get<{ items: AdminQuiz[]; total: number; limit: number; offset: number }>(
      "/admin/quizzes",
      params,
    ),
  createQuiz: (body: Record<string, unknown>) =>
    http.post<AdminQuiz>("/admin/quizzes", body),
  createQuizzesBatch: (items: Record<string, unknown>[]) =>
    http.post<{ created: number; items: AdminQuiz[] }>("/admin/quizzes/batch", {
      items,
    }),
  /** Per-row check of an upload; saves nothing. */
  checkQuizzesBatch: (items: Record<string, unknown>[]) =>
    http.post<BulkCheckResult>("/admin/quizzes/batch/check", { items }),
  replaceQuiz: (quizId: string, body: Record<string, unknown>) =>
    http.put<AdminQuiz>(`/admin/quizzes/${quizId}`, body),
  /** A listening question's MP3 (what members hear); `durationMs` as the browser measured it. */
  // The server checks the file is a decodable MP3 and sets the audio length
  // from the decoded audio; a rejected file comes back as a 422 message.
  uploadQuizAudio: (quizId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return http.upload<AdminQuiz>(`/admin/quizzes/${quizId}/audio`, form, { method: "PUT" });
  },
  deleteQuiz: (quizId: string) => http.del<void>(`/admin/quizzes/${quizId}`),

  // Content cleanup (super-admin only; destructive bulk reset)
  previewSentenceCleanup: () =>
    http.get<SentenceCleanupCounts>("/admin/content/sentences/cleanup-preview"),
  clearSentences: () =>
    http.del<{ success: boolean; deleted: SentenceCleanupCounts }>("/admin/content/sentences", {
      body: { confirmation: "DELETE_ALL_SENTENCES" },
    }),
  previewTopikCleanup: () =>
    http.get<TopikCleanupCounts>("/admin/content/topik-questions/cleanup-preview"),
  clearTopik: () =>
    http.del<{ success: boolean; deleted: TopikCleanupCounts }>("/admin/content/topik-questions", {
      body: { confirmation: "DELETE_ALL_TOPIK_QUESTIONS" },
    }),

  // Generated content
  listGenerated: (params: Query) =>
    http.get<Page<GeneratedSummary>>("/admin/generated-content", params),
  getGenerated: (contentId: string) =>
    http.get<GeneratedDetail>(`/admin/generated-content/${contentId}`),
  reviewGenerated: (
    contentId: string,
    body: { review_status: "approved" | "rejected" | "pending"; note?: string },
  ) => http.post<GeneratedDetail>(`/admin/generated-content/${contentId}/review`, body),
  deleteGenerated: (contentId: string) =>
    http.del<void>(`/admin/generated-content/${contentId}`),

  // Support
  listFaqs: () => http.get<{ items: AdminFaq[] }>("/admin/support/faqs"),
  createFaq: (body: AdminFaqBody & { category: string; translations: FaqTranslation[] }) =>
    http.post<AdminFaq>("/admin/support/faqs", body),
  updateFaq: (faqId: string, body: AdminFaqBody) =>
    http.patch<AdminFaq>(`/admin/support/faqs/${faqId}`, body),
  deleteFaq: (faqId: string) => http.del<void>(`/admin/support/faqs/${faqId}`),
  /** Sets the order of one category's FAQs. */
  reorderFaqs: (category: string, faqIds: string[]) =>
    http.post<{ items: AdminFaq[] }>("/admin/support/faqs/reorder", { category, faq_ids: faqIds }),
  reorderNotices: (noticeIds: string[]) =>
    http.post<{ items: AdminNotice[] }>("/admin/support/notices/reorder", { notice_ids: noticeIds }),
  deleteFaqTranslation: (faqId: string, locale: string) =>
    http.del<AdminFaq>(`/admin/support/faqs/${faqId}/translations/${locale}`),
  listNotices: () => http.get<{ items: AdminNotice[] }>("/admin/support/notices"),
  // A new notice goes to the end of the list; order is changed by reordering.
  createNotice: (body: {
    translations: NoticeTranslation[];
    pinned?: boolean;
    published?: boolean;
  }) => http.post<AdminNotice>("/admin/support/notices", body),
  updateNotice: (
    noticeId: string,
    body: {
      translations?: NoticeTranslation[];
      pinned?: boolean;
      published?: boolean;
    },
  ) => http.patch<AdminNotice>(`/admin/support/notices/${noticeId}`, body),
  deleteNotice: (noticeId: string) =>
    http.del<void>(`/admin/support/notices/${noticeId}`),
  deleteNoticeTranslation: (noticeId: string, locale: string) =>
    http.del<AdminNotice>(`/admin/support/notices/${noticeId}/translations/${locale}`),

  // Notifications
  sendMarketingPush: (body: {
    title: string;
    body?: string;
    image_url?: string;
    deep_link?: string;
  }) => http.post<{ sent_count: number }>("/admin/notifications/marketing-push", body),
  sendMarketingNotice: (body: {
    title: string;
    body?: string;
    deep_link?: string;
    dedup_key?: string;
  }) => http.post<{ created: number }>("/admin/notifications/marketing-notice", body),
  sendAnnouncement: (body: {
    title: string;
    body?: string;
    deep_link?: string;
    dedup_key?: string;
  }) => http.post<{ created: number }>("/admin/notifications/announcement", body),
  getDailyReminder: () =>
    http.get<DailyReminderSettings>("/admin/notifications/daily-reminder"),
  updateDailyReminder: (body: { daily_reminder_time: string }) =>
    http.put<DailyReminderSettings>("/admin/notifications/daily-reminder", body),

  // Settings page: integrations and server settings. Secrets travel only
  // under `secret` / `secrets`, which the audit trail redacts.
  systemSettings: () => http.get<SettingsPageData>("/admin/system-settings"),
  aiModels: (refresh = false) =>
    http.get<AiModelsData>("/admin/system-settings/models", refresh ? { refresh: "true" } : undefined),
  saveIntegration: (integrationId: string, body: { changes: SettingChange[]; enabled?: boolean }) =>
    http.put<SettingsSaveResult>(`/admin/system-settings/integrations/${integrationId}`, body),
  testIntegration: (
    integrationId: string,
    body: { values?: Record<string, unknown>; secrets?: Record<string, string> } = {},
  ) => http.post<ConnectionTestResult>(`/admin/system-settings/integrations/${integrationId}/test`, body),
};

// Typed client for every /admin/* backend endpoint the portal uses.
// All requests go through src/lib/http.ts (Bearer auth + auto refresh).
import { API_BASE_URL } from "../lib/config";
import { apiFetch, http } from "../lib/http";

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
    last_30d_cents: number;
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
    email: string;
    nickname: string | null;
    created_at: string;
  }[];
  recent_payments: {
    payment_id: string;
    user_id: string | null;
    amount_cents: number;
    currency: string;
    status: string;
    paid_at: string | null;
    created_at: string;
  }[];
  recent_admin_actions: {
    id: number;
    actor_id: string | null;
    actor_email: string | null;
    action: string;
    object_type: string;
    object_id: string;
    occurred_at: string;
  }[];
}

export interface TimeseriesResponse {
  metric: string;
  days: number;
  points: { date: string; value: number }[];
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
  created_at: string;
  deactivated_at: string | null;
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
    daily_sentence_goal: number | null;
    daily_question_goal: number | null;
  };
  gamification: {
    points_balance: number;
    season_points: number;
    league_tier: string | null;
    league_season_id: string | null;
    attendance_days_30d: number;
  };
  coupons: {
    grant_id: string;
    coupon_id: string;
    batch_id: string;
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
  | "viewer";

// ---- Audit -----------------------------------------------------------------

export interface AuditLogEntry {
  id: number;
  actor_type: string;
  actor_id: string | null;
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

// ---- Plans -----------------------------------------------------------------

export interface Plan {
  plan_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  interval: string;
  trial_days: number;
  promo_price_cents: number | null;
  features: string[];
  audience: string;
  status: string;
  is_public: boolean;
  priority: number;
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
  alt_text: string;
  action_url: string | null;
  sort_order: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminCourse {
  course_id: string;
  track_id: string;
  title: string;
  description: string;
  cover_image_url: string | null;
  sequence: number;
  lecture_count: number;
}

export interface SentenceCleanupCounts {
  sentences: number;
  sentence_histories: number;
  saved_sentences: number;
  speech_attempts: number;
  generated_sentences: number;
}

export interface TopikCleanupCounts {
  questions: number;
  quiz_histories: number;
  saved_quizzes: number;
  quiz_attempts: number;
  exam_sets: number;
  exam_set_questions: number;
  exam_attempts: number;
  practice_sets: number;
  generated_questions: number;
}

export interface AdminLecture {
  lecture_id: string;
  track_id: string;
  course_id: string | null;
  title: string;
  kind: string;
  duration_seconds: number;
  thumbnail_url: string | null;
  access: string;
  sequence: number;
  topik_question_type: string | null;
  video_status: string | null;
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

export interface AdminFaq {
  faq_id: string;
  category: string;
  question: string;
  answer: string;
  order: number;
  published: boolean;
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

export const adminApi = {
  // Dashboard
  metricsOverview: () => http.get<MetricsOverview>("/admin/metrics/overview"),
  metricsTimeseries: (metric: string, days: number) =>
    http.get<TimeseriesResponse>("/admin/metrics/timeseries", { metric, days }),

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
  usersExportUrl: (params: UserListParams) =>
    buildExportUrl("/admin/users/export", params as Query),

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

  // Commerce
  listSubscriptions: (params: Query) =>
    http.get<Page<AdminSubscriptionRow>>("/admin/commerce/subscriptions", params),
  listInvoices: (params: Query) =>
    http.get<Page<AdminInvoiceRow>>("/admin/commerce/invoices", params),
  listPayments: (params: Query) =>
    http.get<Page<AdminPaymentRow>>("/admin/commerce/payments", params),
  paymentsExportUrl: (params: Query) =>
    buildExportUrl("/admin/commerce/payments/export", params),

  // Plans
  listPlans: () => http.get<{ plans: Plan[] }>("/admin/subscriptions/plans"),
  createPlan: (body: Partial<Plan> & { plan_id: string; name: string }) =>
    http.post<Plan>("/admin/subscriptions/plans", body),
  updatePlan: (planId: string, body: Partial<Plan>) =>
    http.patch<Plan>(`/admin/subscriptions/plans/${planId}`, body),
  archivePlan: (planId: string) =>
    http.post<Plan>(`/admin/subscriptions/plans/${planId}/archive`),

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
  createCourse: (body: Partial<AdminCourse> & { track_id: string; title: string }) =>
    http.post<AdminCourse>("/admin/courses", body),
  updateCourse: (courseId: string, body: Partial<AdminCourse>) =>
    http.patch<AdminCourse>(`/admin/courses/${courseId}`, body),
  deleteCourse: (courseId: string) => http.del<void>(`/admin/courses/${courseId}`),
  listLectures: (params: Query) =>
    http.get<Page<AdminLecture>>("/admin/lectures", params),
  createLecture: (body: Partial<AdminLecture> & { track_id: string; title: string }) =>
    http.post<AdminLecture>("/admin/lectures", body),
  updateLecture: (
    lectureId: string,
    body: Partial<AdminLecture> & { clear_course?: boolean },
  ) => http.patch<AdminLecture>(`/admin/lectures/${lectureId}`, body),
  deleteLecture: (lectureId: string) =>
    http.del<void>(`/admin/lectures/${lectureId}`),
  listLectureVideos: (lectureId: string) =>
    http.get<{ lecture_id: string; items: AdminLectureVideo[] }>(
      `/admin/lectures/${lectureId}/videos`,
    ),
  uploadLectureVideo: (lectureId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return http.upload<AdminLectureVideo>(
      `/admin/lectures/${lectureId}/videos`,
      form,
    );
  },
  // Provision a direct (browser → Cloudflare) resumable upload session. The
  // backend returns a one-time upload URL; our Cloudflare token never leaves it.
  createVideoUploadSession: (
    lectureId: string,
    body: { filename: string; file_size_bytes: number; content_type: string },
  ) =>
    http.post<UploadSession>(
      `/admin/lectures/${lectureId}/video/upload-session`,
      body,
    ),
  replaceLectureVideo: (lectureId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    // http.upload always POSTs; the replace endpoint is a PUT.
    return apiFetch<AdminLectureVideo>(`/admin/lectures/${lectureId}/video`, {
      method: "PUT",
      form,
    });
  },
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
  replaceQuiz: (quizId: string, body: Record<string, unknown>) =>
    http.put<AdminQuiz>(`/admin/quizzes/${quizId}`, body),
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
  createFaq: (body: Partial<AdminFaq> & { category: string; question: string; answer: string }) =>
    http.post<AdminFaq>("/admin/support/faqs", body),
  updateFaq: (faqId: string, body: Partial<AdminFaq>) =>
    http.patch<AdminFaq>(`/admin/support/faqs/${faqId}`, body),
  deleteFaq: (faqId: string) => http.del<void>(`/admin/support/faqs/${faqId}`),
  listNotices: () => http.get<{ items: AdminNotice[] }>("/admin/support/notices"),
  createNotice: (body: {
    translations: NoticeTranslation[];
    pinned?: boolean;
    display_order?: number;
    published?: boolean;
  }) => http.post<AdminNotice>("/admin/support/notices", body),
  updateNotice: (
    noticeId: string,
    body: {
      translations?: NoticeTranslation[];
      pinned?: boolean;
      display_order?: number;
      published?: boolean;
    },
  ) => http.patch<AdminNotice>(`/admin/support/notices/${noticeId}`, body),
  deleteNotice: (noticeId: string) =>
    http.del<void>(`/admin/support/notices/${noticeId}`),

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
};

function buildExportUrl(path: string, query: Query): string {
  const url = new URL(API_BASE_URL + path, window.location.origin);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/** Download an authenticated CSV export and hand it to the browser. */
export async function downloadCsv(url: string, filename: string, token: string | null): Promise<void> {
  const res = await fetch(url, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`내보내기 실패 (HTTP ${res.status})`);
  const blob = await res.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

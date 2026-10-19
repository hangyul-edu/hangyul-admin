// Typed client for the adaptive-learning admin endpoints
// (/admin/learning-analytics/*, /admin/content-catalog/*, /admin/ai/*).
// Response shapes mirror the backend exactly; nothing is derived here.
import { http } from "../lib/http";

type Query = Record<string, string | number | boolean | undefined>;

type MetricStatus ="ok" | "no_eligible_data" | "suppressed" | "not_comparable" | "unavailable";

/** A ratio exactly as the server computed it — always with its denominator. */
export interface Ratio {
  metric: string;
  status: MetricStatus;
  value: number | null;
  numerator: number;
  denominator: number;
  note?: string | null;
}

/** Tutor reliability from human reviews: the correct-and-grounded ratio plus
 * how many reviews found the answer leaked (`leak_rate` = leaks / reviews,
 * null without reviews; a turn reviewed twice counts twice). */
interface TutorReliability extends Ratio {
  leaks: number;
  leak_rate: number | null;
}

export interface Change {
  metric: string;
  status: MetricStatus;
  baseline: Ratio;
  current: Ratio;
  absolute_pp: number | null;
  relative_pct: number | null;
  note: string | null;
}

interface WindowInfo {
  start: string;
  end: string;
  timezone: string;
}

export interface MetricDefinition {
  metric_id: string;
  version: number;
  label_ko: string;
  unit: string;
  numerator: string;
  denominator: string | null;
  inclusion: string;
  exclusion: string;
  window: string;
  timezone: string;
  source: string;
  freshness: string;
  dimensions: string[];
  null_behavior: string;
  limitations: string;
}

export interface OverviewSide {
  active_learners: { metric: string; value: number };
  sessions_started: number;
  sessions_mature: number;
  assistance_breakdown: { hint: number; reveal: number };
  reviews_assisted: number;
  customization_statuses: Record<string, number>;
  tutor_turns_by_route: Record<string, number>;
  ai_cost: {
    metric: string;
    currency: string;
    attributed_cents_estimated: number;
    unattributed_cents_estimated: number;
    calls_cost_unavailable: number;
    per_session_cents: number | null;
    denominator: string;
    status: MetricStatus;
  };
  session_completion_rate: Ratio;
  independent_accuracy: Ratio;
  assistance_rate: Ratio;
  review_success_rate: Ratio;
  delayed_retention_rate: Ratio;
  customization_success_rate: Ratio;
  retrieval_fulfillment_rate: Ratio;
  content_defect_rate: Ratio;
}

export interface Overview {
  timezone: string;
  current_window: WindowInfo;
  comparison_window: WindowInfo;
  freshness: {
    daily_activity_last_success_at: string | null;
    daily_activity_lag_events: number;
    stale: boolean;
    note: string;
  };
  current: OverviewSide;
  comparison: OverviewSide;
  changes: Record<string, Change>;
  caution: string;
}

export interface CohortRow {
  cohort: string;
  size: number | null;
  d1: Ratio;
  d7: Ratio;
  d30: Ratio;
  d1_not_yet_eligible: number;
  d7_not_yet_eligible: number;
  d30_not_yet_eligible: number;
}

export interface Cohorts {
  timezone: string;
  definition: string;
  granularity: string;
  small_cell_suppression: number | null;
  cohorts: CohortRow[];
}

interface Label {
  code: string;
  ko: string;
}

export interface LearnerRow {
  user_id: string;
  email_masked: string;
  nickname: string | null;
  last_study_at: string | null;
  evidence_count: number;
  overdue_reviews: number;
  labels: Label[];
}

interface SkillState {
  skill_id: string;
  name_ko: string;
  dimension: string;
  mastery: number;
  prior: number;
  evidence_count: number;
  evidence_strength: "low" | "medium" | "high";
  model_version: string;
  last_practiced_at: string | null;
  next_review_at: string | null;
}

export interface LearnerDetail {
  user_id: string;
  email_masked: string;
  nickname: string | null;
  status: string;
  created_at: string;
  data_coverage_start: string | null;
  learner_model_version: string;
  tracks: {
    track: string;
    band: number | null;
    placement_method: string | null;
    placement_uncertainty: string | null;
    skills: SkillState[];
    review_queue: { review_id: string; skill_id: string; skill_name: string | null; kind: string; due_at: string; overdue: boolean }[];
    recent_miss_patterns: { skill_id: string; skill_name: string | null; independent_misses_30d: number; last_miss_at: string }[];
  }[];
  recent_sessions: {
    session_id: string;
    track: string;
    status: string;
    started_at: string;
    ended_at: string | null;
    current_revision: number;
    shortfall_reason: string | null;
  }[];
}

export interface SkillGrowth {
  skill_id: string;
  skill_name: string | null;
  dimension: string;
  metric: string;
  baseline_mastery: number | null;
  baseline_evidence_count: number;
  current_mastery: number;
  current_evidence_count: number;
  evidence_strength: string;
  model_version: string;
  status: "ok" | "no_baseline" | "not_comparable" | "insufficient_evidence";
  change_pp: number | null;
  note: string | null;
  change_causes: Record<string, number>;
}

interface AssistanceSide {
  any: Ratio;
  hint: Ratio;
  reveal: Ratio;
}

interface ReviewsSide {
  review_success: Ratio;
  reviews_assisted: number;
  reviews_overdue_now: number;
  delayed_retention: Ratio;
  retention_participation: { completed_on_time: number; due_in_window: number };
  transfer: Ratio;
}

export interface Growth {
  user_id: string;
  track: string;
  baseline_window: WindowInfo;
  current_window: WindowInfo;
  data_coverage_start: string | null;
  learner_model_version: string;
  assistance_policy: string;
  activity: {
    baseline: { sessions_started: number; sessions_completed: number; attempts: number };
    current: { sessions_started: number; sessions_completed: number; attempts: number };
  };
  independent_accuracy: Change;
  mean_item_band: { baseline: number | null; current: number | null };
  assistance: { baseline: AssistanceSide; current: AssistanceSide };
  reviews: { baseline: ReviewsSide; current: ReviewsSide };
  skills: SkillGrowth[];
  limitations: string[];
}

export interface EvidenceRow {
  evidence_id: string;
  occurred_at: string;
  skill_id: string;
  skill_name: string | null;
  dimension: string;
  role: string;
  outcome: number;
  policy: string;
  exclusion_reason: string | null;
  weight: number;
  hints_used_before: number;
  mastery_before: number | null;
  mastery_after: number | null;
  model_version: string;
  review_kind: string;
  invalidated_at: string | null;
  session_id: string;
  activity_id: string;
  attempt_id: string;
  content_version_id: string;
  content_item_key: string;
  content_preview: string | null;
  content_version_no: number;
  content_review_status: string;
  item_band: number;
  learner_band: number;
}

export interface TimelineRow {
  seq: number;
  event_name: string;
  occurred_at: string;
  session_id: string | null;
  session_revision: number | null;
  content_version_id: string | null;
  payload: Record<string, unknown>;
  /** The payload's skill, by name. */
  skill_name: string | null;
}

/** One pick in a recommendation trace or a simulation, with its labels. */
interface TracePick {
  version_id: string;
  item_key: string;
  preview: string | null;
  phase: string;
  review_kind: string;
  primary_skill_id: string | null;
  primary_skill_name: string | null;
  band: number;
  topic_id: string | null;
  topic_name: string | null;
  score: number;
  components: Record<string, number>;
}

export interface SessionTrace {
  session_id: string;
  started_at: string;
  /** skill_id → name, for every skill the trace mentions. */
  skill_names: Record<string, string>;
  /** topic_id → name, for every topic the trace mentions. */
  topic_names: Record<string, string>;
  track: string;
  status: string;
  learner_band: number;
  blueprint_version: string;
  ranking_policy_version: string;
  shortfall_reason: string | null;
  revisions: { revision_no: number; parent_revision: number | null; cause: string; customization_id: string | null; activity_ids: string[]; trace_id: string | null; created_at: string }[];
  traces: {
    trace_id: string;
    kind: string;
    ranking_policy_version: string;
    learner_model_version: string;
    learner_snapshot: Record<string, unknown>;
    request: Record<string, unknown>;
    candidates_considered: number;
    candidates_eligible: number;
    excluded_by_reason: Record<string, number>;
    selected: TracePick[];
    fallbacks: Record<string, unknown>[];
    latency_ms: number | null;
    created_at: string;
  }[];
  activities: { activity_id: string; position: number; revision_introduced: number; content_version_id: string; preview: string | null; phase: string; review_kind: string; primary_skill_id: string | null; primary_skill_name: string | null; status: string; disposition_note: string | null; hints_used: number; answer_revealed_at: string | null; selection: Record<string, unknown> }[];
  attempts: { attempt_id: string; activity_id: string; attempt_no: number; correct: boolean | null; evidence_policy: string; hints_used_before: number; answer_revealed_before: boolean; duration_ms: number | null; graded_at: string; answer: string | null }[];
  answers_included: boolean;
}

export interface ContentDiagnosticRow {
  version_id: string;
  item_key: string;
  /** What the item says — how the screen names it. */
  preview: string;
  version_no: number;
  track: string;
  band: number;
  task_type: string;
  review_status: string;
  lifecycle: string;
  exposures: number;
  first_attempts: number;
  independent_accuracy: Ratio;
  independent_accuracy_by_learner_band: Record<string, Ratio>;
  assisted_first_attempts: number;
  editorial_difficulty: number | null;
  observed_difficulty: number | null;
  choice_distribution: Record<string, number>;
  correct_choice: string | null;
  issues: Record<string, number>;
}

export interface ContentVersionSummary {
  version_id: string;
  item_key: string;
  item_kind: string;
  version_no: number;
  lifecycle: string;
  review_status: string;
  track: string;
  band: number;
  task_type: string;
  topic_id: string | null;
  is_scored_objective: boolean;
  validation_passed: boolean | null;
  preview: string;
  created_at: string;
}

export interface ContentVersionDetail extends ContentVersionSummary {
  public_payload: Record<string, unknown>;
  answer_key: Record<string, unknown>;
  explanations: { kind: string; choice_key: string | null; language: string; body: string; review_status: string }[];
  skills: { skill_id: string; name_ko: string | null; role: string; dimension: string; source: string }[];
  validation: { validator: string; passed: boolean; findings: { code: string; message: string; severity: string }[]; ran_at: string }[];
  reviews: { review_id: string; kind: string; decision: string; reviewer_id: string; blind_answer: string | null; agrees_with_key: boolean | null; note: string | null; reviewed_at: string }[];
  actions: { action: string; from_state: string | null; to_state: string; actor_id: string | null; reason: string | null; acted_at: string }[];
  issues: { issue_id: string; category: string; status: string; severity: string; reporter_kind: string; created_at: string }[];
  provenance: Record<string, unknown>;
  authoring_method: string;
  source_use: string;
  difficulty_estimate: number | null;
  difficulty_method: string;
  retirement_reason: string | null;
  retirement_severity: string | null;
  publication_check: { policy: string; allowed: boolean; blockers: string[] };
}

interface CoverageBand {
  track: string;
  band: number;
  eligible: number;
  approved: number;
  legacy_unreviewed: number;
  /** Published by the automated checks, with no reviewer. */
  auto_published: number;
  required_new_items: number;
  shortage: number;
  status: "ok" | "short";
}

interface Coverage {
  model_version: string;
  assumptions: Record<string, number>;
  bands: CoverageBand[];
  skills: { skill_id: string; name_ko: string; kind: string; published_versions: number }[];
  topics: { topic_id: string; eligible: number }[];
  modalities: { track: string; modality: string; eligible: number }[];
  lifecycle: { lifecycle: string; review_status: string; count: number }[];
  eligible_without_skill_link: number;
}

export interface RecDiagnostics {
  window: WindowInfo;
  assemblies: number;
  shorter_sessions: number;
  excluded_by_reason: Record<string, number>;
  fallbacks: Record<string, number>;
  assembly_latency_ms: { p50: number | null; p95: number | null; n: number };
  customizations: {
    total: number;
    by_status: Record<string, number>;
    by_fallback_step: Record<string, number>;
    by_interpreter: Record<string, number>;
    unmet_constraints: Record<string, number>;
    conflicts: number;
    recomputes: number;
    latency_ms: { p50: number | null; p95: number | null; n: number };
  };
  unwanted_repetition: Ratio;
}

export interface TraceSummary {
  trace_id: string;
  kind: string;
  session_id: string | null;
  created_at: string;
  candidates_considered: number;
  candidates_eligible: number;
  selected_count: number;
  excluded_by_reason: Record<string, number>;
  fallbacks: Record<string, unknown>[];
  latency_ms: number | null;
  ranking_policy_version: string;
}

export interface SimulationResult {
  simulation: true;
  learner_band: number;
  candidates_considered: number;
  candidates_eligible: number;
  excluded_by_reason: Record<string, number>;
  shortfall_reason: string | null;
  selected: (TracePick & { predicted_success: number })[];
}

export interface AiFeature {
  feature: string;
  tier: string;
  enabled: boolean;
  disabled_reason: string | null;
  per_user_daily_cents: number;
  monthly_cents: number;
  timeout_seconds: number;
  max_attempts: number;
  overridden: boolean;
  updated_by: string | null;
  month_to_date_cents_estimated: number;
}

export interface AiUsageGroup {
  feature: string;
  model: string;
  prompt_version: string | null;
  calls: number;
  outcomes: Record<string, number>;
  retries: number;
  input_tokens: number;
  output_tokens: number;
  cost_cents_estimated: number;
  calls_cost_unavailable: number;
  latency_ms_p50: number | null;
  latency_ms_p95: number | null;
  error_rate: number | null;
}

export interface TutorTurnRow {
  turn_id: string;
  thread_id: string;
  turn_no: number;
  mode: string;
  route: string;
  leak_check: string | null;
  failure_code: string | null;
  suspected_content_error: boolean;
  issue_id: string | null;
  model: string | null;
  prompt_version: string | null;
  policy_version: string;
  latency_ms: number | null;
  learner_feedback: string | null;
  source_refs: Record<string, unknown>[];
  created_at: string;
  question: string | null;
  answer: string | null;
}

export interface DataHealth {
  generated_at: string;
  ingestion: {
    max_seq: number;
    last_received_at: string | null;
    events_24h: number;
    client_events_24h: number;
    clock_skew_clamped_24h: number;
    synthetic_events_total: number;
  };
  consumers: {
    consumer: string;
    last_seq: number;
    lag_events: number;
    last_success_at: string | null;
    events_processed: number;
    duplicates_suppressed: number;
    error_count: number;
    last_error: string | null;
  }[];
  recent_runs: {
    run_id: string;
    job: string;
    kind: string;
    status: string;
    dry_run: boolean;
    started_at: string;
    finished_at: string | null;
    processed: number;
    watermark_seq: number | null;
    discrepancies: Record<string, unknown>[];
    error: string | null;
  }[];
  failed_runs_24h: number;
  pending_erasures: number;
}

interface PageOf<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

const LA = "/admin/learning-analytics";
const CC = "/admin/content-catalog";

export const learningApi = {
  metricDefinitions: () =>
    http.get<{ reporting_timezone: string; metrics: MetricDefinition[] }>(`${LA}/metric-definitions`),
  overview: (params: Query) => http.get<Overview>(`${LA}/overview`, params),
  cohorts: (params: Query) => http.get<Cohorts>(`${LA}/cohorts`, params),
  dataHealth: () => http.get<DataHealth>(`${LA}/data-health`),
  learners: (params: Query) => http.get<PageOf<LearnerRow>>(`${LA}/learners`, params),
  learner: (userId: string) => http.get<LearnerDetail>(`${LA}/learners/${userId}`),
  growth: (userId: string, params: Query) => http.get<Growth>(`${LA}/learners/${userId}/growth`, params),
  evidence: (userId: string, params: Query) =>
    http.get<{ items: EvidenceRow[]; next_before: string | null }>(`${LA}/learners/${userId}/evidence`, params),
  timeline: (userId: string, params: Query) =>
    http.get<{ items: TimelineRow[]; next_before_seq: number | null }>(`${LA}/learners/${userId}/timeline`, params),
  sessionTrace: (userId: string, sessionId: string) =>
    http.get<SessionTrace>(`${LA}/learners/${userId}/sessions/${sessionId}`),
  content: (params: Query) =>
    http.get<PageOf<ContentDiagnosticRow> & { review_backlog: Record<string, number>; open_issues: number }>(`${LA}/content`, params),
  recommendations: (params: Query) => http.get<RecDiagnostics>(`${LA}/recommendations`, params),
  traces: (params: Query) => http.get<{ items: TraceSummary[] }>(`${LA}/traces`, params),
  simulate: (body: { user_id: string; track: string; activity_count?: number; topic_preferences?: string[]; band_override?: number }) =>
    http.post<SimulationResult>(`${LA}/simulate`, body),
  topics: () => http.get<{ items: { topic_id: string; name_ko: string }[] }>(`${LA}/topics`),
  createExport: (body: { report: "cohorts" | "content" | "proficiency"; filters: Record<string, unknown> }) =>
    http.post<{ export_id: string; row_count: number; expires_at: string }>(`${LA}/exports`, body),
  downloadExport: (exportId: string) =>
    http.get<string>(`${LA}/exports/${exportId}`, undefined, { responseType: "text" }),

  // Content catalogue
  versions: (params: Query) => http.get<PageOf<ContentVersionSummary>>(`${CC}/versions`, params),
  version: (versionId: string) => http.get<ContentVersionDetail>(`${CC}/versions/${versionId}`),
  submitVersion: (versionId: string) => http.post<ContentVersionDetail>(`${CC}/versions/${versionId}/submit`),
  reviewVersion: (versionId: string, body: { decision: string; checklist: Record<string, boolean>; note?: string }) =>
    http.post<ContentVersionDetail>(`${CC}/versions/${versionId}/reviews`, body),
  publishVersion: (versionId: string, reason?: string) =>
    http.post<ContentVersionDetail>(`${CC}/versions/${versionId}/publish`, { reason }),
  retireVersion: (versionId: string, body: { reason: string; severity: "normal" | "critical" }) =>
    http.post<ContentVersionDetail>(`${CC}/versions/${versionId}/retire`, body),
  blindView: (versionId: string) =>
    http.get<{ version_id: string; item_kind: string; task_type: string; band: number; public_payload: Record<string, unknown>; answer_format_hint: string }>(`${CC}/versions/${versionId}/blind`),
  blindSolve: (versionId: string, body: { answer: string; note?: string }) =>
    http.post<{ review_id: string; agrees_with_key: boolean }>(`${CC}/versions/${versionId}/blind-solve`, body),
  coverage: (params: Query) => http.get<Coverage>(`${CC}/coverage`, params),

  // AI ops
  aiFeatures: () => http.get<{ rate_card_version: string; currency: string; features: AiFeature[] }>("/admin/ai/features"),
  updateAiFeature: (feature: string, body: { enabled: boolean; reason: string; per_user_daily_cents?: number | null; monthly_cents?: number | null }) =>
    http.put<{ feature: string; enabled: boolean }>(`/admin/ai/features/${feature}`, body),
  aiUsage: (days: number) =>
    http.get<{ window_days: number; currency: string; rate_card_version: string; cost_note: string; groups: AiUsageGroup[]; legacy_unattributed: { calls: number; cost_cents: number; by_purpose: Record<string, number> } }>("/admin/ai/usage", { days }),
  tutorTurns: (params: Query) =>
    http.get<PageOf<TutorTurnRow> & { transcripts_included: boolean }>("/admin/ai/tutor/turns", params),
  reviewTutorTurn: (turnId: string, body: { correct: boolean; grounded: boolean; leaked_answer: boolean; note?: string }) =>
    http.post<{ review_id: string }>(`/admin/ai/tutor/turns/${turnId}/reviews`, body),
  tutorReliability: () =>
    http.get<{ overall: TutorReliability; by_route: Record<string, TutorReliability>; learner_satisfaction: { up: number; down: number }; note: string }>("/admin/ai/tutor/reliability"),
};

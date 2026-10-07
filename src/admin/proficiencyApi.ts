import { http } from "../lib/http";

/** Admin: evidence-based proficiency (`/admin/proficiency`). */

type Query = Record<string, string | number | boolean | undefined>;
export type Bi = { ko: string; en: string };
export type ProficiencyTrack = "conversation" | "topik";

export interface ProficiencyRow {
  user_id: string;
  nickname: string | null;
  email: string;
  track: ProficiencyTrack;
  status: "unassessed" | "insufficient_evidence" | "provisional" | "confirmed";
  confirmed_level: number | null;
  provisional_level: number | null;
  target_level: number | null;
  study_level: number | null;
  basis: string | null;
  coverage: { confirmed: number; total: number; pct: number; target_level: number } | null;
  growth: { period_days: number; status: string; change_pp: number | null; segmented: boolean };
  last_eligible_at: string | null;
  days_since_evidence: number | null;
  stalled: boolean;
  assessment_issues: number;
  main_blocking: string | null;
  main_blocking_label: Bi | null;
  last_decision_kind: string | null;
}

export interface DecisionView {
  decision_id: string;
  track: ProficiencyTrack;
  kind: string;
  applied: boolean;
  rollout_mode: string;
  from_level: number | null;
  to_level: number | null;
  from_status: string;
  to_status: string;
  target_level: number | null;
  policy_version: string;
  framework_version: string;
  gates: { gate: string; passed: boolean; detail?: Record<string, unknown> }[];
  blocking: string[];
  explanation: Bi & { missing_capabilities?: { capability_id: string; status: string; missing: string[]; independent_successes: number }[] };
  reward_points: number;
  actor_id: string | null;
  reason: string | null;
  trigger_session_id: string | null;
  decided_at: string;
}

export interface CapabilityView {
  capability_id: string;
  label: Bi;
  success_criteria: Bi;
  status: "not_assessed" | "in_progress" | "needs_reconfirmation" | "confirmed";
  independent_successes: number;
  required_successes: number;
  situations: number;
  required_situations: number;
  study_days: number;
  required_study_days: number;
  delayed_confirmed: boolean;
  delayed_check_available_at: string | null;
  valid_failures: number;
  latest_valid_outcome: string | null;
  missing: string[];
}

export interface ConversationView {
  status: ProficiencyRow["status"];
  confirmed_level: number | null;
  provisional_level: number | null;
  target_level: number | null;
  at_maximum: boolean;
  study_level: number | null;
  validation_status: string;
  last_decision: DecisionView | null;
  next_level: {
    level: number;
    can_do: Bi;
    capabilities: CapabilityView[];
    coverage: { confirmed: number; total: number; pct: number };
    checklist: { pct: number; items: { item_id: string; done: boolean }[] };
    gates: { gate: string; label: Bi; passed: boolean; detail: Record<string, unknown> }[];
    ready: boolean;
    integrative: { result: string; session_id: string; overall: number | null; reasons: string[] } | null;
    unseen_tasks_left: number;
  } | null;
  next_activity: { kind: string; reason: Bi; available_at?: string };
}

export interface TopikView {
  status: ProficiencyRow["status"];
  confirmed_grade: number | null;
  provisional_grade: number | null;
  target_grade: number | null;
  basis: string | null;
  readiness: Record<"I" | "II", {
    status: string;
    grade: number | null;
    basis: string;
    reasons: string[];
    weak_sections: string[];
    latest_section_scores: Record<string, number | null>;
  }>;
  mocks_taken: number;
}

export interface ProficiencyDetail {
  user: { user_id: string; nickname: string | null; email: string };
  conversation: ConversationView;
  topik: TopikView;
  states: Record<string, { status: string; confirmed_level: number | null; provisional_level: number | null; confirmed_at: string | null; policy_version: string | null }>;
  decisions: DecisionView[];
  level_history: { track: string; from_level: number; to_level: number; source: string; label: Bi; kind: string; occurred_at: string }[];
  issues: { technical: number; pending_scoring: number; uncertain: number; integrity_flags: number; performance_gaps: number };
  dimension_trends: { target_level: number; rubric_version: string; dimension: string; observations: number; series: { at: string; score: number; trusted: boolean }[] }[];
  how_calculated: { manual: string; policy_version: string; framework_version: string };
  can_correct: boolean;
  can_read_transcripts: boolean;
}

export interface EvidenceItem {
  observation_id?: string;
  kind?: "mock";
  session_id: string;
  occurred_at?: string;
  started_at?: string;
  completed_at?: string | null;
  local_date?: string;
  level?: number;
  capability_id?: string;
  capability_label?: Bi | null;
  outcome?: string;
  rating?: number | null;
  family_id?: string;
  situation_id?: string;
  counted?: boolean;
  valid?: boolean;
  exclusion_reason?: string | null;
  exclusion_label?: Bi | null;
  eligible?: boolean;
  scorer_trusted?: boolean;
  assisted?: boolean;
  invalidated_at?: string | null;
  invalidation_reason?: string | null;
  scorer?: { provider: string | null; model: string | null; prompt_version: string | null; rubric_version: string; speech_provider: string | null } | null;
  dimension_scores?: Record<string, number | null> | null;
  transcript?: string[] | null;
  spec_version?: string | null;
  status?: string;
  result?: Record<string, unknown> | null;
}

export interface GrowthView {
  track: ProficiencyTrack;
  period_days: number;
  growth_version: string;
  coverage_change: {
    status: "ok" | "insufficient_baseline" | "no_data";
    change_pp: number | null;
    baseline_pct: number | null;
    current_pct: number | null;
    baseline_at: string | null;
    current_at: string | null;
    target_level: number | null;
    policy_version: string | null;
    segmented: boolean;
    weekly_rate_pp: number | null;
  };
  series: { at: string; target_level: number; policy_version: string; pct: number; confirmed: number; total: number }[];
  newly_confirmed: { capability_id: string; level: number; policy_version: string; first_confirmed_at: string; label: Bi | null }[];
  score_trends: { target_level: number; rubric_version: string; task_kind: string; observations: number; first: number; last: number; change: number | null; limitation: string }[];
  delayed_retention: { numerator: number; denominator: number; rate: number | null };
  promotions: DecisionView[];
}

export interface ValidationReport {
  ratings: { total: number; human: number; model: number; by_split: Record<string, number> };
  human_human: Agreement;
  model_vs_human: Record<string, Record<string, Agreement>>;
  by_background_proxy: Record<string, Agreement>;
  by_recording_condition: Record<string, Agreement>;
  leakage: { learners_in_both_splits: string[]; families_in_both_splits: string[] };
  post_promotion: { promoted_learners: number; observations: number; success_rate: number | null };
  status: string;
  claim: Bi;
}
export interface Agreement {
  n: number;
  exact: number | null;
  adjacent: number | null;
  mean_abs_diff: number | null;
}

export interface PolicyView {
  conversation: {
    framework_version: string;
    bank_version: string;
    bank_validation_status: string;
    rubric_version: string;
    rubric: { dimension: string; label: string; weight: number }[];
    policy: Record<string, string | number>;
    levels: { level: number; can_do: string; capabilities: string[] }[];
  };
  topik: Record<string, unknown> & {
    policy_version: string;
    score_scale: string;
    form_validation: string;
    specs: { spec_version: string; format: string; total_max: number; grade_bands: number[][]; delivered: boolean }[];
  };
  provenance: { eligible_activity_types: string[]; excluded_sources: string[] };
  manual: string;
}

export interface Cohort {
  track: ProficiencyTrack;
  denominator: number;
  learners_without_record: number;
  by_status: Record<string, number>;
  confirmed_by_level: Record<string, number>;
  policy_versions: Record<string, number>;
  note: Bi;
}

const P = "/admin/proficiency";

export const proficiencyAdminApi = {
  learners: (params: Query) =>
    http.get<{ items: ProficiencyRow[]; total: number; page: number; page_size: number }>(`${P}/learners`, params),
  learner: (userId: string) => http.get<ProficiencyDetail>(`${P}/learners/${userId}`),
  evidence: (userId: string, params: Query) =>
    http.get<{ items: EvidenceItem[]; next_before: string | null }>(`${P}/learners/${userId}/evidence`, params),
  growth: (userId: string, params: Query) => http.get<GrowthView>(`${P}/learners/${userId}/growth`, params),
  cohort: (track: ProficiencyTrack) => http.get<Cohort>(`${P}/cohort`, { track }),
  policy: () => http.get<PolicyView>(`${P}/policy`),
  validation: () => http.get<ValidationReport>(`${P}/validation`),
  correct: (userId: string, body: { track: ProficiencyTrack; confirmed_level: number | null; provisional_level: number | null; reason: string }) =>
    http.post<{ decision_id: string }>(`${P}/learners/${userId}/corrections`, body),
  reprocess: (userId: string, body: { track: ProficiencyTrack; reason: string }) =>
    http.post<{ decisions: string[] }>(`${P}/learners/${userId}/reprocess`, body),
  invalidate: (observationId: string, reason: string) =>
    http.post<{ observation_id: string }>(`${P}/observations/${observationId}/invalidate`, { reason }),
};

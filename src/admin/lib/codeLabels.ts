/**
 * Korean names for internal codes the server reports — payment failure
 * classes, tutor checks, session shortfalls, learning-event fields. Each
 * table mirrors a value set in hangyul-api (named per table). A code the
 * portal does not know yet is shown as written by `codeLabel`, so a value
 * added on the server stays visible rather than vanishing.
 */

/** The label for `code` in `labels`, else the code itself ("—" for none). */
export function codeLabel(labels: Record<string, string>, code: string | null | undefined): string {
  if (code == null || code === "") return "—";
  return labels[code] ?? code;
}

/** `payment_methods.domain.entities.FailureClass`. */
export const PAYMENT_FAILURE_LABEL: Record<string, string> = {
  insufficient_funds: "잔액 부족",
  card_expired: "카드 유효기간 만료",
  method_revoked: "결제 수단 해지됨",
  declined_generic: "카드사 승인 거절",
  provider_outage: "결제사 장애",
  currency_mismatch: "결제 통화 불일치",
  billing_key_unreadable: "저장된 결제 정보를 읽을 수 없음",
  unknown: "알 수 없는 오류",
};

/** `tutor.domain.policy.check_leak` reasons (`clean` when nothing leaked). */
export const TUTOR_LEAK_LABEL: Record<string, string> = {
  clean: "정답 노출 없음",
  mentions_correct_option_text: "정답 선택지 내용을 언급",
  states_correct_option: "정답 선택지를 직접 말함",
  eliminates_all_other_options: "다른 선택지를 모두 제외",
  contains_blank_answer: "빈칸 정답 포함",
  contains_full_sentence: "완성 문장 포함",
  claims_to_give_the_answer: "정답을 알려 준다고 말함",
};

/** `tutor.application.service` fallback codes: `offline_mode`, or `model_`
 * plus a `common.llm.gateway.GatewayOutcome`. */
export const TUTOR_FAILURE_LABEL: Record<string, string> = {
  offline_mode: "AI 미연결(오프라인 모드)",
  model_error: "AI 호출 오류",
  model_timeout: "AI 응답 시간 초과",
  model_schema_invalid: "AI 응답 형식 오류",
  model_budget_exhausted: "AI 사용 한도 소진",
  model_disabled: "AI 기능 꺼짐",
  model_circuit_open: "AI 일시 차단(연속 실패)",
};

/** `study_sessions.domain.assembly` shortfall reasons. */
export const SHORTFALL_LABEL: Record<string, string> = {
  no_eligible_content: "쓸 수 있는 문항 없음",
  insufficient_eligible_inventory: "조건에 맞는 문항 부족",
};

/** `study_sessions` session status. */
export const SESSION_STATUS_LABEL: Record<string, string> = {
  active: "진행 중",
  completed: "완료",
  abandoned: "중단",
  expired: "만료",
};

/** `study_sessions` revision cause. */
export const REVISION_CAUSE_LABEL: Record<string, string> = {
  initial: "처음 구성",
  customization: "맞춤화",
  undo: "되돌림",
  withdrawal: "콘텐츠 회수",
};

/* TOPIK readiness (`proficiency.domain.topik`). */

/** `ReadinessEvaluation.basis`. */
export const READINESS_BASIS_LABEL: Record<string, string> = {
  app_mock_unvalidated: "앱 모의평가(미검증 양식)",
  listening_reading_only: "듣기·읽기만(쓰기 미평가) — 급수 판정 안 함",
};

/** Why a mock did not (yet) support a readiness grade. */
export const READINESS_REASON_LABEL: Record<string, string> = {
  ineligible_source: "판정에 쓸 수 없는 응시",
  scorer_untrusted: "신뢰되지 않은 채점",
  form_incomplete: "모든 문항을 풀지 않음",
  over_time: "제한 시간 초과",
  outside_window: "인정 기간 밖",
  unsupported_spec: "지원하지 않는 양식",
  second_mock_on_separate_day_needed: "다른 날 한 번 더 응시 필요",
  below_lowest_grade_in_recent_mock: "최근 모의평가가 최저 급수 미만",
};

/** `Section`. */
export const TOPIK_SECTION_LABEL: Record<string, string> = {
  listening: "듣기",
  reading: "읽기",
  writing: "쓰기",
};

/** A TOPIK mock session's status. */
export const MOCK_STATUS_LABEL: Record<string, string> = {
  active: "응시 중",
  completed: "완료",
  abandoned: "중단",
};

/* Content catalogue (`content_catalog.domain.entities` and its writers). */

/** Sentence task types; a quiz's task type is its TOPIK question type
 * (`topikTypeLabel`) or `quiz_<answer format>`. */
export const SENTENCE_TASK_LABEL: Record<string, string> = {
  sentence_speak: "문장 말하기",
  sentence_blank: "빈칸 채우기",
  quiz_single_choice: "객관식 문제",
  quiz_short_answer: "단답형 문제",
  quiz_writing: "쓰기 문제",
};

/** `AuthoringMethod`. */
export const AUTHORING_METHOD_LABEL: Record<string, string> = {
  human: "직접 작성",
  ai_generated: "AI 생성",
  ai_assisted: "AI 보조 작성",
  legacy_import: "기존 콘텐츠 가져옴",
};

/** `SourceUse`. */
export const SOURCE_USE_LABEL: Record<string, string> = {
  original: "자체 제작",
  licensed: "라이선스 자료",
  official: "공식 자료",
  unknown: "출처 미상",
};

/** A content explanation's kind. */
export const EXPLANATION_KIND_LABEL: Record<string, string> = {
  explanation: "해설",
  hint: "힌트",
  distractor_rationale: "오답 선택지 설명",
};

/** `RetirementSeverity` and a validation finding's severity. */
export const SEVERITY_LABEL: Record<string, string> = {
  normal: "일반",
  critical: "심각",
  error: "오류(게시 불가)",
  warning: "경고",
};

/** `ReviewDecision`. */
export const REVIEW_DECISION_LABEL: Record<string, string> = {
  approved: "승인",
  changes_requested: "수정 요청",
  rejected: "반려",
};

/** A content version's lifecycle action. */
export const CONTENT_ACTION_LABEL: Record<string, string> = {
  submit: "검수 요청",
  auto_submit: "자동 검수 요청",
  publish: "게시",
  auto_publish: "자동 게시",
  request_changes: "수정 요청",
  reject: "반려",
  retire: "회수",
  supersede: "새 버전으로 대체",
  head_edit: "본문 수정",
  legacy_import: "기존 콘텐츠 가져옴",
  package_import: "콘텐츠 업데이트로 가져옴",
  factory_generate: "AI 생성",
};

/* Learning-event payload fields (`learning_analytics.application.event_catalog`). */

/** `EvidencePolicy`. */
export const EVIDENCE_POLICY_LABEL: Record<string, string> = {
  independent: "독립",
  assisted: "도움 받음",
  revealed: "정답 공개 후",
  retry: "재시도",
  custom_practice: "맞춤 연습",
  excluded: "제외",
};

/** `SkillStateUpdated.cause`. */
export const STATE_CAUSE_LABEL: Record<string, string> = {
  evidence: "새 증거",
  correction: "콘텐츠 정정",
  recompute: "재계산",
  review_decay: "복습 일정",
};

/** Every `reason` an event carries (objective change, skip, evidence
 * exclusion). */
export const EVENT_REASON_LABEL: Record<string, string> = {
  learner_choice: "회원 선택",
  placement: "배치 평가",
  promotion: "승급",
  admin: "관리자",
  learner: "회원",
  withdrawn_content: "콘텐츠 회수",
  replaced_by_customization: "맞춤화로 교체",
  answer_revealed: "정답 공개",
  repeat_attempt: "반복 시도",
  custom_practice: "맞춤 연습",
  invalidated_content: "무효 처리된 콘텐츠",
  legacy_unreviewed: "기존 콘텐츠(미검수)",
  no_skill_link: "학습 기술 연결 없음",
};

/** `HintRequested.route` and `TutorEvent.route`. */
export const EVENT_ROUTE_LABEL: Record<string, string> = {
  stored: "검수된 힌트",
  tutor: "AI 튜터",
  stored_hint: "검수된 힌트",
  stored_explanation: "검수된 해설",
  grounded_generation: "AI 생성(근거 기반)",
  fallback: "대체 응답",
  refused: "거절(정답 노출 방지)",
};

/** `TutorEvent.mode`. */
export const TUTOR_MODE_LABEL: Record<string, string> = {
  hint_only: "힌트만",
  explain: "해설",
  follow_up: "추가 질문",
};

/** `RecommendationFallback.step` (and a customization's fallback step). */
export const FALLBACK_STEP_LABEL: Record<string, string> = {
  exact: "요청 그대로",
  alternative: "비슷한 대안으로 (차이 안내)",
  variant: "변형 문항으로",
  live_custom: "실시간 맞춤 생성",
  clarify: "회원에게 다시 질문",
  preserve: "기존 세션 유지",
  shorter_session: "더 짧은 세션",
  none: "해당 없음",
};

/** `ReviewCompleted.outcome` and `ModelUsageRecorded.outcome`. */
export const EVENT_OUTCOME_LABEL: Record<string, string> = {
  correct: "정답",
  incorrect: "오답",
  assisted: "도움 받아 정답",
  ok: "성공",
  error: "오류",
  timeout: "시간 초과",
  schema_invalid: "응답 형식 오류",
  budget_exhausted: "한도 소진",
  disabled: "꺼짐",
};

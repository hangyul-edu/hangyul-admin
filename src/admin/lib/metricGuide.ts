/**
 * Learning metrics in plain words.
 *
 * The server's metric dictionary (GET /admin/learning/metric-definitions) is
 * the precise definition — numerator, denominator, inclusions, limits — and is
 * still one click away on every metric. This is the layer above it: what an
 * operator reads first. A short name, one sentence on what the number means,
 * and which direction is good, so a change can be shown as better or worse
 * rather than as a bare sign.
 */

export type GoodDirection = "up" | "down" | "neutral";

interface MetricGuide {
  /** Short, plain name. */
  name: string;
  /** One sentence: what the number tells you. */
  meaning: string;
  good: GoodDirection;
}

const METRIC_GUIDE:Record<string, MetricGuide> = {
  active_learners: {
    name: "학습한 회원",
    meaning: "기간 중 문제를 풀거나 복습하거나 튜터에게 질문한 회원 수예요.",
    good: "up",
  },
  session_completion_rate: {
    name: "학습 완료율",
    meaning: "시작한 학습 세션을 끝까지 마친 비율이에요. 시작 후 하루가 지난 세션만 셉니다.",
    good: "up",
  },
  independent_accuracy: {
    name: "스스로 맞힌 비율",
    meaning: "힌트나 정답 보기 없이 첫 시도에 맞힌 비율이에요. 실력을 가장 잘 보여 줘요.",
    good: "up",
  },
  assistance_rate: {
    name: "도움 받은 비율",
    meaning: "문제를 풀다 힌트를 보거나 정답을 확인한 비율이에요. 너무 높으면 난이도가 높다는 신호예요.",
    good: "down",
  },
  review_success_rate: {
    name: "복습 정답률",
    meaning: "예정된 복습에서 도움 없이 맞힌 비율이에요. 배운 내용이 남아 있는지 보여 줘요.",
    good: "up",
  },
  unwanted_repetition_rate: {
    name: "불필요한 반복",
    meaning: "복습 일정이 아닌데 최근 2주 안에 같은 내용이 다시 나온 비율이에요.",
    good: "down",
  },
  mastery_change: {
    name: "숙달도 변화",
    meaning: "기간 동안 추정 숙달도가 얼마나 올랐는지예요.",
    good: "up",
  },
  delayed_retention_rate: {
    name: "장기 기억 유지율",
    meaning: "시간이 지난 뒤 다시 확인했을 때도 맞힌 비율이에요.",
    good: "up",
  },
  transfer_performance: {
    name: "응용력",
    meaning: "처음 보는 유형의 문제를 스스로 맞힌 비율이에요.",
    good: "up",
  },
  return_retention_d1: {
    name: "다음 날 재방문",
    meaning: "처음 학습한 다음 날 다시 학습한 회원 비율이에요.",
    good: "up",
  },
  return_retention_d7: {
    name: "7일 뒤 재방문",
    meaning: "처음 학습하고 7일째 되는 날 다시 학습한 회원 비율이에요.",
    good: "up",
  },
  return_retention_d30: {
    name: "30일 뒤 재방문",
    meaning: "처음 학습하고 30일째 되는 날 다시 학습한 회원 비율이에요.",
    good: "up",
  },
  customization_success_rate: {
    name: "맞춤 요청 반영률",
    meaning: "회원이 요청한 학습 조정(주제·난이도 등)이 실제 세션에 반영된 비율이에요.",
    good: "up",
  },
  retrieval_fulfillment_rate: {
    name: "검수 콘텐츠로 충족",
    meaning: "맞춤 요청을 AI 생성 없이 검수된 콘텐츠만으로 채운 비율이에요.",
    good: "up",
  },
  tutor_reliability: {
    name: "튜터 답변 정확도",
    meaning: "사람이 검수한 튜터 답변 중 정확하고 근거가 있는 비율이에요.",
    good: "up",
  },
  ai_cost_per_session: {
    name: "학습 1회당 AI 비용",
    meaning: "학습 세션 한 번에 드는 AI 사용 비용의 추정치예요.",
    good: "down",
  },
  content_defect_rate: {
    name: "콘텐츠 오류율",
    meaning: "학습자에게 보인 콘텐츠 중 오류가 확인된 비율이에요.",
    good: "down",
  },
};

function idOf(metricRef: string): string {
  return metricRef.split("@")[0];
}

export function metricGuide(metricRef: string): MetricGuide | undefined {
  return METRIC_GUIDE[idOf(metricRef)];
}

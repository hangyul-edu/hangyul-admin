// Korean wording for the speech pipeline's enumerations, shared by the
// 음성 인식 테스트 sections so a provider or verdict reads the same everywhere.
import type { BadgeTone } from "../../components/kit";
import type { GradeVerdict, SttReason, TranscriptStatus } from "../../speechApi";

export const PROVIDER_TEXT: Record<string, string> = {
  whisper_local: "로컬 Whisper",
  google_cloud: "Google Cloud STT",
  mock: "모의 인식기",
};

export function providerLabel(provider: string | null | undefined): string {
  if (!provider) return "—";
  return PROVIDER_TEXT[provider] ?? provider;
}

/** Why this recogniser is active; `warn` marks the reasons an operator should look into. */
export const REASON_TEXT: Record<SttReason, { text: string; warn: boolean }> = {
  selected: { text: "설정에서 지정한 인식기를 사용합니다.", warn: false },
  auto_external_key: { text: "자동 선택: 외부 서비스 키가 설정되어 있어 Google Cloud STT를 사용합니다.", warn: false },
  auto_no_external_key: { text: "자동 선택: 외부 서비스 키가 없어 로컬 Whisper를 사용합니다.", warn: false },
  google_key_missing: { text: "Google Cloud STT가 지정되었지만 키가 없어 대체 인식기를 사용합니다.", warn: true },
  mock_allowed: { text: "모의 인식기가 허용된 환경이라 모의 인식기를 사용합니다.", warn: false },
  mock_refused: { text: "모의 인식기가 지정되었지만 이 환경에서는 허용되지 않아 대체 인식기를 사용합니다.", warn: true },
  unknown_provider: { text: "알 수 없는 인식기가 지정되어 기본 인식기를 사용합니다.", warn: true },
};

export function reasonText(reason: string | null | undefined): { text: string; warn: boolean } {
  if (!reason) return { text: "", warn: false };
  return REASON_TEXT[reason as SttReason] ?? { text: reason, warn: true };
}

export const MOCK_WARNING = "모의 인식기: 실제 음성을 인식하지 않습니다";

export const TRANSCRIPT_STATUS: Record<TranscriptStatus, { label: string; tone: BadgeTone }> = {
  ok: { label: "인식됨", tone: "success" },
  no_speech: { label: "음성 없음", tone: "warning" },
  failed: { label: "실패", tone: "danger" },
};

export function transcriptStatus(status: string): { label: string; tone: BadgeTone } {
  return TRANSCRIPT_STATUS[status as TranscriptStatus] ?? { label: status, tone: "neutral" };
}

export const VERDICT_TEXT: Record<GradeVerdict, { label: string; tone: BadgeTone }> = {
  correct: { label: "정답", tone: "success" },
  missed_words: { label: "단어 누락", tone: "warning" },
  bad_pronunciation: { label: "발음 불명확", tone: "warning" },
  unrelated_speech: { label: "다른 내용", tone: "danger" },
  no_speech: { label: "음성 없음", tone: "danger" },
  incorrect: { label: "오답", tone: "danger" },
};

export function verdictText(verdict: string): { label: string; tone: BadgeTone } {
  return VERDICT_TEXT[verdict as GradeVerdict] ?? { label: verdict, tone: "neutral" };
}

export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "—";
  return `${Math.round(ms).toLocaleString()} ms`;
}

export function formatConfidence(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value * 100)}%`;
}

export function formatSeconds(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  return `${(ms / 1000).toFixed(1)}초`;
}

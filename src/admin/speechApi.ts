// Typed client for the speech pipeline's admin diagnostics
// (/admin/speech/*) and the member-facing realtime session endpoints
// (/speech/*) the 음성 인식 테스트 page drives from the browser.
// Response shapes mirror the backend exactly; nothing is derived here.
import { http } from "../lib/http";

export type SttProvider = "whisper_local" | "google_cloud" | "mock";

export type SttReason =
  | "selected"
  | "auto_external_key"
  | "auto_no_external_key"
  | "google_key_missing"
  | "mock_allowed"
  | "mock_refused"
  | "unknown_provider";

/** Which recogniser is active and why; the Whisper fields exist only for local Whisper. */
export interface SttStatus {
  provider: SttProvider;
  requested: string;
  reason: SttReason;
  is_fallback: boolean;
  model: string | null;
  device?: string | null;
  compute_type?: string | null;
  loaded?: boolean | null;
  load_seconds?: number | null;
  load_error?: string | null;
  beam_size?: number | null;
  max_concurrency?: number | null;
}

export interface AgentWorker {
  worker_id: string;
  provider: string;
  model: string | null;
  model_loaded: boolean;
  started_at: string | null;
  last_seen_at: string | null;
  version: string | null;
  hostname: string | null;
  rooms_active: number;
}

export interface SpeechStatus {
  stt: SttStatus;
  pronunciation: { provider: string; azure_configured: boolean };
  livekit: {
    configured: boolean;
    url: string | null;
    reachable: boolean;
    latency_ms: number | null;
    error: string | null;
    rooms: number | null;
  };
  agent: { online: boolean; workers: AgentWorker[]; shared_secret_configured: boolean };
  recent: {
    window_minutes: number;
    transcripts: number;
    recognised: number;
    no_speech: number;
    failed: number;
    avg_latency_ms: number | null;
    last_error: string | null;
    last_transcript_at: string | null;
  };
  checked_at: string;
}

/** The recogniser a session will use, as the session endpoints report it. */
export interface SessionProvider {
  provider: SttProvider;
  model: string | null;
  requested: string;
  reason: SttReason;
  is_fallback: boolean;
  loaded?: boolean | null;
  device?: string | null;
  compute_type?: string | null;
}

export interface SpeechSession {
  session_id: string;
  room: string;
  url: string;
  token: string;
  identity: string;
  data_topic: string;
  expires_at: string;
  provider: SessionProvider;
  agent_online: boolean;
  agents: AgentWorker[];
}

export interface SpeechAvailability {
  realtime_available: boolean;
  livekit_configured: boolean;
  agent_online: boolean;
  provider: SessionProvider;
  data_topic: string;
}

export type TranscriptStatus = "ok" | "no_speech" | "failed";

export interface TranscriptView {
  transcript_id: string;
  session_id: string;
  seq: number;
  utterance_id: string;
  text: string;
  language: string | null;
  provider: string;
  model: string | null;
  confidence: number | null;
  status: TranscriptStatus;
  error: string | null;
  audio_duration_ms: number | null;
  speech_ms: number | null;
  latency_ms: number | null;
  created_at: string;
  consumed_at: string | null;
  consumed_purpose: string | null;
}

export interface SessionTranscripts {
  session_id: string;
  transcripts: TranscriptView[];
  last_seq: number;
}

export interface VoiceActivity {
  has_speech: boolean;
  speech_ms: number;
  total_ms: number;
  speech_ratio: number;
  segments: { start_ms: number; end_ms: number }[];
}

export interface TranscribeResult {
  text: string;
  provider: string;
  model: string | null;
  confidence: number | null;
  language: string | null;
  latency_ms: number;
  audio_duration_ms: number | null;
  source_container: string | null;
  voice_activity: VoiceActivity | null;
  no_speech: boolean;
}

export type GradeMode = "reading" | "exact";

export type GradeVerdict =
  | "correct"
  | "missed_words"
  | "bad_pronunciation"
  | "unrelated_speech"
  | "no_speech"
  | "incorrect";

export interface GradeRequest {
  transcript: string;
  expected: string;
  accepted: string[];
  mode: GradeMode;
}

export interface GradeResult {
  mode: GradeMode;
  correct: boolean;
  verdict: GradeVerdict;
  similarity: number | null;
  pronunciation_score: number | null;
  normalized_transcript: string[];
  normalized_expected: string[];
  explanation: string;
}

/* ---- Data messages the STT agent publishes into the LiveKit room ---- */

export type AgentMessage =
  | { type: "vad"; state: "speaking" }
  | { type: "vad"; state: "silence"; speech_ms: number }
  /** Answers the app's `stop` once everything heard before it has been reported. */
  | { type: "stopped"; in_flight: number }
  | { type: "vad_level"; probability: number; speaking: boolean }
  | { type: "transcribing"; utterance_id: string; audio_duration_ms: number }
  | {
      type: "transcript";
      utterance_id: string;
      transcript_id: string | null;
      seq: number | null;
      delivered: boolean;
      text: string;
      status: TranscriptStatus;
      error: string | null;
      provider: string;
      model: string | null;
      confidence: number | null;
      latency_ms: number | null;
      audio_duration_ms: number | null;
      speech_ms: number | null;
    };

export const speechApi = {
  status: () => http.get<SpeechStatus>("/admin/speech/status"),
  availability: () => http.get<SpeechAvailability>("/speech/availability"),
  openSession: (language = "ko-KR") =>
    http.post<SpeechSession>("/speech/sessions", { purpose: "admin_test", context: {}, language }),
  endSession: (sessionId: string) => http.post<void>(`/speech/sessions/${sessionId}/end`),
  sessionTranscripts: (sessionId: string, afterSeq = 0) =>
    http.get<SessionTranscripts>(`/speech/sessions/${sessionId}/transcripts`, { after_seq: afterSeq }),
  transcribe: (audio: Blob, filename: string) => {
    const form = new FormData();
    form.append("audio", audio, filename);
    return http.upload<TranscribeResult>("/admin/speech/transcribe", form);
  },
  grade: (body: GradeRequest) => http.post<GradeResult>("/admin/speech/grade", body),
};

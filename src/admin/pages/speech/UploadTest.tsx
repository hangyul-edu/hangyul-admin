// The fallback path: record a short clip with MediaRecorder and send it to
// POST /admin/speech/transcribe, which runs the recogniser without LiveKit.
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Mic, Square, Upload } from "lucide-react";
import { Badge, Button, Card } from "../../components/kit";
import { Notice } from "../../components/insights";
import { speechApi } from "../../speechApi";
import type { TranscribeResult } from "../../speechApi";
import { errorMessage } from "../../../lib/http";
import { Facts } from "./Facts";
import { formatConfidence, formatMs, formatSeconds, providerLabel } from "./labels";

export const MAX_RECORD_MS = 15_000;

/** The first container this browser can record, in the order the server prefers. */
const CANDIDATES: { mime: string; ext: string }[] = [
  { mime: "audio/webm;codecs=opus", ext: "webm" },
  { mime: "audio/ogg;codecs=opus", ext: "ogg" },
  { mime: "audio/mp4", ext: "m4a" },
];

function pickContainer(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return null;
  return CANDIDATES.find((c) => MediaRecorder.isTypeSupported(c.mime)) ?? null;
}

type State =
  | { kind: "idle" }
  | { kind: "recording"; startedAt: number }
  | { kind: "uploading" }
  | { kind: "done"; result: TranscribeResult; blobBytes: number }
  | { kind: "error"; message: string };

export function UploadTest({ canWrite }: { canWrite: boolean }) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimer = useRef<number | null>(null);
  const tickTimer = useRef<number | null>(null);
  const mounted = useRef(true);

  const supported =
    typeof MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function";

  const clearTimers = () => {
    if (stopTimer.current !== null) window.clearTimeout(stopTimer.current);
    if (tickTimer.current !== null) window.clearInterval(tickTimer.current);
    stopTimer.current = null;
    tickTimer.current = null;
  };

  const releaseStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimers();
      const rec = recorderRef.current;
      recorderRef.current = null;
      if (rec && rec.state !== "inactive") {
        try {
          rec.stop();
        } catch {
          // Already stopped.
        }
      }
      releaseStream();
    };
  }, []);

  const upload = async (blob: Blob, ext: string) => {
    setState({ kind: "uploading" });
    try {
      const result = await speechApi.transcribe(blob, `recording.${ext}`);
      if (mounted.current) setState({ kind: "done", result, blobBytes: blob.size });
    } catch (e) {
      if (mounted.current) setState({ kind: "error", message: errorMessage(e) });
    }
  };

  const startRecording = async () => {
    const container = pickContainer();
    if (!container) {
      setState({ kind: "error", message: "이 브라우저는 Opus/WebM, Ogg, MP4 중 어느 형식으로도 녹음할 수 없습니다." });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      setState({ kind: "error", message: `마이크를 열지 못했습니다: ${e instanceof Error ? e.message : String(e)}` });
      return;
    }
    if (!mounted.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType: container.mime });
    recorderRef.current = recorder;
    recorder.ondataavailable = (ev: BlobEvent) => {
      if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    recorder.onerror = () => {
      clearTimers();
      releaseStream();
      if (mounted.current) setState({ kind: "error", message: "녹음 중 오류가 발생했습니다." });
    };
    recorder.onstop = () => {
      clearTimers();
      releaseStream();
      recorderRef.current = null;
      if (!mounted.current) return;
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || container.mime });
      chunksRef.current = [];
      if (blob.size === 0) {
        setState({ kind: "error", message: "녹음된 데이터가 없습니다. 마이크 권한과 입력 장치를 확인하세요." });
        return;
      }
      void upload(blob, container.ext);
    };
    const startedAt = Date.now();
    setElapsed(0);
    setState({ kind: "recording", startedAt });
    recorder.start(250);
    tickTimer.current = window.setInterval(() => setElapsed(Date.now() - startedAt), 200);
    stopTimer.current = window.setTimeout(() => stopRecording(), MAX_RECORD_MS);
  };

  const stopRecording = () => {
    clearTimers();
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  };

  const recording = state.kind === "recording";
  const disabledReason = !canWrite
    ? "녹음 업로드 테스트는 settings:write 권한이 필요합니다. 현재 계정은 조회만 할 수 있습니다."
    : !supported
      ? "이 브라우저는 녹음(MediaRecorder)을 지원하지 않습니다."
      : null;

  return (
    <section className="hgadm-speech__section" aria-labelledby="speech-upload-title">
      <div className="hgadm-speech__section-head">
        <h2 id="speech-upload-title">녹음 업로드 테스트</h2>
        <span className="hgadm-muted hgadm-text-xs">
          LiveKit 없이 인식기만 확인합니다. 최대 15초를 녹음해 서버에 올리고 결과를 받습니다.
        </span>
      </div>
      <Card title="녹음">
        <div className="hgadm-stack">
          {disabledReason && (
            <Notice tone="warn" icon={AlertTriangle} title="녹음 업로드 테스트를 쓸 수 없습니다">
              {disabledReason}
            </Notice>
          )}
          <div className="hgadm-row hgadm-row--wrap">
            {recording ? (
              <Button variant="danger" onClick={stopRecording}>
                <Square size={14} aria-hidden /> 녹음 중지 · 업로드
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => void startRecording()}
                disabled={disabledReason !== null || state.kind === "uploading"}
                loading={state.kind === "uploading"}
              >
                <Mic size={15} aria-hidden /> 녹음 시작
              </Button>
            )}
            {recording && (
              <span className="hgadm-speech__elapsed hgadm-tabular" role="timer" aria-live="off">
                <span className="hgadm-speech__rec-dot" aria-hidden /> {(elapsed / 1000).toFixed(1)}초 / 15초
              </span>
            )}
            {state.kind === "uploading" && (
              <span className="hgadm-muted hgadm-text-sm">
                <Upload size={14} aria-hidden /> 업로드하고 인식하는 중…
              </span>
            )}
          </div>
          {state.kind === "error" && (
            <Notice tone="danger" icon={AlertTriangle} title="인식하지 못했습니다">
              {state.message}
            </Notice>
          )}
          {state.kind === "done" && <UploadResult result={state.result} bytes={state.blobBytes} />}
        </div>
      </Card>
    </section>
  );
}

function UploadResult({ result, bytes }: { result: TranscribeResult; bytes: number }) {
  const va = result.voice_activity;
  const speech =
    va === null
      ? "—"
      : !va.has_speech
        ? "음성 없음"
        : `${formatSeconds(va.speech_ms)} / ${formatSeconds(va.total_ms)} (${Math.round(va.speech_ratio * 100)}%)`;
  return (
    <div className="hgadm-speech__result">
      {result.no_speech ? (
        <Notice tone="warn" icon={AlertTriangle} title="음성이 감지되지 않았습니다">
          녹음에서 말소리를 찾지 못했습니다. 마이크 입력 장치와 음량을 확인하세요.
        </Notice>
      ) : (
        <blockquote className="hgadm-speech__quote">{result.text || <span className="hgadm-muted">(빈 결과)</span>}</blockquote>
      )}
      <Facts
        label="인식 결과 정보"
        items={[
          [
            "인식기",
            <>
              <Badge tone={result.provider === "mock" ? "danger" : "success"} dot>{providerLabel(result.provider)}</Badge>
              {result.model && <span className="hgadm-cell-mono">{result.model}</span>}
            </>,
          ],
          ["신뢰도", formatConfidence(result.confidence)],
          result.language !== null && ["언어", result.language],
          ["인식 시간", formatMs(result.latency_ms)],
          ["녹음 길이", `${formatSeconds(result.audio_duration_ms)} · ${(bytes / 1024).toFixed(0)} KB`],
          ["음성 구간", va && va.segments.length > 1 ? `${speech} · ${va.segments.length}개 구간` : speech],
        ]}
      />
    </div>
  );
}

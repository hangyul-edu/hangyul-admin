// The realtime microphone test: opens a speech session, joins its LiveKit
// room, publishes the microphone and turns the STT agent's data messages into
// a transcript log. Polls the session's stored transcripts as a fallback so a
// missed data message still shows up.
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Room, RoomEvent } from "livekit-client";
import { speechApi } from "../../speechApi";
import type { AgentMessage, GradeVerdict, SpeechSession, TranscriptStatus, TranscriptView } from "../../speechApi";
import { ApiError, errorMessage } from "../../../lib/http";

export type Phase = "idle" | "opening" | "connecting" | "listening" | "speaking" | "transcribing" | "error";

export const PHASE_TEXT: Record<Phase, string> = {
  idle: "대기",
  opening: "세션 여는 중",
  connecting: "연결 중",
  listening: "듣는 중",
  speaking: "말하는 중",
  transcribing: "인식 중",
  error: "오류",
};

export interface TranscriptRow {
  key: string;
  at: string;
  utteranceId: string;
  transcriptId: string | null;
  seq: number | null;
  text: string;
  status: TranscriptStatus;
  error: string | null;
  provider: string;
  model: string | null;
  confidence: number | null;
  latencyMs: number | null;
  /** Browser-measured: from the agent's `vad silence` to its `transcript` message. */
  endToEndMs: number | null;
  delivered: boolean;
  /** Where the row came from: the room's data channel, or the API poll. */
  source: "data" | "poll";
  grade: { state: "pending" } | { state: "done"; verdict: GradeVerdict; explanation: string } | { state: "failed"; message: string } | null;
}

export interface ErrorEntry {
  at: string;
  message: string;
}

/** The 503 the session endpoint answers when LiveKit is unconfigured or unreachable. */
export function isRealtimeUnavailable(error: unknown): boolean {
  return error instanceof ApiError && error.code === "speech.realtime_unavailable";
}

function parseMessage(payload: Uint8Array): AgentMessage | null {
  try {
    const parsed = JSON.parse(new TextDecoder().decode(payload));
    return parsed && typeof parsed.type === "string" ? (parsed as AgentMessage) : null;
  } catch {
    return null;
  }
}

export function useRealtimeTest() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [session, setSession] = useState<SpeechSession | null>(null);
  const [vad, setVad] = useState({ level: 0, speaking: false });
  const [rows, setRows] = useState<TranscriptRow[]>([]);
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [realtimeUnavailable, setRealtimeUnavailable] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [expected, setExpected] = useState("");

  const roomRef = useRef<Room | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const expectedRef = useRef("");
  const silenceTimes = useRef<number[]>([]);
  const utteranceStarted = useRef<Map<string, number>>(new Map());
  const pendingTranscriptions = useRef(0);
  const polledSeq = useRef(0);
  const seenKeys = useRef<Map<string, string>>(new Map());
  const mounted = useRef(true);

  expectedRef.current = expected;

  const connected = phase === "listening" || phase === "speaking" || phase === "transcribing";

  const logError = useCallback((message: string) => {
    if (!mounted.current) return;
    setErrors((prev) => [{ at: new Date().toISOString(), message }, ...prev].slice(0, 50));
  }, []);

  const refreshDevices = useCallback(async (requestPermissions = false) => {
    try {
      const list = await Room.getLocalDevices("audioinput", requestPermissions);
      if (mounted.current) setDevices(list ?? []);
    } catch (e) {
      logError(`마이크 목록을 가져오지 못했습니다: ${errorMessage(e)}`);
    }
  }, [logError]);

  useEffect(() => {
    mounted.current = true;
    void refreshDevices(false);
    const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    const onChange = () => void refreshDevices(false);
    media?.addEventListener?.("devicechange", onChange);
    return () => {
      mounted.current = false;
      media?.removeEventListener?.("devicechange", onChange);
      // Unmount while connected: release the microphone and end the session
      // without touching state.
      const room = roomRef.current;
      const sessionId = sessionIdRef.current;
      roomRef.current = null;
      sessionIdRef.current = null;
      if (room) void room.disconnect().catch(() => undefined);
      if (sessionId) void speechApi.endSession(sessionId).catch(() => undefined);
    };
  }, [refreshDevices]);

  /** Grade a recognised line against 기대 답안, when one is set. */
  const gradeRow = useCallback((key: string, text: string, status: TranscriptStatus) => {
    const expectedText = expectedRef.current.trim();
    if (!expectedText) return;
    const update = (grade: TranscriptRow["grade"]) => {
      if (!mounted.current) return;
      setRows((prev) => prev.map((r) => (r.key === key ? { ...r, grade } : r)));
    };
    if (status !== "ok" || !text.trim()) {
      update({ state: "done", verdict: "no_speech", explanation: "인식된 음성이 없어 채점하지 않았습니다." });
      return;
    }
    update({ state: "pending" });
    speechApi
      .grade({ transcript: text, expected: expectedText, accepted: [], mode: "reading" })
      .then((result) => update({ state: "done", verdict: result.verdict, explanation: result.explanation }))
      .catch((e) => update({ state: "failed", message: errorMessage(e) }));
  }, []);

  const addRow = useCallback(
    (row: TranscriptRow) => {
      if (!mounted.current) return;
      const seen = seenKeys.current;
      const existingKey =
        (row.transcriptId ? seen.get(`t:${row.transcriptId}`) : undefined) ??
        (row.utteranceId ? seen.get(`u:${row.utteranceId}`) : undefined);
      if (existingKey !== undefined) {
        // Already shown (the data message beat the poll, or the other way
        // round); only fill in what the first copy lacked.
        if (row.transcriptId) seen.set(`t:${row.transcriptId}`, existingKey);
        setRows((prev) =>
          prev.map((r) =>
            r.key === existingKey
              ? {
                  ...r,
                  transcriptId: r.transcriptId ?? row.transcriptId,
                  seq: r.seq ?? row.seq,
                  endToEndMs: r.endToEndMs ?? row.endToEndMs,
                  delivered: r.delivered || row.delivered,
                }
              : r,
          ),
        );
        return;
      }
      if (row.transcriptId) seen.set(`t:${row.transcriptId}`, row.key);
      if (row.utteranceId) seen.set(`u:${row.utteranceId}`, row.key);
      setRows((prev) => [row, ...prev]);
      gradeRow(row.key, row.text, row.status);
    },
    [gradeRow],
  );

  const onMessage = useCallback(
    (payload: Uint8Array, topic: string | undefined, dataTopic: string) => {
      if (topic !== dataTopic) return;
      const msg = parseMessage(payload);
      if (!msg || !mounted.current) return;
      const now = performance.now();
      switch (msg.type) {
        case "vad_level":
          setVad({ level: Math.max(0, Math.min(1, msg.probability)), speaking: msg.speaking });
          break;
        case "vad":
          if (msg.state === "speaking") {
            setVad((v) => ({ ...v, speaking: true }));
            setPhase("speaking");
          } else {
            silenceTimes.current.push(now);
            setVad((v) => ({ ...v, speaking: false }));
            setPhase(pendingTranscriptions.current > 0 ? "transcribing" : "listening");
          }
          break;
        case "transcribing": {
          pendingTranscriptions.current += 1;
          const started = silenceTimes.current.shift();
          if (started !== undefined) utteranceStarted.current.set(msg.utterance_id, started);
          setPhase("transcribing");
          break;
        }
        case "transcript": {
          pendingTranscriptions.current = Math.max(0, pendingTranscriptions.current - 1);
          let started = utteranceStarted.current.get(msg.utterance_id);
          utteranceStarted.current.delete(msg.utterance_id);
          if (started === undefined) started = silenceTimes.current.shift();
          const endToEndMs = started !== undefined ? Math.round(now - started) : null;
          const row: TranscriptRow = {
            key: msg.transcript_id ?? `utt:${msg.utterance_id}`,
            at: new Date().toISOString(),
            utteranceId: msg.utterance_id,
            transcriptId: msg.transcript_id,
            seq: msg.seq,
            text: msg.text,
            status: msg.status,
            error: msg.error,
            provider: msg.provider,
            model: msg.model,
            confidence: msg.confidence,
            latencyMs: msg.latency_ms,
            endToEndMs,
            delivered: msg.delivered,
            source: "data",
            grade: null,
          };
          addRow(row);
          if (!msg.delivered || msg.transcript_id === null) {
            logError(msg.text ? `인식 결과를 API에 저장하지 못했습니다: "${msg.text}"` : "인식 결과를 API에 저장하지 못했습니다.");
          }
          if (msg.status === "failed") {
            logError(`인식 실패: ${msg.error ?? "원인 불명"}`);
          }
          setPhase((p) => (p === "transcribing" && pendingTranscriptions.current === 0 ? "listening" : p));
          break;
        }
      }
    },
    [addRow, logError],
  );

  const start = useCallback(async () => {
    if (roomRef.current) return;
    setPhase("opening");
    setRealtimeUnavailable(false);
    setRows([]);
    setVad({ level: 0, speaking: false });
    silenceTimes.current = [];
    utteranceStarted.current.clear();
    pendingTranscriptions.current = 0;
    polledSeq.current = 0;
    seenKeys.current.clear();

    let opened: SpeechSession;
    try {
      opened = await speechApi.openSession();
    } catch (e) {
      if (!mounted.current) return;
      if (isRealtimeUnavailable(e)) setRealtimeUnavailable(true);
      logError(`세션을 열지 못했습니다: ${errorMessage(e)}`);
      setPhase("error");
      return;
    }
    if (!mounted.current) {
      void speechApi.endSession(opened.session_id).catch(() => undefined);
      return;
    }
    setSession(opened);
    sessionIdRef.current = opened.session_id;
    if (!opened.agent_online) logError("STT 에이전트가 오프라인입니다. 마이크는 연결되지만 인식 결과가 오지 않을 수 있습니다.");
    setPhase("connecting");

    const room = new Room();
    roomRef.current = room;
    room.on(RoomEvent.DataReceived, (payload, _participant, _kind, topic) => onMessage(payload, topic, opened.data_topic));
    room.on(RoomEvent.Disconnected, (reason) => {
      if (roomRef.current !== room || !mounted.current) return;
      logError(`LiveKit 연결이 끊어졌습니다${reason !== undefined ? ` (코드 ${reason})` : ""}.`);
      setPhase("error");
    });
    room.on(RoomEvent.MediaDevicesError, (e) => logError(`마이크 오류: ${e.message}`));
    room.on(RoomEvent.Reconnecting, () => logError("LiveKit에 다시 연결하는 중입니다."));

    try {
      await room.connect(opened.url, opened.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      if (deviceId) await room.switchActiveDevice("audioinput", deviceId);
    } catch (e) {
      if (!mounted.current) return;
      logError(`LiveKit 연결에 실패했습니다: ${e instanceof Error ? e.message : String(e)}`);
      setPhase("error");
      roomRef.current = null;
      void room.disconnect().catch(() => undefined);
      return;
    }
    if (!mounted.current) return;
    setPhase("listening");
    // Permission is granted now, so the list carries labels.
    void refreshDevices(false);
  }, [deviceId, logError, onMessage, refreshDevices]);

  const stop = useCallback(async () => {
    const room = roomRef.current;
    const sessionId = sessionIdRef.current;
    roomRef.current = null;
    sessionIdRef.current = null;
    if (room) {
      try {
        await room.localParticipant.setMicrophoneEnabled(false);
      } catch {
        // The track may already be gone; disconnecting below releases it anyway.
      }
      await room.disconnect().catch(() => undefined);
    }
    if (sessionId) {
      try {
        await speechApi.endSession(sessionId);
      } catch (e) {
        logError(`세션을 닫지 못했습니다: ${errorMessage(e)}`);
      }
    }
    if (!mounted.current) return;
    setVad({ level: 0, speaking: false });
    setPhase("idle");
  }, [logError]);

  const changeDevice = useCallback(
    async (id: string) => {
      setDeviceId(id);
      const room = roomRef.current;
      if (room && id) {
        try {
          await room.switchActiveDevice("audioinput", id);
        } catch (e) {
          logError(`마이크를 바꾸지 못했습니다: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    },
    [logError],
  );

  // Fallback: the stored transcripts, merged by transcript_id.
  const sessionId = session?.session_id ?? null;
  const poll = useQuery({
    queryKey: ["admin", "speech", "session", sessionId, "transcripts"],
    queryFn: () => speechApi.sessionTranscripts(sessionId!, polledSeq.current),
    enabled: connected && sessionId !== null,
    refetchInterval: 3_000,
    refetchIntervalInBackground: true,
  });
  const polled = poll.data;
  useEffect(() => {
    if (!polled?.transcripts) return;
    for (const t of polled.transcripts) addRow(fromView(t));
    if (typeof polled.last_seq === "number") polledSeq.current = Math.max(polledSeq.current, polled.last_seq);
  }, [polled, addRow]);

  return {
    phase,
    connected,
    session,
    vad,
    rows,
    errors,
    realtimeUnavailable,
    devices,
    deviceId,
    expected,
    setExpected,
    start,
    stop,
    changeDevice,
    refreshDevices,
    clearErrors: () => setErrors([]),
  };
}

function fromView(t: TranscriptView): TranscriptRow {
  return {
    key: t.transcript_id,
    at: t.created_at,
    utteranceId: t.utterance_id,
    transcriptId: t.transcript_id,
    seq: t.seq,
    text: t.text,
    status: t.status,
    error: t.error,
    provider: t.provider,
    model: t.model,
    confidence: t.confidence,
    latencyMs: t.latency_ms,
    endToEndMs: null,
    delivered: true,
    source: "poll",
    grade: null,
  };
}

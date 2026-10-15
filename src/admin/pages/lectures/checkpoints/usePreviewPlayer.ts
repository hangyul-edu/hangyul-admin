import { useEffect, useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { roundTime } from "../../../lib/videoFile";
import { LEAD_IN_SECONDS, type Draft } from "./model";

const SPEEDS = [1, 0.5] as const;
/** At most this many fresh preview URLs per window before showing the error. */
const STREAM_REFRESH_LIMIT = 2;
const STREAM_REFRESH_WINDOW_MS = 5 * 60 * 1000;

type Video = SyntheticEvent<HTMLVideoElement>;

/**
 * The lecture video the checkpoints are placed on: where it is, playing or
 * not, at which speed — and keeping it alive when its signed URL runs out.
 */
export function usePreviewPlayer(duration: number, preview: UseQueryResult<{ url: string }>) {
  const videoRef = useRef<HTMLVideoElement>(null);
  /** Where a "미리보기" run stops (the checkpoint itself). */
  const stopAtRef = useRef<number | null>(null);
  const [now, setNow] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(SPEEDS[0]);
  const [videoError, setVideoError] = useState(false);
  // Where to pick up once a fresh URL has loaded, and recent refreshes (a
  // stream that keeps failing shows the error instead of looping).
  const restoreRef = useRef<{ at: number; play: boolean } | null>(null);
  const refreshTimesRef = useRef<number[]>([]);

  function seek(seconds: number) {
    const target = roundTime(Math.max(0, Math.min(seconds, Math.max(0, duration - 0.05))));
    stopAtRef.current = null;
    setNow(target);
    if (videoRef.current) videoRef.current.currentTime = target;
    return target;
  }

  function pause() {
    videoRef.current?.pause();
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    stopAtRef.current = null;
    if (v.paused) void v.play();
    else v.pause();
  }

  /** Play the lead-up to `at` and stop on it — what the learner sees before the modal. */
  function previewTo(at: number) {
    seek(at - LEAD_IN_SECONDS);
    stopAtRef.current = at;
    void videoRef.current?.play();
  }

  function cycleSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(speed as (typeof SPEEDS)[number]) + 1) % SPEEDS.length];
    setSpeed(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
  }

  /** The stream stopped (usually its signed URL ran out): fetch a fresh one and keep the frame. */
  function refreshStream() {
    const stamp = Date.now();
    const recent = refreshTimesRef.current.filter((t) => stamp - t < STREAM_REFRESH_WINDOW_MS);
    refreshTimesRef.current = recent;
    const v = videoRef.current;
    const previousUrl = preview.data?.url;
    if (recent.length >= STREAM_REFRESH_LIMIT) {
      setVideoError(true);
      return;
    }
    refreshTimesRef.current = [...recent, stamp];
    restoreRef.current = { at: v?.currentTime ?? now, play: !!v && !v.paused };
    void preview.refetch().then((r) => {
      // The same URL again (an offline file that will not load) cannot help.
      if (r.isError || r.data?.url === previousUrl) {
        restoreRef.current = null;
        setVideoError(true);
      }
    });
  }

  /** "다시 시도" after the error: a fresh URL, back on the same frame, paused. */
  function retry() {
    setVideoError(false);
    refreshTimesRef.current = [];
    restoreRef.current = { at: now, play: false };
    void preview.refetch();
  }

  /** The handlers the <video> element needs. */
  const videoEvents = {
    onTimeUpdate: (e: Video) => {
      const v = e.currentTarget;
      const stopAt = stopAtRef.current;
      if (stopAt !== null && v.currentTime >= stopAt) {
        stopAtRef.current = null;
        v.pause();
        v.currentTime = stopAt;
        setNow(stopAt);
        return;
      }
      setNow(v.currentTime);
    },
    onSeeked: (e: Video) => setNow(e.currentTarget.currentTime),
    onPlay: () => setPlaying(true),
    onPause: () => setPlaying(false),
    onLoadedMetadata: (e: Video) => {
      // After a fresh URL: back to the same frame.
      const restore = restoreRef.current;
      if (!restore) return;
      restoreRef.current = null;
      const v = e.currentTarget;
      v.currentTime = restore.at;
      setNow(restore.at);
      if (restore.play) void v.play().catch(() => setPlaying(false));
    },
    onStreamError: refreshStream,
  };

  return { videoRef, now, playing, speed, videoError, seek, pause, togglePlay, previewTo, cycleSpeed, retry, videoEvents };
}

/**
 * Keyboard: Space plays/pauses; ←/→ step 1s (Shift: 0.1s) — the draft's time
 * while one is open, the preview's otherwise. Ignored while typing or on a
 * focused control.
 */
export function useEditorKeys({
  now,
  draft,
  togglePlay,
  seek,
  moveDraft,
}: {
  now: number;
  draft: Draft | null;
  togglePlay: () => void;
  seek: (seconds: number) => number;
  moveDraft: (to: number) => void;
}) {
  const latest = useRef({ now, draft, togglePlay, seek, moveDraft });
  latest.current = { now, draft, togglePlay, seek, moveDraft };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(el.tagName))) return;
      const step = e.shiftKey ? 0.1 : 1;
      const { now: at, draft: d } = latest.current;
      if (e.key === " ") {
        e.preventDefault();
        latest.current.togglePlay();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const delta = e.key === "ArrowLeft" ? -step : step;
        if (d) latest.current.moveDraft(d.at + delta);
        else latest.current.seek(at + delta);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

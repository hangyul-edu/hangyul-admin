/**
 * Read a video file's length in the browser, before it is uploaded.
 *
 * The lecture's length is never typed by an admin: it is measured here so the
 * CMS can show it at once, then confirmed by the hosting provider once it has
 * encoded the video. Resolves null when the browser cannot read the file's
 * metadata (an unusual container), in which case the provider's measurement
 * is the only one.
 */
export function readVideoDuration(file: File, timeoutMs = 15000): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof URL.createObjectURL !== "function") {
      resolve(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    const finish = (seconds: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      URL.revokeObjectURL(url);
      resolve(seconds);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const seconds = Math.round(video.duration);
      finish(Number.isFinite(seconds) && seconds > 0 ? seconds : null);
    };
    video.onerror = () => finish(null);
    video.src = url;
  });
}

/**
 * Checkpoint times are kept to the hundredth of a second in the CMS: fine
 * enough to land on a frame, coarse enough to read. (The API stores ms.)
 */
export function roundTime(seconds: number): number {
  return Math.round(seconds * 100) / 100;
}

/** 83.456 → "1:23.46" — a checkpoint time, to the hundredth of a second. */
export function formatPrecise(seconds: number): string {
  const t = Math.max(0, roundTime(seconds));
  const whole = Math.floor(t);
  const hundredths = String(Math.round((t - whole) * 100)).padStart(2, "0");
  return `${formatClock(whole)}.${hundredths}`;
}

/** 205 → "3:25", 3725 → "1:02:05" — how lengths and checkpoint times read in the CMS. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

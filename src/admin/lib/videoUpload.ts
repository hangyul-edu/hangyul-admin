import * as tus from "tus-js-client";

/**
 * Upload a lecture video directly to Cloudflare Stream via the resumable tus
 * protocol, to a one-time upload URL the backend already provisioned. The bytes
 * never pass through our API, and no Cloudflare credential is involved here —
 * the URL itself authorizes the upload.
 *
 * Cloudflare requires the chunk size to be a multiple of 256 KiB and ≥ 5 MiB;
 * 50 MiB is Cloudflare's recommended value and resumes cleanly on flaky links.
 */
const CHUNK_SIZE = 50 * 1024 * 1024; // 52,428,800 — 200 × 256 KiB

export function tusUploadToUrl(
  uploadUrl: string,
  file: File,
  onProgress: (percent: number) => void,
): { promise: Promise<void>; abort: () => void } {
  let upload: tus.Upload;
  let rejectUpload: (reason: Error) => void = () => {};
  const promise = new Promise<void>((resolve, reject) => {
    rejectUpload = reject;
    upload = new tus.Upload(file, {
      // The backend already created the tus upload (Direct Creator Upload), so
      // resume against that exact URL rather than creating a new one.
      uploadUrl,
      chunkSize: CHUNK_SIZE,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      // Each session URL is single-use, so a fingerprint kept in localStorage
      // for resuming later would only pile up.
      storeFingerprintForResuming: false,
      onError: (error) => reject(error),
      onProgress: (sent, total) =>
        onProgress(total > 0 ? Math.round((sent / total) * 100) : 0),
      onSuccess: () => resolve(),
    });
    upload.start();
  });
  return {
    promise,
    // tus-js-client's abort() calls neither onError nor onSuccess, so settle the
    // promise here — the caller's clean-up (removing the half-made video) runs.
    abort: () => {
      void upload?.abort();
      rejectUpload(new UploadAbortedError());
    },
  };
}

/** The upload was stopped on purpose (the page closed), not by a failure. */
export class UploadAbortedError extends Error {
  constructor() {
    super("upload aborted");
    this.name = "UploadAbortedError";
  }
}

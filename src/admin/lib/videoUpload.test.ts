import { describe, expect, it, vi } from "vitest";

// tus-js-client's abort() calls neither onError nor onSuccess — exactly what
// the stand-in does, so only our own settling can end the promise.
const abort = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("tus-js-client", () => ({
  Upload: class {
    start() {}
    abort = abort;
  },
}));

import { UploadAbortedError, tusUploadToUrl } from "./videoUpload";

describe("tusUploadToUrl", () => {
  it("settles as aborted when the upload is stopped, so clean-up runs", async () => {
    const file = new File([new Uint8Array(8)], "lesson.mp4", { type: "video/mp4" });
    const sent = tusUploadToUrl("https://upload.videodelivery.net/tus/abc", file, () => {});
    sent.abort();
    await expect(sent.promise).rejects.toBeInstanceOf(UploadAbortedError);
    expect(abort).toHaveBeenCalledTimes(1);
  });
});

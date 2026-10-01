/**
 * The lecture video upload: one direct tus transfer at a time, stopped when
 * the modal closes, and no row left behind when the transfer fails.
 *
 * POST .../video/upload-session creates the lecture_videos row as `uploading`
 * before a byte is sent, so a failed transfer would otherwise leave a video
 * that says 업로드 중 forever (and keeps the modal polling).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import type { AdminLecture } from "../api";

const listLectureVideos = vi.fn();
const createVideoUploadSession = vi.fn();
const deleteLectureVideo = vi.fn();
const tusUploadToUrl = vi.fn();

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      listLectureVideos: (id: string) => listLectureVideos(id),
      createVideoUploadSession: (id: string, b: unknown) => createVideoUploadSession(id, b),
      deleteLectureVideo: (id: string) => deleteLectureVideo(id),
    },
  };
});
vi.mock("../lib/videoUpload", () => ({
  tusUploadToUrl: (...args: unknown[]) => tusUploadToUrl(...args),
}));
vi.mock("../auth", () => ({ useAdminAuth: () => ({ can: () => true }) }));

const { VideoManagerModal } = await import("./Lectures");

const LECTURE: AdminLecture = {
  lecture_id: "lec_1",
  track_id: "track_topik",
  course_id: null,
  title: "읽기 1강",
  kind: "video",
  duration_seconds: 0,
  thumbnail_url: null,
  access: "free",
  sequence: 1,
  topik_question_type: null,
  video_status: null,
  checkpoint_count: 0,
};

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <VideoManagerModal lecture={LECTURE} onClose={() => {}} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const file = () => new File(["x"], "lesson.mp4", { type: "video/mp4" });
const input = () => document.querySelector('input[type="file"]') as HTMLInputElement;

beforeEach(() => {
  [listLectureVideos, createVideoUploadSession, deleteLectureVideo, tusUploadToUrl].forEach((m) =>
    m.mockReset(),
  );
  listLectureVideos.mockResolvedValue({ lecture_id: "lec_1", items: [] });
  createVideoUploadSession.mockResolvedValue({
    video_id: "vid_1",
    provider: "cloudflare",
    provider_video_id: "cf_1",
    upload_url: "https://upload.example/tus/cf_1",
    upload_protocol: "tus",
    expires_at: "2026-09-30T00:00:00Z",
  });
  deleteLectureVideo.mockResolvedValue(undefined);
});

describe("VideoManagerModal upload", () => {
  it("runs one transfer at a time and aborts it when the modal closes", async () => {
    const abort = vi.fn();
    tusUploadToUrl.mockReturnValue({ promise: new Promise(() => {}), abort });
    const { unmount } = renderModal();
    fireEvent.change(input(), { target: { files: [file()] } });
    await waitFor(() => expect(tusUploadToUrl).toHaveBeenCalledTimes(1));

    fireEvent.change(input(), { target: { files: [file()] } });
    await screen.findByText(/직접 업로드 중/);
    expect(createVideoUploadSession).toHaveBeenCalledTimes(1);

    unmount();
    expect(abort).toHaveBeenCalled();
  });

  it("removes the session's video row when the transfer fails", async () => {
    tusUploadToUrl.mockReturnValue({
      promise: Promise.reject(new Error("network down")),
      abort: vi.fn(),
    });
    renderModal();
    fireEvent.change(input(), { target: { files: [file()] } });
    await waitFor(() => expect(deleteLectureVideo).toHaveBeenCalledWith("vid_1"));
  });
});

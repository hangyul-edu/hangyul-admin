/**
 * The lecture video upload: the length is read from the file (never typed),
 * one transfer runs at a time, it stops when the page goes away, and no row
 * is left behind when the transfer fails.
 *
 * POST .../video/upload-session creates the lecture_videos row as `uploading`
 * before a byte is sent, so a failed transfer would otherwise leave a video
 * that says 업로드 중 forever (and keeps the panel polling).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../../hooks/toast";
import type { AdminLecture, AdminLectureVideo } from "../../api";

const listLectureVideos = vi.fn();
const createVideoUploadSession = vi.fn();
const sendOfflineVideoFile = vi.fn();
const deleteLectureVideo = vi.fn();
const tusUploadToUrl = vi.fn();
const readVideoDuration = vi.fn();

vi.mock("../../api", async () => {
  const actual = await vi.importActual<typeof import("../../api")>("../../api");
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      listLectureVideos: (id: string) => listLectureVideos(id),
      createVideoUploadSession: (id: string, b: unknown) => createVideoUploadSession(id, b),
      sendOfflineVideoFile: (id: string, f: File) => sendOfflineVideoFile(id, f),
      deleteLectureVideo: (id: string) => deleteLectureVideo(id),
    },
  };
});
vi.mock("../../lib/videoUpload", () => ({
  tusUploadToUrl: (...args: unknown[]) => tusUploadToUrl(...args),
}));
vi.mock("../../lib/videoFile", async () => {
  const actual = await vi.importActual<typeof import("../../lib/videoFile")>("../../lib/videoFile");
  return { ...actual, readVideoDuration: (f: File) => readVideoDuration(f) };
});

const { LectureVideoPanel } = await import("./LectureVideoPanel");

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

const READY: AdminLectureVideo = {
  video_id: "vid_0",
  lecture_id: "lec_1",
  provider: "cloudflare",
  provider_video_id: "cf_0",
  is_primary: true,
  upload_status: "ready",
  duration_seconds: 205,
  thumbnail_url: null,
  preview_url: null,
  original_file_name: "old.mp4",
  file_size_bytes: 1024 * 1024,
  mime_type: "video/mp4",
  uploaded_by_admin_id: null,
  uploaded_at: null,
  processed_at: null,
  failed_at: null,
  failure_reason: null,
  deleted_at: null,
};

function renderPanel(props: Partial<{ checkpointCount: number }> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <LectureVideoPanel lecture={LECTURE} canWrite checkpointCount={props.checkpointCount ?? 0} onChanged={() => {}} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const file = () => new File(["x"], "lesson.mp4", { type: "video/mp4" });
const input = () => document.querySelector('input[type="file"]') as HTMLInputElement;
const session = (protocol: "tus" | "api") => ({
  video_id: "vid_1",
  provider: protocol === "tus" ? "cloudflare" : "mock",
  provider_video_id: "cf_1",
  upload_url: "https://upload.example/tus/cf_1",
  upload_protocol: protocol,
  expires_at: "2026-09-30T00:00:00Z",
});

beforeEach(() => {
  [listLectureVideos, createVideoUploadSession, sendOfflineVideoFile, deleteLectureVideo, tusUploadToUrl, readVideoDuration].forEach(
    (m) => m.mockReset(),
  );
  listLectureVideos.mockResolvedValue({ lecture_id: "lec_1", items: [] });
  createVideoUploadSession.mockResolvedValue(session("tus"));
  deleteLectureVideo.mockResolvedValue(undefined);
  readVideoDuration.mockResolvedValue(205);
});

describe("LectureVideoPanel upload", () => {
  it("sends the length read from the file with the upload", async () => {
    tusUploadToUrl.mockReturnValue({ promise: new Promise(() => {}), abort: vi.fn() });
    renderPanel();
    await screen.findByText(/영상 파일을 끌어다 놓거나/);
    fireEvent.change(input(), { target: { files: [file()] } });

    await waitFor(() => expect(createVideoUploadSession).toHaveBeenCalledTimes(1));
    expect(createVideoUploadSession.mock.calls[0][1]).toMatchObject({ duration_seconds: 205 });
    expect(await screen.findByText(/길이 3:25 확인/)).toBeInTheDocument();
  });

  it("sends the file through the API for the offline provider", async () => {
    createVideoUploadSession.mockResolvedValue(session("api"));
    sendOfflineVideoFile.mockResolvedValue({ ...READY, video_id: "vid_1" });
    renderPanel();
    await screen.findByText(/영상 파일을 끌어다 놓거나/);
    fireEvent.change(input(), { target: { files: [file()] } });
    await waitFor(() => expect(sendOfflineVideoFile).toHaveBeenCalledWith("vid_1", expect.any(File)));
    expect(tusUploadToUrl).not.toHaveBeenCalled();
  });

  it("runs one transfer at a time and aborts it when the page goes away", async () => {
    const abort = vi.fn();
    tusUploadToUrl.mockReturnValue({ promise: new Promise(() => {}), abort });
    const { unmount } = renderPanel();
    await screen.findByText(/영상 파일을 끌어다 놓거나/);
    fireEvent.change(input(), { target: { files: [file()] } });
    fireEvent.change(input(), { target: { files: [file()] } });
    await waitFor(() => expect(tusUploadToUrl).toHaveBeenCalledTimes(1));
    expect(createVideoUploadSession).toHaveBeenCalledTimes(1);

    unmount();
    expect(abort).toHaveBeenCalled();
  });

  it("removes the session's video row when the transfer fails", async () => {
    tusUploadToUrl.mockImplementation(() => ({ promise: Promise.reject(new Error("network down")), abort: vi.fn() }));
    renderPanel();
    await screen.findByText(/영상 파일을 끌어다 놓거나/);
    fireEvent.change(input(), { target: { files: [file()] } });
    await waitFor(() => expect(deleteLectureVideo).toHaveBeenCalledWith("vid_1"));
  });

  it("warns that checkpoints need re-checking before replacing the video", async () => {
    listLectureVideos.mockResolvedValue({ lecture_id: "lec_1", items: [READY] });
    renderPanel({ checkpointCount: 3 });
    expect(await screen.findByText(/길이 3:25/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "영상 교체" }));
    expect(screen.getByText(/체크포인트 3개가 있어요/)).toBeInTheDocument();
  });
});

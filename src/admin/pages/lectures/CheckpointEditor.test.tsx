/**
 * Checkpoints are placed by watching the lecture's video, not by typing
 * seconds: the time always comes from the preview's playback position.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../../hooks/toast";
import { adminApi, type AdminCheckpoint, type AdminLecture } from "../../api";
import { CheckpointEditor } from "./CheckpointEditor";

vi.mock("../../api", async () => {
  const actual = await vi.importActual<typeof import("../../api")>("../../api");
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      listCheckpoints: vi.fn(),
      previewLectureVideo: vi.fn(),
      createCheckpoint: vi.fn(),
      replaceCheckpoint: vi.fn(),
      deleteCheckpoint: vi.fn(),
      listSentences: vi.fn(),
      listQuizzes: vi.fn(),
    },
  };
});

const LECTURE: AdminLecture = {
  lecture_id: "lec_1",
  track_id: "track_conversation",
  course_id: null,
  title: "인사하기",
  kind: "video",
  duration_seconds: 300,
  thumbnail_url: null,
  access: "free",
  sequence: 1,
  topik_question_type: null,
  video_status: "ready",
  checkpoint_count: 1,
};

const SPEAKING: AdminCheckpoint = {
  checkpoint_id: "cp_1",
  lecture_id: "lec_1",
  interaction_type: "speaking_exercise",
  at_second: 75,
  sentence_id: "sen_hello_01",
  quiz_id: null,
  content_label: "반갑습니다",
  content_detail: "Nice to meet you.",
  content_archived: false,
  needs_review: false,
  out_of_range: false,
};

function renderEditor(canWrite = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <CheckpointEditor lecture={LECTURE} canWrite={canWrite} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

async function video(): Promise<HTMLVideoElement> {
  let found: HTMLVideoElement | null = null;
  await waitFor(() => {
    found = document.querySelector("video");
    expect(found).not.toBeNull();
  });
  return found!;
}

/** Play the preview to `seconds`. */
function playTo(el: HTMLVideoElement, seconds: number) {
  act(() => {
    el.currentTime = seconds;
    fireEvent.timeUpdate(el);
  });
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
  vi.mocked(adminApi.listCheckpoints).mockReset().mockResolvedValue({
    lecture_id: "lec_1",
    video_id: "vid_1",
    duration_seconds: 300,
    items: [SPEAKING],
  });
  vi.mocked(adminApi.previewLectureVideo).mockReset().mockResolvedValue({
    video_id: "vid_1",
    url: "http://127.0.0.1:8000/media/lecture-videos/v.mp4",
    duration_seconds: 300,
    expires_at: "2026-10-01T00:00:00Z",
  });
  vi.mocked(adminApi.listQuizzes).mockResolvedValue({
    items: [{ quiz_id: "quz_hello_01", prompt: "알맞은 인사말을 고르십시오.", answer_format: "single_choice", topik_question_type: null }],
    total: 1,
    limit: 10,
    offset: 0,
  } as never);
  vi.mocked(adminApi.listSentences).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 10 } as never);
  vi.mocked(adminApi.createCheckpoint).mockReset().mockResolvedValue(SPEAKING);
  vi.mocked(adminApi.replaceCheckpoint).mockReset().mockResolvedValue(SPEAKING);
});

describe("CheckpointEditor", () => {
  it("adds a checkpoint at the moment the preview is at", async () => {
    renderEditor();
    const el = await video();
    playTo(el, 83.6);
    expect(screen.getByText("1:23 / 5:00")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "+ TOPIK 문제" }));
    await userEvent.click(await screen.findByRole("button", { name: /알맞은 인사말/ }));
    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(adminApi.createCheckpoint).toHaveBeenCalledTimes(1));
    expect(adminApi.createCheckpoint).toHaveBeenCalledWith("lec_1", { at_second: 83, quiz_id: "quz_hello_01" });
  });

  it("opens a checkpoint from its marker and moves it to where the preview is", async () => {
    renderEditor();
    const el = await video();
    await userEvent.click(screen.getByRole("button", { name: "1:15 회화 · 따라 말하기 체크포인트" }));
    expect(screen.getByText("체크포인트 편집")).toBeInTheDocument();

    playTo(el, 90);
    await userEvent.click(screen.getByRole("button", { name: "현재 재생 위치(1:30)로 옮기기" }));
    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(adminApi.replaceCheckpoint).toHaveBeenCalledTimes(1));
    expect(adminApi.replaceCheckpoint).toHaveBeenCalledWith("lec_1", "cp_1", { at_second: 90, sentence_id: "sen_hello_01" });
  });

  it("refuses a second checkpoint at a second that already has one", async () => {
    renderEditor();
    const el = await video();
    playTo(el, 75.2);
    await userEvent.click(screen.getByRole("button", { name: "+ TOPIK 문제" }));
    await userEvent.click(await screen.findByRole("button", { name: /알맞은 인사말/ }));
    expect(screen.getByText(/1:15에는 이미 다른 체크포인트가 있어요/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
  });

  it("waits for a ready video before checkpoints can be placed", async () => {
    vi.mocked(adminApi.listCheckpoints).mockResolvedValue({ lecture_id: "lec_1", video_id: null, duration_seconds: 0, items: [] });
    renderEditor();
    expect(await screen.findByText(/영상이 올라가고 재생 가능 상태가 되면/)).toBeInTheDocument();
    expect(adminApi.previewLectureVideo).not.toHaveBeenCalled();
  });

  it("flags checkpoints placed on a video that has since been replaced", async () => {
    vi.mocked(adminApi.listCheckpoints).mockResolvedValue({
      lecture_id: "lec_1",
      video_id: "vid_2",
      duration_seconds: 60,
      items: [SPEAKING, { ...SPEAKING, checkpoint_id: "cp_2", at_second: 20, needs_review: true }],
    });
    vi.mocked(adminApi.listCheckpoints).mockResolvedValueOnce({
      lecture_id: "lec_1",
      video_id: "vid_2",
      duration_seconds: 60,
      items: [
        { ...SPEAKING, checkpoint_id: "cp_2", at_second: 20, needs_review: true },
        { ...SPEAKING, needs_review: true, out_of_range: true },
      ],
    });
    renderEditor();
    expect(await screen.findByRole("alert")).toHaveTextContent("확인이 필요한 체크포인트가 2개");
    expect(screen.getByText("영상 길이를 벗어남")).toBeInTheDocument();
    expect(screen.getByText("영상 교체 후 확인 필요")).toBeInTheDocument();
  });

  it("is read-only without content:write", async () => {
    renderEditor(false);
    await video();
    expect(screen.queryByRole("button", { name: "+ TOPIK 문제" })).toBeNull();
  });
});

/**
 * The checkpoint editor: where a lecture pauses for a conversation or TOPIK
 * modal. Before it existed, checkpoints could only come from seed data.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import { adminApi, type AdminCheckpoint, type AdminLecture } from "../api";
import { CheckpointsModal, formatTimecode, parseTimecode } from "./LectureCheckpoints";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      listCheckpoints: vi.fn(),
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
};

function renderModal(canWrite = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <CheckpointsModal lecture={LECTURE} canWrite={canWrite} onClose={() => {}} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("timecodes", () => {
  it("round-trips minutes:seconds and accepts plain seconds", () => {
    expect(formatTimecode(75)).toBe("1:15");
    expect(parseTimecode("1:15")).toBe(75);
    expect(parseTimecode("90")).toBe(90);
    expect(parseTimecode("1:75")).toBeNull();
    expect(parseTimecode("abc")).toBeNull();
  });
});

describe("CheckpointsModal", () => {
  beforeEach(() => {
    vi.mocked(adminApi.listCheckpoints).mockReset().mockResolvedValue({
      lecture_id: "lec_1",
      duration_seconds: 300,
      items: [SPEAKING],
    });
    vi.mocked(adminApi.listSentences).mockReset().mockResolvedValue({
      items: [{ sentence_id: "sen_thanks_01", korean: "감사합니다", translation: "Thank you." }],
      total: 1,
      page: 1,
      page_size: 10,
    } as never);
    vi.mocked(adminApi.listQuizzes).mockReset().mockResolvedValue({
      items: [
        { quiz_id: "quz_hello_01", prompt: "알맞은 인사말을 고르십시오.", answer_format: "single_choice", topik_question_type: null },
      ],
      total: 1,
      limit: 10,
      offset: 0,
    } as never);
    vi.mocked(adminApi.createCheckpoint).mockReset().mockResolvedValue(SPEAKING);
    vi.mocked(adminApi.replaceCheckpoint).mockReset().mockResolvedValue(SPEAKING);
  });

  it("lists checkpoints with their time and modal type", async () => {
    renderModal();
    expect(await screen.findByText("1:15")).toBeInTheDocument();
    expect(screen.getByText("회화 · 따라 말하기")).toBeInTheDocument();
    expect(screen.getByText("반갑습니다")).toBeInTheDocument();
  });

  it("adds a TOPIK checkpoint from a picked question at a typed time", async () => {
    renderModal();
    await screen.findByText("1:15");
    await userEvent.click(screen.getByRole("button", { name: "+ 체크포인트 추가" }));
    await userEvent.click(screen.getByRole("radio", { name: "TOPIK 문제" }));
    await userEvent.type(screen.getByPlaceholderText("예: 1:30"), "2:05");
    await userEvent.click(await screen.findByRole("button", { name: /알맞은 인사말/ }));
    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(adminApi.createCheckpoint).toHaveBeenCalledTimes(1));
    expect(adminApi.createCheckpoint).toHaveBeenCalledWith("lec_1", {
      at_second: 125,
      quiz_id: "quz_hello_01",
    });
  });

  it("refuses a time past the end of the lecture before sending it", async () => {
    renderModal();
    await screen.findByText("1:15");
    await userEvent.click(screen.getByRole("button", { name: "+ 체크포인트 추가" }));
    await userEvent.type(screen.getByPlaceholderText("예: 1:30"), "6:00");
    await userEvent.click(await screen.findByRole("button", { name: /감사합니다/ }));

    expect(screen.getByText(/강의 길이\(5:00\)를 넘을 수 없어요/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
  });

  it("edits a checkpoint in place, keeping its content", async () => {
    renderModal();
    const row = (await screen.findByText("1:15")).closest("tr")!;
    await userEvent.click(within(row).getByRole("button", { name: "수정" }));
    const time = screen.getByPlaceholderText("예: 1:30");
    await userEvent.clear(time);
    await userEvent.type(time, "40");
    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(adminApi.replaceCheckpoint).toHaveBeenCalledTimes(1));
    expect(adminApi.replaceCheckpoint).toHaveBeenCalledWith("lec_1", "cp_1", {
      at_second: 40,
      sentence_id: "sen_hello_01",
    });
  });

  it("is read-only without content:write", async () => {
    renderModal(false);
    await screen.findByText("1:15");
    expect(screen.queryByRole("button", { name: "+ 체크포인트 추가" })).toBeNull();
    expect(screen.queryByRole("button", { name: "수정" })).toBeNull();
  });
});

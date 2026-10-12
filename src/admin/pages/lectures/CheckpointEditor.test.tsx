/**
 * Checkpoints are placed by watching the lecture's video, not by typing
 * seconds: the time comes from the preview's playback position, to the
 * hundredth of a second, and the modal follows the kind of lecture — a
 * sentence on a conversation lecture, a TOPIK question on a TOPIK one.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

const CONVERSATION: AdminLecture = {
  lecture_id: "lec_1",
  track_id: "track_conversation",
  course_id: "crs_1",
  series_id: "ser_1",
  series_title: "시리즈 1",
  course_title: "코스 1",
  title: "인사하기",
  kind: "video",
  duration_seconds: 300,
  thumbnail_url: null,
  access: "free",
  sequence: 1,
  topik_question_type: null,
  video_status: "ready",
  checkpoint_count: 1,
  description: "",
  translations: [],
};
const TOPIK: AdminLecture = { ...CONVERSATION, track_id: "track_topik", title: "TOPIK 듣기" };

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
/** A checkpoint whose sentence was written on it (the lecture's own). */
const OWNED: AdminCheckpoint = {
  ...SPEAKING,
  sentence_id: "sen_owned_01",
  content_owned: true,
  sentence: {
    sentence_id: "sen_owned_01",
    korean: "반갑습니다",
    display_text: null,
    translation: "Nice to meet you.",
    translation_language: "en",
    romanization: null,
    topic: null,
    level: 1,
    grammar_points: [],
    blanks_json: null,
    has_audio: true,
    audio_voice: "ko-KR-ai-warm",
    is_ai_generated: false,
  },
};
const QUESTION: AdminCheckpoint = {
  ...SPEAKING,
  checkpoint_id: "cp_q",
  interaction_type: "multiple_choice",
  sentence_id: null,
  quiz_id: "quz_hello_01",
  content_label: "알맞은 인사말을 고르십시오.",
  content_detail: null,
};

function renderEditor(lecture: AdminLecture = CONVERSATION, canWrite = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <CheckpointEditor lecture={lecture} canWrite={canWrite} />
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

function withItems(items: AdminCheckpoint[]) {
  vi.mocked(adminApi.listCheckpoints).mockResolvedValue({ lecture_id: "lec_1", video_id: "vid_1", duration_seconds: 300, items });
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
  vi.mocked(adminApi.listCheckpoints).mockReset();
  withItems([SPEAKING]);
  vi.mocked(adminApi.previewLectureVideo).mockReset().mockResolvedValue({
    video_id: "vid_1",
    url: "http://127.0.0.1:8000/media/lecture-videos/v.mp4",
    duration_seconds: 300,
    expires_at: "2026-10-01T00:00:00Z",
  });
  vi.mocked(adminApi.listQuizzes).mockReset().mockResolvedValue({
    items: [
      {
        quiz_id: "quz_hello_01",
        prompt: "알맞은 인사말을 고르십시오.",
        answer_format: "single_choice",
        topik_question_type: null,
        choices: [
          { key: "1", text: "안녕하세요" },
          { key: "2", text: "감사합니다" },
        ],
      },
    ],
    total: 1,
    limit: 10,
    offset: 0,
  } as never);
  vi.mocked(adminApi.listSentences).mockReset().mockResolvedValue({
    items: [{ sentence_id: "sen_thanks_01", korean: "감사합니다", translation: "Thank you." }],
    total: 1,
    page: 1,
    page_size: 10,
  } as never);
  vi.mocked(adminApi.createCheckpoint).mockReset().mockResolvedValue(SPEAKING);
  vi.mocked(adminApi.replaceCheckpoint).mockReset().mockResolvedValue(SPEAKING);
});

describe("CheckpointEditor", () => {
  it("adds a conversation sentence on a conversation lecture, to the hundredth of a second", async () => {
    renderEditor(CONVERSATION);
    const el = await video();
    playTo(el, 83.6);
    expect(screen.getByText("1:23.60")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /TOPIK 문제 추가/ })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "+ 이 지점에 회화 문장 추가 (1:23.60)" }));
    // Written right here — no catalogue search first.
    const save = screen.getByRole("button", { name: "저장" });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByLabelText("따라 말할 한국어 문장"), "감사합니다");
    await userEvent.type(screen.getByLabelText("뜻 (영어)"), "Thank you.");
    await userEvent.click(save);

    await waitFor(() => expect(adminApi.createCheckpoint).toHaveBeenCalledTimes(1));
    const [lectureId, body] = vi.mocked(adminApi.createCheckpoint).mock.calls[0];
    expect(lectureId).toBe("lec_1");
    expect(body.at_second).toBe(83.6);
    expect(body.sentence_id).toBeUndefined();
    expect(body.sentence).toMatchObject({ korean: "감사합니다", translation: "Thank you.", level: 1 });
    expect(adminApi.listQuizzes).not.toHaveBeenCalled();
  });

  it("adds a TOPIK question on a TOPIK lecture", async () => {
    withItems([QUESTION]);
    renderEditor(TOPIK);
    const el = await video();
    playTo(el, 120.257);

    await userEvent.click(screen.getByRole("button", { name: "+ 이 지점에 TOPIK 문제 추가 (2:00.26)" }));
    await userEvent.type(screen.getByLabelText("문제"), "알맞은 인사말을 고르십시오.");
    await userEvent.type(screen.getByLabelText("보기 1"), "안녕하세요");
    await userEvent.type(screen.getByLabelText("보기 2"), "감사합니다");
    await userEvent.click(screen.getByRole("radio", { name: "정답: 보기 2" }));
    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(adminApi.createCheckpoint).toHaveBeenCalledTimes(1));
    const [, body] = vi.mocked(adminApi.createCheckpoint).mock.calls[0];
    expect(body.at_second).toBe(120.26);
    expect(body.quiz).toMatchObject({
      answer_format: "single_choice",
      prompt: "알맞은 인사말을 고르십시오.",
      // Empty choice rows are not sent.
      choices: [
        { key: "1", text: "안녕하세요" },
        { key: "2", text: "감사합니다" },
      ],
      correct_choice: "2",
    });
    expect(adminApi.listSentences).not.toHaveBeenCalled();
  });

  it("says what is missing before a question can be saved", async () => {
    withItems([QUESTION]);
    renderEditor(TOPIK);
    await video();
    await userEvent.click(screen.getByRole("button", { name: /TOPIK 문제 추가/ }));
    expect(screen.getByText("문제(지시문)를 입력하세요.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("문제"), "고르십시오.");
    expect(screen.getByText("보기를 2개 이상 입력하세요.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "단답형" }));
    expect(screen.getByText("정답을 입력하세요.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("빈칸 1 정답"), "학교");
    expect(screen.getByRole("button", { name: "저장" })).toBeEnabled();
  });

  it("edits the checkpoint's own sentence in place", async () => {
    withItems([OWNED]);
    renderEditor();
    await video();
    await userEvent.click(screen.getByRole("button", { name: "1:15.00 회화 · 따라 말하기 체크포인트" }));
    const translation = screen.getByLabelText("뜻 (영어)");
    expect(translation).toHaveValue("Nice to meet you.");
    await userEvent.clear(translation);
    await userEvent.type(translation, "Glad to meet you.");
    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(adminApi.replaceCheckpoint).toHaveBeenCalledTimes(1));
    const [, cpId, body] = vi.mocked(adminApi.replaceCheckpoint).mock.calls[0];
    expect(cpId).toBe("cp_1");
    expect(body.sentence_id).toBeUndefined();
    expect(body.sentence).toMatchObject({ korean: "반갑습니다", translation: "Glad to meet you.", level: 1 });
  });

  it("turns a linked shared sentence into the lecture's own copy once it is edited", async () => {
    withItems([{ ...SPEAKING, sentence: OWNED.sentence }]);
    renderEditor();
    await video();
    await userEvent.click(screen.getByRole("button", { name: "1:15.00 회화 · 따라 말하기 체크포인트" }));
    expect(screen.getByRole("note")).toHaveTextContent("이 강의 전용 사본으로");
    await userEvent.type(screen.getByLabelText("따라 말할 한국어 문장"), "!");
    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(adminApi.replaceCheckpoint).toHaveBeenCalledTimes(1));
    const [, , body] = vi.mocked(adminApi.replaceCheckpoint).mock.calls[0];
    expect(body.sentence_id).toBeUndefined();
    expect(body.sentence).toMatchObject({ korean: "반갑습니다!" });
  });

  it("can start from an existing sentence, copied rather than linked", async () => {
    renderEditor();
    const el = await video();
    playTo(el, 40);
    await userEvent.click(screen.getByRole("button", { name: /회화 문장 추가/ }));
    await userEvent.click(screen.getByText("기존 문장에서 불러오기"));
    await userEvent.click(await screen.findByRole("button", { name: /감사합니다/ }));
    expect(screen.getByLabelText("따라 말할 한국어 문장")).toHaveValue("감사합니다");
    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(adminApi.createCheckpoint).toHaveBeenCalledTimes(1));
    const [, body] = vi.mocked(adminApi.createCheckpoint).mock.calls[0];
    expect(body.sentence_id).toBeUndefined();
    expect(body.sentence).toMatchObject({ korean: "감사합니다", translation: "Thank you." });
  });

  it("fine-tunes a checkpoint by tenths of a second and saves it", async () => {
    renderEditor();
    await video();
    await userEvent.click(screen.getByRole("button", { name: "1:15.00 회화 · 따라 말하기 체크포인트" }));
    expect(screen.getByText("체크포인트 편집")).toBeInTheDocument();

    const nudges = screen.getByRole("group", { name: "시점 조정" });
    await userEvent.click(within(nudges).getByRole("button", { name: "+1초" }));
    await userEvent.click(within(nudges).getByRole("button", { name: "+0.1초" }));
    await userEvent.click(within(nudges).getByRole("button", { name: "+0.1초" }));
    expect(screen.getByRole("textbox", { name: /체크포인트 시점/ })).toHaveValue("1:16.20");
    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(adminApi.replaceCheckpoint).toHaveBeenCalledTimes(1));
    expect(adminApi.replaceCheckpoint).toHaveBeenCalledWith("lec_1", "cp_1", { at_second: 76.2, sentence_id: "sen_hello_01" });
  });

  it("takes an exactly typed time and moves the preview there", async () => {
    renderEditor();
    const el = await video();
    await userEvent.click(screen.getByRole("button", { name: "1:15.00 회화 · 따라 말하기 체크포인트" }));
    const input = screen.getByRole("textbox", { name: /체크포인트 시점/ });

    await userEvent.clear(input);
    await userEvent.type(input, "abc{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("1:23.45 또는 83.45처럼 입력해 주세요.");

    await userEvent.clear(input);
    await userEvent.type(input, "5:00{Enter}");
    expect(screen.getByRole("alert")).toHaveTextContent("영상 길이(5:00.00)보다 앞선 시점을 입력해 주세요.");

    await userEvent.clear(input);
    await userEvent.type(input, "2:03.456{Enter}");
    expect(input).toHaveValue("2:03.46");
    expect(el.currentTime).toBe(123.46);
    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(adminApi.replaceCheckpoint).toHaveBeenCalledTimes(1));
    expect(adminApi.replaceCheckpoint).toHaveBeenCalledWith("lec_1", "cp_1", { at_second: 123.46, sentence_id: "sen_hello_01" });
  });

  it("moves an open checkpoint to where the preview is", async () => {
    renderEditor();
    const el = await video();
    await userEvent.click(screen.getByRole("button", { name: "1:15.00 회화 · 따라 말하기 체크포인트" }));
    playTo(el, 90.42);
    await userEvent.click(screen.getByRole("button", { name: "현재 위치(1:30.42)로" }));
    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(adminApi.replaceCheckpoint).toHaveBeenCalledTimes(1));
    expect(adminApi.replaceCheckpoint).toHaveBeenCalledWith("lec_1", "cp_1", { at_second: 90.42, sentence_id: "sen_hello_01" });
  });

  it("keeps checkpoints at least a second apart", async () => {
    renderEditor();
    const el = await video();
    playTo(el, 75.6);
    await userEvent.click(screen.getByRole("button", { name: /회화 문장 추가/ }));
    await userEvent.type(screen.getByLabelText("따라 말할 한국어 문장"), "감사합니다");
    await userEvent.type(screen.getByLabelText("뜻 (영어)"), "Thank you.");
    expect(screen.getByText("1:15.00의 체크포인트와 1초 이상 떨어져야 해요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
  });

  it("flags a checkpoint whose content does not fit the lecture and has it replaced", async () => {
    withItems([QUESTION]);
    renderEditor(CONVERSATION);
    expect(await screen.findByRole("alert")).toHaveTextContent("확인이 필요한 체크포인트가 1개");
    expect(screen.getByText("강의 종류와 맞지 않음 — 교체 필요")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /알맞은 인사말/ }));
    // The question cannot stay on a conversation lecture: the editor asks for a sentence.
    expect(await screen.findByLabelText("따라 말할 한국어 문장")).toHaveValue("");
    expect(screen.getByRole("button", { name: "저장" })).toBeDisabled();
  });

  it("previews the lead-up to a checkpoint and stops on it", async () => {
    renderEditor();
    const el = await video();
    await userEvent.click(screen.getByRole("button", { name: "1:15.00 미리보기" }));
    expect(el.currentTime).toBe(72);
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();

    playTo(el, 75.3);
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(el.currentTime).toBe(75);
  });

  it("swaps in a fresh preview URL when the stream stops, keeping the frame", async () => {
    renderEditor();
    const el = await video();
    playTo(el, 61.5);
    vi.mocked(adminApi.previewLectureVideo).mockResolvedValue({
      video_id: "vid_1",
      url: "http://127.0.0.1:8000/media/lecture-videos/v.mp4?fresh",
      duration_seconds: 300,
      expires_at: "2026-10-01T06:00:00Z",
    });
    fireEvent.error(el);
    await waitFor(() => expect(el.getAttribute("src")).toContain("?fresh"));
    el.currentTime = 0;
    fireEvent.loadedMetadata(el);
    expect(el.currentTime).toBe(61.5);
  });

  it("shows the error when a fresh preview URL cannot help", async () => {
    renderEditor();
    const el = await video();
    fireEvent.error(el); // same URL comes back: an offline file that will not load
    expect(await screen.findByText(/영상을 불러오지 못했어요/)).toBeInTheDocument();
  });

  it("does not reload the preview when the window regains focus", async () => {
    renderEditor();
    await video();
    expect(adminApi.previewLectureVideo).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    });
    expect(adminApi.previewLectureVideo).toHaveBeenCalledTimes(1);
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
    renderEditor(CONVERSATION, false);
    await video();
    expect(screen.queryByRole("button", { name: /회화 문장 추가/ })).toBeNull();
  });
});

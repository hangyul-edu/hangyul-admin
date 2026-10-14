import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import { ListeningAudioField } from "./Quizzes";
import { adminApi } from "../api";
import type { AdminQuiz } from "../api";
import { ApiError } from "../../lib/http";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, adminApi: { ...actual.adminApi, uploadQuizAudio: vi.fn() } };
});

function renderField(quizId: string | null, onUploaded = vi.fn()) {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <ListeningAudioField quizId={quizId} canWrite onUploaded={onUploaded} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return onUploaded;
}

describe("ListeningAudioField", () => {
  it("asks to save a new question before its audio goes up", () => {
    renderField(null);
    expect(screen.getByText("저장한 뒤 MP3를 올릴 수 있어요.")).toBeInTheDocument();
    expect(screen.getByLabelText(/듣기 음원/)).toBeDisabled();
  });

  it("uploads the MP3 and takes the length the server measured", async () => {
    vi.mocked(adminApi.uploadQuizAudio).mockResolvedValue({ audio_duration_ms: 41500 } as AdminQuiz);
    const onUploaded = renderField("quz_1");
    const file = new File(["ID3"], "passage.mp3", { type: "audio/mpeg" });
    await userEvent.upload(screen.getByLabelText("듣기 음원 (MP3)"), file);
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(41500));
    expect(adminApi.uploadQuizAudio).toHaveBeenCalledWith("quz_1", file);
  });

  it("shows the server's reason when the file is rejected", async () => {
    vi.mocked(adminApi.uploadQuizAudio).mockRejectedValue(
      new ApiError(422, "validation_error", "MP3 파일이 중간에 잘려 있어요", {
        reason: "audio_file_invalid",
        problem: "MP3 파일이 중간에 잘려 있어요",
      }),
    );
    const onUploaded = renderField("quz_1");
    await userEvent.upload(
      screen.getByLabelText("듣기 음원 (MP3)"),
      new File(["x"], "cut.mp3", { type: "audio/mpeg" }),
    );
    expect(await screen.findByText(/중간에 잘려 있어요/)).toBeInTheDocument();
    expect(onUploaded).not.toHaveBeenCalled();
  });
});

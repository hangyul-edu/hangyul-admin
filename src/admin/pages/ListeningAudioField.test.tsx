import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import { ListeningAudioField } from "./Quizzes";
import { adminApi } from "../api";
import type { AdminQuiz } from "../api";

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

  it("uploads the MP3 and reports the stored length", async () => {
    vi.mocked(adminApi.uploadQuizAudio).mockResolvedValue({ audio_duration_ms: 41500 } as AdminQuiz);
    const onUploaded = renderField("quz_1");
    const file = new File(["ID3"], "passage.mp3", { type: "audio/mpeg" });
    await userEvent.upload(screen.getByLabelText("듣기 음원 (MP3)"), file);
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(41500));
    // jsdom can't read the file's length, so it goes up without one and the
    // server keeps what was entered.
    expect(adminApi.uploadQuizAudio).toHaveBeenCalledWith("quz_1", file, undefined);
  });
});

/**
 * A lecture's basic information.
 *
 * - Editing: an emptied optional field is sent as null. The PATCH leaves
 *   omitted fields alone, so a field the admin empties must be sent as an
 *   explicit null or the save "succeeds" and nothing changes.
 * - Creating: there is no type and no length to choose — every lecture is a
 *   video and its length is read from the video — and neither is sent.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../../hooks/toast";
import { adminApi, type AdminLecture } from "../../api";
import { LectureFormModal } from "./LectureFormModal";

vi.mock("../../api", async () => {
  const actual = await vi.importActual<typeof import("../../api")>("../../api");
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      listCourses: vi.fn(),
      createLecture: vi.fn(),
      updateLecture: vi.fn(),
    },
  };
});

const LECTURE: AdminLecture = {
  lecture_id: "lec_1",
  track_id: "track_topik",
  course_id: null,
  title: "읽기 3강",
  kind: "video",
  duration_seconds: 300,
  thumbnail_url: "https://cdn.example.com/t.png",
  access: "free",
  sequence: 1,
  topik_question_type: "reading_03",
  video_status: null,
  checkpoint_count: 0,
};

function renderForm(lecture: AdminLecture | null, onSaved = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <LectureFormModal lecture={lecture} onClose={() => {}} onSaved={onSaved} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return onSaved;
}

describe("LectureFormModal", () => {
  beforeEach(() => {
    vi.mocked(adminApi.listCourses).mockResolvedValue({ items: [] });
    vi.mocked(adminApi.updateLecture).mockReset().mockResolvedValue(LECTURE);
    vi.mocked(adminApi.createLecture).mockReset().mockResolvedValue({ ...LECTURE, lecture_id: "lec_new" });
  });

  it("sends an emptied TOPIK question type as null so the server clears it", async () => {
    renderForm(LECTURE);
    await userEvent.clear(screen.getByLabelText(/TOPIK 문제 유형/));
    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(adminApi.updateLecture).toHaveBeenCalledTimes(1));
    const body = vi.mocked(adminApi.updateLecture).mock.calls[0][1];
    expect(body).toHaveProperty("topik_question_type", null);
    expect(body.thumbnail_url).toBe(LECTURE.thumbnail_url);
  });

  it("creates a video lecture without asking for a type or a length", async () => {
    const onSaved = renderForm(null);
    expect(screen.queryByLabelText(/유형/)).toBeNull();
    expect(screen.queryByLabelText(/길이/)).toBeNull();

    await userEvent.type(screen.getByLabelText(/제목/), "인사하기");
    await userEvent.click(screen.getByRole("button", { name: "만들고 영상 올리기" }));

    await waitFor(() => expect(adminApi.createLecture).toHaveBeenCalledTimes(1));
    const body = vi.mocked(adminApi.createLecture).mock.calls[0][0];
    expect(body).not.toHaveProperty("kind");
    expect(body).not.toHaveProperty("duration_seconds");
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ lecture_id: "lec_new" }));
  });
});

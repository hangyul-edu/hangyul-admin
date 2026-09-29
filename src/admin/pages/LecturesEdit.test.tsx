/**
 * Editing a lecture: an emptied optional field is sent as null.
 *
 * The PATCH leaves omitted fields alone, so a field the admin empties must
 * be sent as an explicit null or the save "succeeds" and nothing changes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../hooks/toast";
import { adminApi, type AdminLecture } from "../api";
import { LecturesPage } from "./Lectures";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      listCourses: vi.fn(),
      listLectures: vi.fn(),
      updateLecture: vi.fn(),
    },
  };
});
vi.mock("../auth", () => ({ useAdminAuth: () => ({ can: () => true }) }));

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
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter>
          <LecturesPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("LecturesPage edit", () => {
  beforeEach(() => {
    vi.mocked(adminApi.listCourses).mockResolvedValue({ items: [] });
    vi.mocked(adminApi.listLectures).mockResolvedValue({
      items: [LECTURE],
      total: 1,
      page: 1,
      page_size: 25,
    } as never);
    vi.mocked(adminApi.updateLecture).mockReset().mockResolvedValue(LECTURE);
  });

  it("sends an emptied TOPIK question type as null so the server clears it", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "수정" }));
    await userEvent.clear(screen.getByLabelText(/TOPIK 문제 유형/));
    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(adminApi.updateLecture).toHaveBeenCalledTimes(1));
    const body = vi.mocked(adminApi.updateLecture).mock.calls[0][1];
    expect(body).toHaveProperty("topik_question_type", null);
    expect(body.thumbnail_url).toBe(LECTURE.thumbnail_url);
  });
});

/**
 * A lecture's basic information.
 *
 * - A lecture always lives in a series of a course (코스 › 시리즈); there is
 *   no standalone lecture, and its track follows the course.
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
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../../hooks/toast";
import { adminApi, type AdminCourse, type AdminLecture, type AdminSeries } from "../../api";
import { LectureFormModal } from "./LectureFormModal";

vi.mock("../../api", async () => {
  const actual = await vi.importActual<typeof import("../../api")>("../../api");
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      listCourses: vi.fn(),
      listSeries: vi.fn(),
      createLecture: vi.fn(),
      updateLecture: vi.fn(),
    },
  };
});

const course = (id: string, track: string, title: string): AdminCourse => ({
  course_id: id,
  track_id: track,
  title,
  description: "",
  cover_image_url: null,
  sequence: 1,
  lecture_count: 0,
  series_count: 1,
});
const series = (id: string, courseId: string, title: string): AdminSeries => ({
  series_id: id,
  course_id: courseId,
  title,
  description: "",
  thumbnail_url: null,
  sequence: 1,
  lecture_count: 0,
});

const COURSES = [
  course("crs_conv", "track_conversation", "Speak Korean Instantly"),
  course("crs_topik", "track_topik", "TOPIK 읽기"),
  course("crs_topik_empty", "track_topik", "TOPIK 듣기"),
];
const SERIES: Record<string, AdminSeries[]> = {
  crs_conv: [series("ser_kit", "crs_conv", "KOREAN SURVIVAL KIT"), series("ser_ice", "crs_conv", "ICEBREAKER KIT")],
  crs_topik: [series("ser_read", "crs_topik", "읽기 시리즈 1"), series("ser_read2", "crs_topik", "읽기 시리즈 2")],
  crs_topik_empty: [],
};

const LECTURE: AdminLecture = {
  lecture_id: "lec_1",
  track_id: "track_topik",
  course_id: "crs_topik",
  series_id: "ser_read",
  series_title: "읽기 시리즈 1",
  course_title: "TOPIK 읽기",
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
        <MemoryRouter>
          <LectureFormModal lecture={lecture} onClose={() => {}} onSaved={onSaved} />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return onSaved;
}

async function choose(trigger: HTMLElement, option: string) {
  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

describe("LectureFormModal", () => {
  beforeEach(() => {
    vi.mocked(adminApi.listCourses).mockResolvedValue({ items: COURSES });
    vi.mocked(adminApi.listSeries).mockImplementation(async (id: string) => ({ items: SERIES[id] ?? [] }));
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
    expect(body.series_id).toBe("ser_read");
    expect(body).not.toHaveProperty("course_id");
    expect(body).not.toHaveProperty("clear_course");
  });

  it("files a new lecture under a course's series, with neither a type nor a length", async () => {
    const onSaved = renderForm(null);
    expect(screen.queryByLabelText(/유형/)).toBeNull();
    expect(screen.queryByLabelText(/길이/)).toBeNull();

    await userEvent.type(screen.getByLabelText(/제목/), "인사하기");
    const create = screen.getByRole("button", { name: "만들고 영상 올리기" });
    // No series yet — it cannot be created standalone.
    expect(create).toBeDisabled();

    await choose(screen.getByLabelText(/소속 코스/), "회화 · Speak Korean Instantly");
    await choose(screen.getByLabelText(/소속 시리즈/), "ICEBREAKER KIT");
    expect(create).toBeEnabled();
    await userEvent.click(create);

    await waitFor(() => expect(adminApi.createLecture).toHaveBeenCalledTimes(1));
    const body = vi.mocked(adminApi.createLecture).mock.calls[0][0];
    expect(body.series_id).toBe("ser_ice");
    expect(body).not.toHaveProperty("course_id");
    expect(body).not.toHaveProperty("track_id");
    expect(body).not.toHaveProperty("kind");
    expect(body).not.toHaveProperty("duration_seconds");
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ lecture_id: "lec_new" }));
  });

  it("offers no '(코스 없음)' option", async () => {
    renderForm(null);
    await userEvent.click(screen.getByLabelText(/소속 코스/));
    await screen.findByRole("option", { name: "TOPIK · TOPIK 읽기" });
    expect(screen.queryByRole("option", { name: /코스 없음/ })).toBeNull();
  });

  it("points to the Courses page when the chosen course has no series yet", async () => {
    renderForm(null);
    await choose(screen.getByLabelText(/소속 코스/), "TOPIK · TOPIK 듣기");

    expect(await screen.findByText(/아직 시리즈가 없어요/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /시리즈 추가/ })).toHaveAttribute(
      "href",
      "/courses?course_id=crs_topik_empty",
    );
    expect(screen.getByRole("button", { name: "만들고 영상 올리기" })).toBeDisabled();
  });

  it("moves an existing lecture only between series of its own track", async () => {
    renderForm(LECTURE);
    await userEvent.click(screen.getByLabelText(/소속 코스/));
    await screen.findByRole("option", { name: "TOPIK · TOPIK 듣기" });
    expect(screen.queryByRole("option", { name: /Speak Korean Instantly/ })).toBeNull();
    await userEvent.keyboard("{Escape}");

    await choose(screen.getByLabelText(/소속 시리즈/), "읽기 시리즈 2");
    await userEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(adminApi.updateLecture).toHaveBeenCalledTimes(1));
    expect(vi.mocked(adminApi.updateLecture).mock.calls[0][1].series_id).toBe("ser_read2");
  });
});

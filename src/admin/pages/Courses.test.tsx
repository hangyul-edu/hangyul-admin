/**
 * 코스 관리: a course holds series (each with its own thumbnail), and
 * lessons live in series. Opening a course shows its series; a series with
 * lessons, and a course with series, cannot be deleted.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../hooks/toast";
import { adminApi, type AdminCourse, type AdminSeries } from "../api";
import { CoursesPage } from "./Courses";

vi.mock("../auth", () => ({ useAdminAuth: () => ({ can: () => true }) }));
vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      listCourses: vi.fn(),
      listSeries: vi.fn(),
      createSeries: vi.fn(),
      updateSeries: vi.fn(),
      deleteSeries: vi.fn(),
      deleteCourse: vi.fn(),
      createCourse: vi.fn(),
      updateCourse: vi.fn(),
      reorderCourses: vi.fn(),
      reorderSeries: vi.fn(),
      listLectures: vi.fn(),
      reorderSeriesLectures: vi.fn(),
      uploadMedia: vi.fn(),
    },
  };
});

const COURSE: AdminCourse = {
  course_id: "crs_1",
  track_id: "track_conversation",
  title: "Speak Korean Instantly",
  description: "",
  cover_image_url: null,
  sequence: 1,
  lecture_count: 5,
  series_count: 2,
  translations: [],
};
const KIT: AdminSeries = {
  series_id: "ser_kit",
  course_id: "crs_1",
  title: "KOREAN SURVIVAL KIT",
  description: "",
  thumbnail_url: "https://cdn.example.com/kit.png",
  sequence: 1,
  lecture_count: 5,
  translations: [],
};
const ICE: AdminSeries = { ...KIT, series_id: "ser_ice", title: "ICEBREAKER KIT", thumbnail_url: null, sequence: 2, lecture_count: 0 };

function renderPage(url = "/courses") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={[url]}>
          <CoursesPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(adminApi.listCourses).mockResolvedValue({ items: [COURSE] });
  vi.mocked(adminApi.listSeries).mockResolvedValue({ items: [KIT, ICE] });
  vi.mocked(adminApi.createSeries).mockReset().mockResolvedValue({ ...ICE, series_id: "ser_new" });
  vi.mocked(adminApi.deleteSeries).mockReset().mockResolvedValue(undefined);
  vi.mocked(adminApi.deleteCourse).mockReset().mockResolvedValue(undefined);
  vi.mocked(adminApi.uploadMedia).mockReset().mockResolvedValue({ key: "k", url: "https://cdn.example.com/new.png", bytes: 1 });
});

describe("CoursesPage series", () => {
  it("opens a course's series with their thumbnails and lesson counts", async () => {
    renderPage();
    await userEvent.click(await screen.findByText("Speak Korean Instantly"));

    const panel = await screen.findByRole("region", { name: "Speak Korean Instantly의 시리즈" });
    expect(await within(panel).findByText("KOREAN SURVIVAL KIT")).toBeInTheDocument();
    expect(within(panel).getByText("ICEBREAKER KIT")).toBeInTheDocument();
    expect(within(panel).getByRole("link", { name: "강의 5개 보기" })).toHaveAttribute(
      "href",
      "/lectures?course_id=crs_1&series_id=ser_kit",
    );
    expect(within(panel).getByText("썸네일 없음")).toBeInTheDocument();
    expect(adminApi.listSeries).toHaveBeenCalledWith("crs_1");
  });

  it("lands on a course's series from a ?course_id= link", async () => {
    renderPage("/courses?course_id=crs_1");
    expect(await screen.findByRole("region", { name: "Speak Korean Instantly의 시리즈" })).toBeInTheDocument();
  });

  it("adds a series with an uploaded thumbnail", async () => {
    renderPage("/courses?course_id=crs_1");
    const panel = await screen.findByRole("region", { name: /의 시리즈/ });
    await userEvent.click(within(panel).getByRole("button", { name: "+ 시리즈 추가" }));

    await userEvent.type(screen.getByLabelText(/제목/), "PATTERN KIT");
    const file = new File(["x"], "kit.png", { type: "image/png" });
    await userEvent.upload(screen.getByLabelText("썸네일 파일"), file);
    expect(await screen.findByAltText("썸네일 미리보기")).toHaveAttribute("src", "https://cdn.example.com/new.png");
    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(adminApi.createSeries).toHaveBeenCalledTimes(1));
    // No typed position: a new series goes to the end of the course.
    expect(adminApi.createSeries).toHaveBeenCalledWith("crs_1", {
      title: "PATTERN KIT",
      description: "",
      thumbnail_url: "https://cdn.example.com/new.png",
      translations: [],
    });
  });

  it("will not delete a series that still has lessons", async () => {
    renderPage("/courses?course_id=crs_1");
    const panel = await screen.findByRole("region", { name: /의 시리즈/ });
    await within(panel).findByText("KOREAN SURVIVAL KIT");
    await userEvent.click(within(panel).getAllByRole("button", { name: "삭제" })[0]);

    expect(await screen.findByText(/강의가 5개 있어 삭제할 수 없어요/)).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "삭제" })).toBeDisabled();
  });

  it("deletes an empty series", async () => {
    renderPage("/courses?course_id=crs_1");
    const panel = await screen.findByRole("region", { name: /의 시리즈/ });
    await within(panel).findByText("ICEBREAKER KIT");
    await userEvent.click(within(panel).getAllByRole("button", { name: "삭제" })[1]);
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(adminApi.deleteSeries).toHaveBeenCalledWith("ser_ice"));
  });

  it("explains that a course with series cannot be deleted", async () => {
    renderPage();
    await screen.findByText("Speak Korean Instantly");
    const table = document.querySelector(".hgadm-table") as HTMLElement;
    await userEvent.click(within(table).getByRole("button", { name: "삭제" }));

    expect(await screen.findByText(/시리즈가 2개 있어 삭제할 수 없어요/)).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "삭제" })).toBeDisabled();
    expect(adminApi.deleteCourse).not.toHaveBeenCalled();
  });
});

describe("CoursesPage languages", () => {
  it("requires the English title and saves the Korean text beside it", async () => {
    vi.mocked(adminApi.createCourse).mockResolvedValue(COURSE);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "+ 코스 추가" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByLabelText(/정렬 순서/)).toBeNull();
    // English opens first and is the required one.
    expect(within(dialog).getByRole("tab", { name: /English/ })).toHaveAttribute("aria-selected", "true");
    expect(within(dialog).getByRole("tab", { name: /English/ })).toHaveTextContent("(필수)");
    expect(within(dialog).getByRole("button", { name: "저장" })).toBeDisabled();

    await userEvent.type(within(dialog).getByLabelText(/코스 제목 · English/), "Speak Korean Instantly");
    await userEvent.click(within(dialog).getByRole("tab", { name: /한국어/ }));
    expect(within(dialog).getByText(/비워 두면 그 칸은 영어로 보여요/)).toBeInTheDocument();
    // An empty Korean field shows the English text it falls back to.
    expect(within(dialog).getByLabelText(/코스 제목 · 한국어/)).toHaveAttribute("placeholder", "Speak Korean Instantly");
    await userEvent.type(within(dialog).getByLabelText(/코스 제목 · 한국어/), "바로 쓰는 한국어");
    await userEvent.type(within(dialog).getByLabelText(/설명 · 한국어/), "일상 표현");
    expect(within(dialog).getByRole("tab", { name: /한국어/ })).toHaveTextContent("✓");
    await userEvent.click(within(dialog).getByRole("button", { name: "저장" }));

    await waitFor(() => expect(adminApi.createCourse).toHaveBeenCalledTimes(1));
    expect(adminApi.createCourse).toHaveBeenCalledWith({
      track_id: "track_conversation",
      title: "Speak Korean Instantly",
      description: "",
      cover_image_url: null,
      translations: [{ locale: "ko", title: "바로 쓰는 한국어", description: "일상 표현" }],
    });
  });

  it("opens an existing course with its Korean text and can clear it", async () => {
    vi.mocked(adminApi.listCourses).mockResolvedValue({
      items: [{ ...COURSE, translations: [{ locale: "ko", title: "바로 쓰는 한국어", description: "" }] }],
    });
    vi.mocked(adminApi.updateCourse).mockResolvedValue(COURSE);
    renderPage();
    // The Korean title reads under the English one in the list.
    expect(await screen.findByText("바로 쓰는 한국어")).toBeInTheDocument();
    const table = document.querySelector(".hgadm-table") as HTMLElement;
    await userEvent.click(within(table).getByRole("button", { name: "수정" }));
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("tab", { name: /한국어/ }));
    await userEvent.clear(within(dialog).getByLabelText(/코스 제목 · 한국어/));
    await userEvent.click(within(dialog).getByRole("button", { name: "저장" }));
    await waitFor(() => expect(adminApi.updateCourse).toHaveBeenCalledTimes(1));
    expect(vi.mocked(adminApi.updateCourse).mock.calls[0][1].translations).toEqual([]);
  });

  it("flags a course whose English title is still a Korean stand-in", async () => {
    vi.mocked(adminApi.listCourses).mockResolvedValue({ items: [{ ...COURSE, title: "바로 쓰는 한국어" }] });
    renderPage();
    expect(await screen.findByText("영어 제목 필요")).toBeInTheDocument();
    const table = document.querySelector(".hgadm-table") as HTMLElement;
    await userEvent.click(within(table).getByRole("button", { name: "수정" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/지금은 한국어가 임시로 들어가 있어요/)).toBeInTheDocument();
    // Not a blocker: the form can still be saved.
    expect(within(dialog).getByRole("button", { name: "저장" })).toBeEnabled();
  });
});

describe("CoursesPage order", () => {
  const second: AdminCourse = { ...COURSE, course_id: "crs_2", title: "Speak Korean Naturally", sequence: 2 };
  const topik: AdminCourse = { ...COURSE, course_id: "crs_t", track_id: "track_topik", title: "TOPIK 1급", sequence: 1 };

  it("numbers courses within their track and moves one a place, saved at once", async () => {
    vi.mocked(adminApi.listCourses).mockResolvedValue({ items: [COURSE, second, topik] });
    vi.mocked(adminApi.reorderCourses).mockResolvedValue({ items: [second, COURSE] });
    renderPage();
    await screen.findByText("Speak Korean Naturally");
    // Each track counts from 1 — the TOPIK course is first in its own track.
    expect(screen.getAllByLabelText("1번째")).toHaveLength(2);
    // The first of a track cannot go up, the last of a track cannot go down.
    expect(screen.getByRole("button", { name: "Speak Korean Instantly 위로 이동" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Speak Korean Naturally 아래로 이동" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Speak Korean Instantly 아래로 이동" }));
    await waitFor(() => expect(adminApi.reorderCourses).toHaveBeenCalledWith("track_conversation", ["crs_2", "crs_1"]));
  });

  it("puts the list back when saving the order fails", async () => {
    vi.mocked(adminApi.listCourses).mockResolvedValue({ items: [COURSE, second] });
    vi.mocked(adminApi.reorderCourses).mockRejectedValue(new Error("network down"));
    renderPage();
    await screen.findByText("Speak Korean Naturally");
    await userEvent.click(screen.getByRole("button", { name: "Speak Korean Instantly 아래로 이동" }));
    expect(await screen.findByText("network down")).toBeInTheDocument();
    const rows = [...document.querySelectorAll(".hgadm-table tbody tr")].map((r) => r.textContent ?? "");
    expect(rows[0]).toContain("Speak Korean Instantly");
  });

  it("moves series left and right, and orders a series' lessons", async () => {
    vi.mocked(adminApi.reorderSeries).mockResolvedValue({ items: [ICE, KIT] });
    const lesson = (id: string, title: string) =>
      ({ lecture_id: id, title, translations: [], series_id: "ser_kit" }) as never;
    vi.mocked(adminApi.listLectures).mockResolvedValue({
      items: [lesson("l1", "1-1 인사"), lesson("l2", "1-2 자기소개")],
      total: 2,
      page: 1,
      page_size: 100,
    } as never);
    vi.mocked(adminApi.reorderSeriesLectures).mockResolvedValue({ items: [] });
    renderPage("/courses?course_id=crs_1");
    const panel = await screen.findByRole("region", { name: /의 시리즈/ });
    await within(panel).findByText("ICEBREAKER KIT");
    await userEvent.click(within(panel).getByRole("button", { name: "KOREAN SURVIVAL KIT 뒤로 이동" }));
    await waitFor(() => expect(adminApi.reorderSeries).toHaveBeenCalledWith("crs_1", ["ser_ice", "ser_kit"]));

    await userEvent.click(within(panel).getByRole("button", { name: "강의 순서" }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("1-2 자기소개");
    await userEvent.click(within(dialog).getByRole("button", { name: "1-2 자기소개 위로 이동" }));
    await waitFor(() => expect(adminApi.reorderSeriesLectures).toHaveBeenCalledWith("ser_kit", ["l2", "l1"]));
    expect(adminApi.listLectures).toHaveBeenCalledWith({ series_id: "ser_kit", page_size: 100 });
  });
});

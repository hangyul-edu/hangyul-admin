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
};
const KIT: AdminSeries = {
  series_id: "ser_kit",
  course_id: "crs_1",
  title: "KOREAN SURVIVAL KIT",
  description: "",
  thumbnail_url: "https://cdn.example.com/kit.png",
  sequence: 1,
  lecture_count: 5,
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
    expect(adminApi.createSeries).toHaveBeenCalledWith("crs_1", {
      title: "PATTERN KIT",
      description: "",
      sequence: 3,
      thumbnail_url: "https://cdn.example.com/new.png",
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

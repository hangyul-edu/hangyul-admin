/**
 * The lesson list orders lessons only where an order exists: one series,
 * shown whole. Any other view is a search and offers no order controls.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ToastProvider } from "../../hooks/toast";
import { adminApi, type AdminLecture } from "../api";
import { LecturesPage } from "./Lectures";

vi.mock("../auth", () => ({ useAdminAuth: () => ({ can: () => true }) }));
vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      listCourses: vi.fn(),
      listSeries: vi.fn(),
      listLectures: vi.fn(),
      reorderSeriesLectures: vi.fn(),
    },
  };
});

const lesson = (id: string, title: string, extra: Partial<AdminLecture> = {}): AdminLecture => ({
  lecture_id: id,
  track_id: "track_conversation",
  course_id: "crs_1",
  series_id: "ser_kit",
  series_title: "KOREAN SURVIVAL KIT",
  course_title: "Speak Korean Instantly",
  title,
  description: "",
  kind: "video",
  duration_seconds: 210,
  thumbnail_url: null,
  access: "free",
  sequence: 1,
  topik_question_type: null,
  video_status: "ready",
  checkpoint_count: 0,
  translations: [],
  ...extra,
});

const L1 = lesson("l1", "1-1 인사", { translations: [{ locale: "en", title: "1-1 Greetings", description: "" }] });
const L2 = lesson("l2", "1-2 자기소개");

function renderAt(url: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={[url]}>
          <LecturesPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(adminApi.listCourses).mockResolvedValue({ items: [] });
  vi.mocked(adminApi.listSeries).mockResolvedValue({
    items: [
      {
        series_id: "ser_kit",
        course_id: "crs_1",
        title: "KOREAN SURVIVAL KIT",
        description: "",
        thumbnail_url: null,
        sequence: 1,
        lecture_count: 2,
        translations: [],
      },
    ],
  });
  vi.mocked(adminApi.listLectures).mockReset().mockResolvedValue({ items: [L1, L2], total: 2, page: 1, page_size: 25 });
  vi.mocked(adminApi.reorderSeriesLectures).mockReset().mockResolvedValue({ items: [L2, L1] });
});

describe("LecturesPage order", () => {
  it("offers no order controls on the whole catalogue", async () => {
    renderAt("/lectures");
    await screen.findByText("1-1 인사");
    expect(screen.queryByRole("button", { name: /위로 이동/ })).toBeNull();
    expect(screen.getByRole("note")).toHaveTextContent(/코스와 시리즈를 고르면/);
    // The English title reads under the Korean one.
    expect(screen.getByText("1-1 Greetings")).toBeInTheDocument();
  });

  it("orders one series' lessons as the app lists them", async () => {
    renderAt("/lectures?course_id=crs_1&series_id=ser_kit");
    await screen.findByText("1-2 자기소개");
    expect(adminApi.listLectures).toHaveBeenLastCalledWith(
      expect.objectContaining({ series_id: "ser_kit", page: 1, page_size: 100 }),
    );
    expect(screen.getByLabelText("1번째")).toBeInTheDocument();
    expect(screen.getByLabelText("2번째")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "1-2 자기소개 위로 이동" }));
    await waitFor(() => expect(adminApi.reorderSeriesLectures).toHaveBeenCalledWith("ser_kit", ["l2", "l1"]));
  });

  it("explains that a narrowed series view cannot be reordered", async () => {
    renderAt("/lectures?course_id=crs_1&series_id=ser_kit&access=free");
    await screen.findByText("1-1 인사");
    expect(screen.queryByRole("button", { name: /위로 이동/ })).toBeNull();
    expect(screen.getByRole("note")).toHaveTextContent(/필터를 비우세요/);
  });
});

/**
 * A lecture's workspace shows one step at a time — 기본 정보, 영상,
 * 체크포인트 — as tabs that carry each step's progress, with the open tab in
 * the URL so a reload or a shared link lands on the same step.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { adminApi, type AdminLecture } from "../api";
import { LectureWorkspacePage } from "./LectureWorkspace";

vi.mock("../auth", () => ({ useAdminAuth: () => ({ can: () => true }) }));
vi.mock("./lectures/LectureVideoPanel", () => ({ LectureVideoPanel: () => <div>video-panel</div> }));
vi.mock("./lectures/CheckpointEditor", () => ({ CheckpointEditor: () => <div>checkpoint-editor</div> }));
vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, adminApi: { ...actual.adminApi, listLectures: vi.fn(), listCourses: vi.fn() } };
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
  checkpoint_count: 2,
};

function Where() {
  const { search } = useLocation();
  return <output aria-label="search">{search}</output>;
}

function renderAt(url: string, lecture: AdminLecture = LECTURE) {
  vi.mocked(adminApi.listLectures).mockResolvedValue({ items: [lecture], total: 1, page: 1, page_size: 5 } as never);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="/lectures/:lectureId"
            element={
              <>
                <LectureWorkspacePage />
                <Where />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(adminApi.listCourses).mockResolvedValue({ items: [] } as never);
});

describe("LectureWorkspacePage", () => {
  it("shows one step at a time, switching from the tabs", async () => {
    renderAt("/lectures/lec_1?tab=info");
    expect(await screen.findByRole("tab", { name: /기본 정보/, selected: true })).toBeInTheDocument();
    expect(screen.getByText("정렬 순서")).toBeInTheDocument();
    expect(screen.queryByText("video-panel")).toBeNull();
    expect(screen.queryByText("checkpoint-editor")).toBeNull();

    await userEvent.click(screen.getByRole("tab", { name: /영상/ }));
    expect(screen.getByText("video-panel")).toBeInTheDocument();
    expect(screen.queryByText("정렬 순서")).toBeNull();
    expect(screen.getByLabelText("search")).toHaveTextContent("?tab=video");

    await userEvent.click(screen.getByRole("button", { name: /다음: 체크포인트 설정/ }));
    expect(screen.getByText("checkpoint-editor")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /체크포인트 2개/, selected: true })).toBeInTheDocument();
  });

  it("moves between tabs with the arrow keys", async () => {
    renderAt("/lectures/lec_1?tab=info");
    (await screen.findByRole("tab", { name: /기본 정보/ })).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: /영상/ })).toHaveFocus();
    expect(screen.getByText("video-panel")).toBeInTheDocument();
    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("tab", { name: /체크포인트/ })).toHaveAttribute("aria-selected", "true");
  });

  it("opens on the step that needs work", async () => {
    renderAt("/lectures/lec_1");
    expect(await screen.findByText("checkpoint-editor")).toBeInTheDocument();
  });

  it("opens on the video until it is ready", async () => {
    renderAt("/lectures/lec_1", { ...LECTURE, video_status: null, checkpoint_count: 0 });
    expect(await screen.findByText("video-panel")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /체크포인트 영상 준비 후/ })).toHaveAttribute("aria-selected", "false");
  });
});

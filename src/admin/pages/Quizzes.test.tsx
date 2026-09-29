import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ToastProvider } from "../../hooks/toast";
import { QuizzesPage, criteriaGraded, draftFromQuiz, draftToBody } from "./Quizzes";
import { adminApi } from "../api";
import type { AdminQuiz } from "../api";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return { ...actual, adminApi: { ...actual.adminApi, listQuizzes: vi.fn() } };
});
vi.mock("../auth", () => ({
  useAdminAuth: () => ({
    status: "signed-in",
    me: { user_id: "u", email: "a@b.co", name: "관리자", nickname: "adm",
          admin_role: "super_admin", scopes: ["content:read", "content:write"] },
    login: vi.fn(), logout: vi.fn(), can: () => true,
  }),
}));

const listQuizzes = vi.mocked(adminApi.listQuizzes);

function Loc() {
  return <div data-testid="loc">{useLocation().search}</div>;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/quizzes"]}>
          <Routes>
            <Route path="/quizzes" element={<><QuizzesPage /><Loc /></>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const toolbar = () => document.querySelector(".hgadm-toolbar") as HTMLElement;

/** Pick an option from one of the toolbar dropdowns. */
async function choose(user: ReturnType<typeof userEvent.setup>, trigger: string, option: string) {
  await user.click(within(toolbar()).getByText(trigger));
  await user.click(await screen.findByRole("option", { name: option }));
}

/** Params of the most recent request — `.at` is outside this project's TS lib. */
const lastCall = () =>
  listQuizzes.mock.calls[listQuizzes.mock.calls.length - 1][0] as Record<string, unknown>;

describe("QuizzesPage source filter", () => {
  beforeEach(() => {
    listQuizzes.mockReset();
    listQuizzes.mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 } as never);
  });

  it("sends no source parameter until one is chosen", async () => {
    renderPage();
    await waitFor(() => expect(listQuizzes).toHaveBeenCalled());
    // Undefined rather than a sentinel, so the backend treats it as "both".
    expect(lastCall().is_ai_generated).toBeUndefined();
    expect(within(toolbar()).getByText("출처: 전체")).toBeInTheDocument();
  });

  it("filters to AI-generated questions", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(listQuizzes).toHaveBeenCalled());

    await choose(user, "출처: 전체", "AI 생성");

    // The URL carries the same parameter name the sentence page uses…
    await waitFor(() =>
      expect(screen.getByTestId("loc").textContent).toContain("is_ai_generated=true"),
    );
    // …and it reaches the API as a boolean, not the raw string.
    await waitFor(() => expect(lastCall().is_ai_generated).toBe(true));
  });

  it("filters to manually entered questions", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(listQuizzes).toHaveBeenCalled());

    await choose(user, "출처: 전체", "수동");

    await waitFor(() => expect(lastCall().is_ai_generated).toBe(false));
  });

  it("clears back to both when 전체 is chosen again", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(listQuizzes).toHaveBeenCalled());

    await choose(user, "출처: 전체", "AI 생성");
    await waitFor(() => expect(lastCall().is_ai_generated).toBe(true));

    await choose(user, "AI 생성", "출처: 전체");
    // Back to omitted — `false` here would silently mean "manual only".
    await waitFor(() => expect(lastCall().is_ai_generated).toBeUndefined());
    expect(screen.getByTestId("loc").textContent).not.toContain("is_ai_generated=true");
  });

  it("resets to the first page so results cannot be paged past", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(listQuizzes).toHaveBeenCalled());

    await choose(user, "출처: 전체", "AI 생성");
    // Same guarantee the other filters give: offset returns to 0.
    await waitFor(() => expect(lastCall().offset).toBe(0));
  });

  it("narrows alongside the existing filters rather than replacing them", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(listQuizzes).toHaveBeenCalled());

    await choose(user, "급수: 전체", "2급");
    await choose(user, "출처: 전체", "AI 생성");

    await waitFor(() => {
      const call = lastCall();
      expect(call.level).toBe("2");
      expect(call.is_ai_generated).toBe(true);
    });
  });

  it("sits with the other filters in the one toolbar", async () => {
    renderPage();
    await waitFor(() => expect(listQuizzes).toHaveBeenCalled());
    // Four dropdowns in the shared flex row, so the new one inherits the same
    // gap and wrapping as the rest.
    expect(toolbar().querySelectorAll(".hgadm-select").length).toBe(4);
    expect(toolbar().querySelector(".hgadm-search")).not.toBeNull();
  });
});

describe("quiz editor body (PUT replaces the question wholesale)", () => {
  const base: AdminQuiz = {
    quiz_id: "q1",
    answer_format: "free_response",
    material_kind: "image",
    topik_section: "writing",
    topik_question_type: "writing_53",
    is_ai_generated: false,
    image_url: "https://cdn.example/chart.png",
    prompt: "그래프를 보고 쓰십시오.",
    prompt_translation: null,
    content_html: null,
    level: 4,
    correct_choice: null,
    choices: [],
    blanks: [],
    hint: null,
    explanation: null,
    has_listening_audio: false,
    audio_duration_ms: 0,
    answer_max_length: 300,
    answer_min_length: 200,
    scoring_criteria: ["내용", "구성"],
    max_score: 30,
  };

  it("round-trips image_url and answer_min_length, which an edit used to clear", () => {
    const body = draftToBody(draftFromQuiz(base));
    expect(body.image_url).toBe("https://cdn.example/chart.png");
    expect(body.answer_min_length).toBe(200);
    expect(body.answer_max_length).toBe(300);
    expect(body.material_kind).toBe("image");
  });

  it("offers the rubric fields for a short answer with an open blank", () => {
    const short = draftFromQuiz({
      ...base,
      answer_format: "short_answer",
      material_kind: "text",
      image_url: null,
      answer_max_length: null,
      answer_min_length: null,
      scoring_criteria: [],
      max_score: null,
      blanks: [{ label: "ㄱ", answer: "있으면" }],
    });
    expect(criteriaGraded(short)).toBe(false);
    const open = { ...short, blanks: [{ label: "ㄱ", answer: "" }] };
    expect(criteriaGraded(open)).toBe(true);
  });
});

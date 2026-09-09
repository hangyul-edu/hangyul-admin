import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ToastProvider } from "../../hooks/toast";
import { QuizzesPage } from "./Quizzes";
import { adminApi } from "../api";

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

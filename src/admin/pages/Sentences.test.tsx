import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { ToastProvider } from "../../hooks/toast";
import { SentencesPage } from "./Sentences";
import { adminApi } from "../api";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      listSentences: vi.fn(),
      sentenceTopics: vi.fn(),
    },
  };
});
vi.mock("../auth", () => ({
  useAdminAuth: () => ({
    status: "signed-in",
    me: { user_id: "u", email: "a@b.co", name: "관리자", nickname: "adm",
          admin_role: "super_admin", scopes: ["content:read", "content:write"] },
    login: vi.fn(), logout: vi.fn(), can: () => true,
  }),
}));

const listSentences = vi.mocked(adminApi.listSentences);
const sentenceTopics = vi.mocked(adminApi.sentenceTopics);

function Loc() {
  return <div data-testid="loc">{useLocation().search}</div>;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/sentences"]}>
          <Routes>
            <Route path="/sentences" element={<><SentencesPage /><Loc /></>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/** The filter dropdowns, in the order they appear in the toolbar. */
function filterOrder(): string[] {
  const toolbar = document.querySelector(".hgadm-toolbar") as HTMLElement;
  // Each Select renders its current option's text in the trigger.
  return [...toolbar.querySelectorAll(".hgadm-select-trigger > span")].map(
    (el) => el.textContent ?? "",
  );
}

describe("SentencesPage filters", () => {
  beforeEach(() => {
    listSentences.mockReset();
    sentenceTopics.mockReset();
    listSentences.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 25 } as never);
    sentenceTopics.mockResolvedValue({ topics: ["인사", "여행"] } as never);
  });

  it("places the level filter directly beside the source filter", async () => {
    renderPage();
    await waitFor(() => expect(filterOrder().length).toBe(3));
    // 주제 → 레벨 → 출처: level and source are adjacent, with nothing between.
    expect(filterOrder()).toEqual(["주제: 전체", "레벨: 전체", "출처: 전체"]);
    const [, levelIdx, sourceIdx] = filterOrder().map((_, i) => i);
    expect(sourceIdx - levelIdx).toBe(1);
  });

  it("keeps every filter in the one toolbar, so spacing stays uniform", async () => {
    renderPage();
    await waitFor(() => expect(filterOrder().length).toBe(3));
    const toolbar = document.querySelector(".hgadm-toolbar")!;
    // Search box and all three dropdowns are siblings of the same flex row —
    // that shared `gap` is what makes the moved control line up with the rest.
    expect(toolbar.querySelector(".hgadm-search")).not.toBeNull();
    expect(toolbar.querySelectorAll(".hgadm-select").length).toBe(3);
  });

  it("still writes the same query parameter when a level is picked", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(filterOrder().length).toBe(3));

    const toolbar = document.querySelector(".hgadm-toolbar") as HTMLElement;
    await user.click(within(toolbar).getByText("레벨: 전체"));
    await user.click(await screen.findByRole("option", { name: "레벨 3" }));

    // The move is layout only: same param, and the page resets as before.
    await waitFor(() =>
      expect(screen.getByTestId("loc").textContent).toContain("level=3"),
    );
    await waitFor(() =>
      expect(listSentences).toHaveBeenCalledWith(expect.objectContaining({ level: "3" })),
    );
  });

  it("leaves the source filter's behaviour untouched", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(filterOrder().length).toBe(3));

    const toolbar = document.querySelector(".hgadm-toolbar") as HTMLElement;
    await user.click(within(toolbar).getByText("출처: 전체"));
    await user.click(await screen.findByRole("option", { name: "AI 생성" }));

    await waitFor(() =>
      expect(screen.getByTestId("loc").textContent).toContain("is_ai_generated=true"),
    );
  });
});

describe("SentencesPage editor", () => {
  const blanked = {
    sentence_id: "sen_1",
    korean: "비가 와서 집에 있었어요.",
    display_text: "비가 ___ 집에 있었어요.",
    translation: "It rained, so I stayed home.",
    translation_language: "en",
    romanization: null,
    topic: "날씨",
    level: 3,
    grammar_points: ["-아서"],
    blanks_json: [{ start: 3, end: 5, answer: "와서" }],
    has_audio: false,
    audio_voice: "ko-KR",
    is_ai_generated: false,
  };

  beforeEach(() => {
    listSentences.mockReset();
    sentenceTopics.mockReset();
    listSentences.mockResolvedValue({ items: [blanked], total: 1, page: 1, page_size: 25 } as never);
    sentenceTopics.mockResolvedValue({ topics: ["날씨"] } as never);
  });

  it("does not let the Korean text of a blanked sentence drift from its blanks", async () => {
    // The blanks are offsets into the Korean text and the server does not
    // re-anchor them when the text changes.
    const update = vi.spyOn(adminApi, "updateSentence").mockResolvedValue(blanked as never);
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: "수정" }));
    const korean = screen.getByLabelText(/^한국어 문장/);
    expect(korean).toHaveAttribute("readonly");
    await userEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][1].korean).toBeUndefined();
    expect(update.mock.calls[0][1].translation).toBe(blanked.translation);
  });
});

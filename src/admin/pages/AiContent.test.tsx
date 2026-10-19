/**
 * The AI review queue's contract with GET/POST /admin/generated-content.
 *
 * The kind filter must send the backend's `GeneratedContentKind` values
 * (`conversation_sentence` / `topik_question`) — anything else matches no row.
 * The review note belongs to the item on screen: the server writes whatever
 * note a review carries, so text typed for one item must not ride along onto
 * the next, and an existing note must not be wiped by re-reviewing.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import type { GeneratedDetail, GeneratedSummary } from "../api";

const listGenerated = vi.fn();
const getGenerated = vi.fn();
const reviewGenerated = vi.fn();

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      listGenerated: (p: unknown) => listGenerated(p),
      getGenerated: (id: string) => getGenerated(id),
      reviewGenerated: (id: string, b: unknown) => reviewGenerated(id, b),
    },
  };
});
/** The signed-in admin's scopes; null grants every scope. */
let scopes: Set<string> | null = null;
vi.mock("../auth", () => ({ useAdminAuth: () => ({ can: (s: string) => scopes === null || scopes.has(s) }) }));

const { AiContentPage } = await import("./AiContent");

function summary(id: string, preview: string): GeneratedSummary {
  return {
    content_id: id,
    content_kind: "conversation_sentence",
    level: 3,
    topik_question_type: null,
    topic: "travel",
    model: "gen-model",
    preview,
    created_at: "2026-09-01T00:00:00Z",
    review_status: "pending",
  };
}

function detail(id: string, note: string | null): GeneratedDetail {
  return {
    ...summary(id, id),
    source: "recommendation",
    topik_section: null,
    language: "en",
    payload: {},
    fingerprint: "fp",
    materialized_item_id: null,
    created_by_user_id: null,
    reviewed_by: null,
    reviewed_at: null,
    review_note: note,
  };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/ai-content"]}>
          <AiContentPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  scopes = null;
  [listGenerated, getGenerated, reviewGenerated].forEach((m) => m.mockReset());
  listGenerated.mockResolvedValue({
    items: [summary("gen_a", "첫 번째 문장"), summary("gen_b", "두 번째 문장")],
    total: 2,
    page: 1,
    page_size: 25,
  });
  getGenerated.mockImplementation(async (id: string) =>
    detail(id, id === "gen_b" ? "이미 저장된 메모" : null),
  );
  reviewGenerated.mockResolvedValue(detail("gen_a", null));
});

describe("AI content review", () => {
  it("labels kinds and filters with the backend's kind values", async () => {
    renderPage();
    expect(await screen.findByText("첫 번째 문장")).toBeInTheDocument();
    expect(screen.getAllByText("문장").length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("button", { name: "종류: 전체" }));
    await userEvent.click(screen.getByRole("option", { name: "문제" }));
    await waitFor(() =>
      expect(listGenerated).toHaveBeenLastCalledWith(
        expect.objectContaining({ content_kind: "topik_question" }),
      ),
    );
  });

  it("does not carry a note typed for one item onto another, and keeps a saved note", async () => {
    renderPage();
    await userEvent.click(await screen.findByText("첫 번째 문장"));
    const box = await screen.findByLabelText(/^검수 메모/);
    await userEvent.type(box, "A에 대한 메모");
    await userEvent.click(screen.getByRole("button", { name: "닫기" }));

    await userEvent.click(screen.getByText("두 번째 문장"));
    await waitFor(() => expect(screen.getByLabelText(/^검수 메모/)).toHaveValue("이미 저장된 메모"));
    await userEvent.click(screen.getByRole("button", { name: "승인" }));
    await waitFor(() =>
      expect(reviewGenerated).toHaveBeenCalledWith("gen_b", {
        review_status: "approved",
        note: "이미 저장된 메모",
      }),
    );
  });

  it("lets a reviewer without content:write approve and reject, but not delete", async () => {
    scopes = new Set(["content:read", "content:review"]); // an educator
    renderPage();
    await userEvent.click(await screen.findByText("첫 번째 문장"));
    expect(await screen.findByRole("button", { name: "승인" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "반려" })).toBeInTheDocument();
    expect(screen.getByLabelText(/^검수 메모/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "삭제" })).not.toBeInTheDocument();
  });
});

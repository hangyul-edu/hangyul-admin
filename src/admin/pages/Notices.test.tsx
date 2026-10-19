/**
 * The notice editor's contract with the backend: which translations are sent,
 * and that clearing a language removes it.
 *
 * `PATCH /admin/support/notices/{id}` only upserts translations, so a language
 * the admin empties has to be deleted through the translation endpoint — or
 * the old text stays live for members in that language.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import type { AdminNotice } from "../api";

const listNotices = vi.fn();
const createNotice = vi.fn();
const updateNotice = vi.fn();
const deleteNoticeTranslation = vi.fn();
const reorderNotices = vi.fn();

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      listNotices: () => listNotices(),
      createNotice: (b: unknown) => createNotice(b),
      updateNotice: (id: string, b: unknown) => updateNotice(id, b),
      deleteNoticeTranslation: (id: string, l: string) => deleteNoticeTranslation(id, l),
      reorderNotices: (ids: string[]) => reorderNotices(ids),
    },
  };
});
vi.mock("../auth", () => ({ useAdminAuth: () => ({ can: () => true }) }));

const { NoticesPage } = await import("./Notices");

const BILINGUAL: AdminNotice = {
  notice_id: "ntc_1",
  translations: [
    { locale: "en", title: "Maintenance", body: "Down for an hour." },
    { locale: "ko", title: "점검 안내", body: "한 시간 동안 점검합니다." },
  ],
  pinned: false,
  display_order: 0,
  published: true,
  published_at: "2026-09-01T00:00:00Z",
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/notices"]}>
          <NoticesPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  [listNotices, createNotice, updateNotice, deleteNoticeTranslation, reorderNotices].forEach((m) => m.mockReset());
  listNotices.mockResolvedValue({ items: [BILINGUAL] });
  createNotice.mockResolvedValue(BILINGUAL);
  updateNotice.mockResolvedValue(BILINGUAL);
  deleteNoticeTranslation.mockResolvedValue({
    ...BILINGUAL,
    translations: [BILINGUAL.translations[1]],
  });
});

async function openEditor() {
  renderPage();
  await screen.findByText("점검 안내");
  await userEvent.click(screen.getByRole("button", { name: "수정" }));
}

describe("notice order", () => {
  it("moves a notice within its group — pinned notices always stay on top", async () => {
    const pinned: AdminNotice = {
      ...BILINGUAL,
      notice_id: "ntc_pin",
      pinned: true,
      translations: [{ locale: "ko", title: "고정 공지", body: "항상 위에 있어요." }],
    };
    const second: AdminNotice = {
      ...BILINGUAL,
      notice_id: "ntc_2",
      translations: [{ locale: "ko", title: "두 번째 공지", body: "두 번째입니다." }],
    };
    listNotices.mockResolvedValue({ items: [pinned, BILINGUAL, second] });
    reorderNotices.mockResolvedValue({ items: [pinned, second, BILINGUAL] });
    renderPage();
    await screen.findByText("두 번째 공지");
    // The pinned group and the rest each count from 1, and never trade places.
    expect(screen.getAllByLabelText("1번째")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "고정 공지 아래로 이동" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "점검 안내 위로 이동" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "두 번째 공지 위로 이동" }));
    await waitFor(() => expect(reorderNotices).toHaveBeenCalledWith(["ntc_2", "ntc_1"]));
  });

  it("has no order field in the editor and sends no order", async () => {
    await openEditor();
    expect(screen.queryByLabelText(/정렬 순서/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() => expect(updateNotice).toHaveBeenCalledTimes(1));
    expect(updateNotice.mock.calls[0][1]).not.toHaveProperty("display_order");
  });
});

describe("notice editor", () => {
  it("deletes a language the admin cleared instead of leaving the old text live", async () => {
    await openEditor();
    await userEvent.clear(screen.getByLabelText("제목 (영어)"));
    await userEvent.clear(screen.getByLabelText("본문 (영어)"));
    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(deleteNoticeTranslation).toHaveBeenCalledWith("ntc_1", "en"));
    const [, body] = updateNotice.mock.calls[0];
    expect(body.translations).toEqual([
      { locale: "ko", title: "점검 안내", body: "한 시간 동안 점검합니다." },
    ]);
    expect(deleteNoticeTranslation).toHaveBeenCalledTimes(1);
  });

  it("does not send a half-filled language the server would reject", async () => {
    renderPage();
    await screen.findByText("점검 안내");
    await userEvent.click(screen.getByRole("button", { name: "+ 공지 작성" }));
    await userEvent.type(screen.getByLabelText(/제목 \(한국어\)/), "  새 공지  ");
    await userEvent.type(screen.getByLabelText(/본문 \(한국어\)/), "내용입니다");
    // Title only: no body, so English is not authored.
    await userEvent.type(screen.getByLabelText("제목 (영어)"), "New notice");
    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(createNotice).toHaveBeenCalledTimes(1));
    expect(createNotice.mock.calls[0][0].translations).toEqual([
      { locale: "ko", title: "새 공지", body: "내용입니다" },
    ]);
  });

  it("keeps both languages when both are still filled", async () => {
    await openEditor();
    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(updateNotice).toHaveBeenCalledTimes(1));
    expect(updateNotice.mock.calls[0][1].translations).toHaveLength(2);
    expect(deleteNoticeTranslation).not.toHaveBeenCalled();
  });
});

/**
 * FAQ management must let an admin author both languages of one FAQ.
 *
 * The API layer is stubbed so these assertions are about the form's contract
 * with the backend: which translations get submitted, that a half-filled
 * language is not sent, and that clearing a language removes it rather than
 * silently leaving the old text in place.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import type { AdminFaq } from "../api";
import { SUPPORTED_LANGUAGES } from "../../lib/language";

const listFaqs = vi.fn();
const createFaq = vi.fn();
const updateFaq = vi.fn();
const deleteFaqTranslation = vi.fn();

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      listFaqs: () => listFaqs(),
      createFaq: (b: unknown) => createFaq(b),
      updateFaq: (id: string, b: unknown) => updateFaq(id, b),
      deleteFaqTranslation: (id: string, l: string) => deleteFaqTranslation(id, l),
    },
  };
});
// Full write permission — the buttons under test are permission-gated.
vi.mock("../auth", () => ({ useAdminAuth: () => ({ can: () => true }) }));

const { FaqsPage } = await import("./Faqs");

const BILINGUAL: AdminFaq = {
  faq_id: "faq_1",
  category: "getting_started",
  order: 1,
  published: true,
  translations: [
    { locale: "en", question: "How do I sign up?", answer: "With email or social login." },
    { locale: "ko", question: "가입은 어떻게 하나요?", answer: "이메일 또는 소셜 로그인." },
  ],
};

const KO_ONLY: AdminFaq = {
  ...BILINGUAL,
  faq_id: "faq_2",
  translations: [{ locale: "ko", question: "한국어만", answer: "한국어 답변입니다" }],
};

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/faqs"]}>
          <FaqsPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  [listFaqs, createFaq, updateFaq, deleteFaqTranslation].forEach((m) => m.mockReset());
  listFaqs.mockResolvedValue({ items: [BILINGUAL, KO_ONLY] });
  createFaq.mockResolvedValue(BILINGUAL);
  updateFaq.mockResolvedValue(BILINGUAL);
  deleteFaqTranslation.mockResolvedValue(KO_ONLY);
});

describe("FAQ list", () => {
  it("shows every registered language's content", async () => {
    renderPage();
    // Both languages of the bilingual row are rendered, not summarised.
    expect(await screen.findByText(/가입은 어떻게 하나요\?/)).toBeInTheDocument();
    expect(screen.getByText(/How do I sign up\?/)).toBeInTheDocument();
    expect(screen.getByText("With email or social login.")).toBeInTheDocument();
  });

  it("says nothing at all about a language with no content", async () => {
    renderPage();
    // The Korean-only row shows its Korean and simply omits the rest — no
    // "not available" placeholder to read past.
    expect(await screen.findByText(/한국어만/)).toBeInTheDocument();
    expect(screen.queryByText(/없음/)).not.toBeInTheDocument();
    expect(screen.queryByText(/미등록/)).not.toBeInTheDocument();
    expect(screen.queryByText(/등록/)).not.toBeInTheDocument();
  });
});

describe("extensible language set", () => {
  it("offers a field pair for every supported app language", async () => {
    renderPage();
    await screen.findByText(/가입은 어떻게 하나요\?/);
    await userEvent.click(screen.getByRole("button", { name: "+ FAQ 추가" }));
    // Driven by SUPPORTED_LANGUAGES, so a new language appears here without
    // touching this page — that is what makes the design extensible.
    for (const { nativeLabel } of SUPPORTED_LANGUAGES) {
      expect(screen.getByLabelText(new RegExp(`질문 \\(${nativeLabel}\\)`))).toBeInTheDocument();
      expect(screen.getByLabelText(new RegExp(`답변 \\(${nativeLabel}\\)`))).toBeInTheDocument();
    }
  });

  it("keeps a translation in a language the editor has no field for", async () => {
    // A locale added by another client (or a future language) must survive an
    // edit rather than being silently dropped on save.
    listFaqs.mockResolvedValue({
      items: [
        {
          ...BILINGUAL,
          translations: [
            ...BILINGUAL.translations,
            { locale: "ja", question: "登録方法は?", answer: "メールまたはSNSで。" },
          ],
        },
      ],
    });
    renderPage();
    await screen.findByText(/가입은 어떻게 하나요\?/);
    await userEvent.click(screen.getAllByRole("button", { name: "수정" })[0]);
    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(updateFaq).toHaveBeenCalled());
    const sent = updateFaq.mock.calls[0][1].translations as { locale: string }[];
    expect(sent.map((t) => t.locale)).toContain("ja");
    expect(deleteFaqTranslation).not.toHaveBeenCalled();
  });
});

describe("authoring both languages", () => {
  it("submits a Korean and an English translation for a new FAQ", async () => {
    renderPage();
    await screen.findByText("가입은 어떻게 하나요?");
    await userEvent.click(screen.getByRole("button", { name: "+ FAQ 추가" }));

    await userEvent.type(screen.getByLabelText(/질문 \(한국어\)/), "질문입니다");
    await userEvent.type(screen.getByLabelText(/답변 \(한국어\)/), "답변입니다");
    await userEvent.type(screen.getByLabelText(/질문 \(English\)/), "A question");
    await userEvent.type(screen.getByLabelText(/답변 \(English\)/), "An answer");
    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(createFaq).toHaveBeenCalled());
    expect(createFaq.mock.calls[0][0].translations).toEqual([
      { locale: "ko", question: "질문입니다", answer: "답변입니다" },
      { locale: "en", question: "A question", answer: "An answer" },
    ]);
  });

  it("accepts one language alone and does not submit the blank one", async () => {
    renderPage();
    await screen.findByText("가입은 어떻게 하나요?");
    await userEvent.click(screen.getByRole("button", { name: "+ FAQ 추가" }));

    await userEvent.type(screen.getByLabelText(/질문 \(한국어\)/), "질문입니다");
    await userEvent.type(screen.getByLabelText(/답변 \(한국어\)/), "답변입니다");
    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(createFaq).toHaveBeenCalled());
    expect(createFaq.mock.calls[0][0].translations).toEqual([
      { locale: "ko", question: "질문입니다", answer: "답변입니다" },
    ]);
  });

  it("refuses to save with no language filled in, or only half of one", async () => {
    renderPage();
    await screen.findByText("가입은 어떻게 하나요?");
    await userEvent.click(screen.getByRole("button", { name: "+ FAQ 추가" }));

    const submit = screen.getByRole("button", { name: "저장" });
    expect(submit).toBeDisabled();

    // A question with no answer is not a usable translation — the API would
    // reject it, so the form must not offer to send it.
    await userEvent.type(screen.getByLabelText(/질문 \(한국어\)/), "질문만 입력");
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/답변 \(한국어\)/), "이제 답변도");
    expect(submit).toBeEnabled();
  });

  it("loads both languages into the form when editing", async () => {
    renderPage();
    await screen.findByText("가입은 어떻게 하나요?");
    await userEvent.click(screen.getAllByRole("button", { name: "수정" })[0]);

    expect(screen.getByLabelText(/질문 \(한국어\)/)).toHaveValue("가입은 어떻게 하나요?");
    expect(screen.getByLabelText(/질문 \(English\)/)).toHaveValue("How do I sign up?");
    expect(screen.getByLabelText(/답변 \(English\)/)).toHaveValue("With email or social login.");
  });

  it("removes a language that the admin clears", async () => {
    renderPage();
    await screen.findByText("가입은 어떻게 하나요?");
    await userEvent.click(screen.getAllByRole("button", { name: "수정" })[0]);

    await userEvent.clear(screen.getByLabelText(/질문 \(English\)/));
    await userEvent.clear(screen.getByLabelText(/답변 \(English\)/));
    await userEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(updateFaq).toHaveBeenCalled());
    // Korean is upserted…
    expect(updateFaq.mock.calls[0][1].translations).toEqual([
      { locale: "ko", question: "가입은 어떻게 하나요?", answer: "이메일 또는 소셜 로그인." },
    ]);
    // …and English is deleted, since PATCH alone would have left it in place.
    await waitFor(() =>
      expect(deleteFaqTranslation).toHaveBeenCalledWith("faq_1", "en"),
    );
  });
});

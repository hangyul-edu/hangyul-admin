import type { AdminFaq, FaqTranslation } from "../../api";
import { SUPPORTED_LANGUAGES } from "../../../lib/language";

export const CATEGORIES = [
  ["getting_started", "시작하기"],
  ["learning_features", "학습 기능"],
  ["payments_subscriptions_refunds", "결제·구독·환불"],
  ["account_settings", "계정 설정"],
  ["errors_troubleshooting", "오류 해결"],
  ["other", "기타"],
] as const;

export const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(CATEGORIES);

/**
 * Languages a FAQ can be authored in.
 *
 * Taken from the app's supported-language list rather than a FAQ-specific
 * ko/en pair, so adding a language is one entry in `SUPPORTED_LANGUAGES` (plus
 * the matching `AppLanguage` value on the backend) — no schema change, no
 * migration, and no edit here. `AUTHORING_PRIORITY` only decides the order the
 * editor shows: the languages we author first today lead, and anything new
 * appears after them automatically.
 */
const AUTHORING_PRIORITY: string[] = ["ko", "en"];

function rankIn(order: string[]) {
  return (code: string) => {
    const i = order.indexOf(code);
    return i === -1 ? order.length : i;
  };
}

export const AUTHORING_LANGUAGES = [...SUPPORTED_LANGUAGES].sort((a, b) => {
  const rank = rankIn(AUTHORING_PRIORITY);
  return rank(a.code) - rank(b.code);
});

export const LANGUAGE_LABEL: Record<string, string> = Object.fromEntries(SUPPORTED_LANGUAGES.map((l) => [l.code, l.nativeLabel]));

export interface FaqText {
  question: string;
  answer: string;
}

export interface FaqDraft {
  category: string;
  published: boolean;
  /** Keyed by locale, one entry per authoring language. A language left blank
   *  is simply not submitted, so no FAQ is forced to carry every language. */
  text: Record<string, FaqText>;
}

function emptyText(): Record<string, FaqText> {
  return Object.fromEntries(AUTHORING_LANGUAGES.map((l) => [l.code, { question: "", answer: "" }]));
}

export function emptyFaqDraft(): FaqDraft {
  return { category: "getting_started", published: true, text: emptyText() };
}

/** A language counts as authored only when BOTH fields pass the API's 2-char
 *  minimum — a half-filled language would be rejected by the server. */
function isComplete(text: FaqText | undefined): boolean {
  return !!text && text.question.trim().length >= 2 && text.answer.trim().length >= 2;
}

/**
 * Every locale the draft carries: the editor's languages first, then any other
 * locale the FAQ already had.
 *
 * The trailing group matters. A FAQ may hold a translation in a language this
 * build has no fields for — added by a newer client, or by a language rolled
 * out backend-first. Those have to round-trip untouched, otherwise saving an
 * unrelated edit would quietly delete them.
 */
function draftLocales(draft: FaqDraft): string[] {
  const known: string[] = AUTHORING_LANGUAGES.map((l) => l.code);
  const extra = Object.keys(draft.text)
    .filter((code) => !known.includes(code))
    .sort();
  return [...known, ...extra];
}

export function completedLocales(draft: FaqDraft): string[] {
  return draftLocales(draft).filter((code) => isComplete(draft.text[code]));
}

export function draftFrom(faq: AdminFaq): FaqDraft {
  const text = emptyText();
  for (const t of faq.translations) {
    // Keep a locale the editor has no field for rather than dropping it, so
    // editing a FAQ never silently discards a translation.
    text[t.locale] = { question: t.question, answer: t.answer };
  }
  return { category: faq.category, published: faq.published, text };
}

/** The translations a draft submits: its fully filled languages, trimmed. */
export function draftTranslations(d: FaqDraft): FaqTranslation[] {
  return completedLocales(d).map((locale) => ({
    locale,
    question: d.text[locale].question.trim(),
    answer: d.text[locale].answer.trim(),
  }));
}

/** Registered translations in the editor's language order. Languages with no
 *  content are absent entirely — there is nothing to say about them. */
export function registered(faq: AdminFaq): FaqTranslation[] {
  const rank = rankIn(AUTHORING_LANGUAGES.map((l) => l.code));
  return [...faq.translations].sort((a, b) => rank(a.locale) - rank(b.locale));
}

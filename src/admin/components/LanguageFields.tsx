import { useState } from "react";
import type { CatalogTranslation } from "../api";
import { Badge, Input, Textarea } from "./kit";

/**
 * Title and description in every app language, for courses, series and
 * lessons.
 *
 * English is the base and required: it is the item's own `title` /
 * `description`. Each other language (today Korean) is optional, and anything
 * left empty is shown to members in English (per field). One tab per
 * language; a ✓ marks the languages that have something written.
 */

export const CATALOG_LANGUAGES = [
  { locale: "en", label: "영어", required: true },
  { locale: "ko", label: "한국어", required: false },
] as const;

export type CatalogLocale = (typeof CATALOG_LANGUAGES)[number]["locale"];
export type LanguageText = { title: string; description: string };
export type LanguageDraft = Record<CatalogLocale, LanguageText>;

const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;

/**
 * Whether a base title is a Korean stand-in rather than English. Rows that
 * never had English kept their Korean text in the English title when English
 * became the base language; they still need an English title.
 */
export function isStandInTitle(title: string | null | undefined): boolean {
  return !!title && HANGUL.test(title);
}

/** A form draft from an item's English text and its translations. */
export function languageDraft(item?: {
  title: string;
  description?: string | null;
  translations?: CatalogTranslation[];
} | null): LanguageDraft {
  const ko = item?.translations?.find((t) => t.locale === "ko");
  return {
    en: { title: item?.title ?? "", description: item?.description ?? "" },
    ko: { title: ko?.title ?? "", description: ko?.description ?? "" },
  };
}

/** The non-English entries to send; a language with nothing written is left out. */
export function translationsOf(draft: LanguageDraft): CatalogTranslation[] {
  const ko = { title: draft.ko.title.trim(), description: draft.ko.description.trim() };
  return ko.title || ko.description ? [{ locale: "ko", ...ko }] : [];
}

/** The Korean title, for a second line under the English one in lists. */
export function koreanTitle(item: { translations?: CatalogTranslation[] }): string | null {
  return item.translations?.find((t) => t.locale === "ko" && t.title.trim())?.title ?? null;
}

/** "영어 제목 필요" next to a title that is still a Korean stand-in. */
export function StandInBadge({ title }: { title: string | null | undefined }) {
  if (!isStandInTitle(title)) return null;
  return <Badge tone="warning">영어 제목 필요</Badge>;
}

/** Whether a language has anything written (the tab's ✓). */
function filled(text: LanguageText): boolean {
  return text.title.trim() !== "" || text.description.trim() !== "";
}

export function LanguageFields({
  value,
  onChange,
  titleMaxLength,
  noun,
  descriptionRows = 3,
}: {
  value: LanguageDraft;
  onChange: (next: LanguageDraft) => void;
  titleMaxLength: number;
  /** What is being named — "코스", "시리즈", "강의" — for labels. */
  noun: string;
  descriptionRows?: number;
}) {
  const [active, setActive] = useState<CatalogLocale>("en");
  const language = CATALOG_LANGUAGES.find((l) => l.locale === active)!;
  const text = value[active];
  const set = (patch: Partial<LanguageText>) => onChange({ ...value, [active]: { ...text, ...patch } });
  const titleId = `hgadm-lang-title-${active}`;
  const descriptionId = `hgadm-lang-desc-${active}`;
  const standIn = active === "en" && isStandInTitle(value.en.title);

  return (
    <div className="hgadm-lang">
      <div className="hgadm-lang__tabs" role="tablist" aria-label={`${noun} 언어`}>
        {CATALOG_LANGUAGES.map((l) => (
          <button
            key={l.locale}
            type="button"
            role="tab"
            id={`hgadm-lang-tab-${l.locale}`}
            aria-selected={active === l.locale}
            aria-controls="hgadm-lang-panel"
            className={`hgadm-lang__tab ${active === l.locale ? "is-active" : ""}`}
            onClick={() => setActive(l.locale)}
          >
            {l.label}
            {l.required && <span className="hgadm-lang__req"> (필수)</span>}
            {filled(value[l.locale]) ? (
              <span className="hgadm-lang__done" aria-label="입력됨">
                ✓
              </span>
            ) : (
              !l.required && <span className="hgadm-lang__empty">비어 있음</span>
            )}
          </button>
        ))}
      </div>

      <div
        className="hgadm-lang__panel"
        role="tabpanel"
        id="hgadm-lang-panel"
        aria-labelledby={`hgadm-lang-tab-${active}`}
      >
        <div className="hgadm-field">
          <label className="hgadm-field__label" htmlFor={titleId}>
            {noun} 제목 · {language.label}
            {language.required && <span className="req">*</span>}
          </label>
          <Input
            id={titleId}
            value={text.title}
            maxLength={titleMaxLength}
            aria-invalid={standIn || undefined}
            onChange={(e) => set({ title: e.target.value })}
            placeholder={language.required ? undefined : value.en.title || undefined}
          />
          {standIn && (
            <span className="hgadm-field__hint hgadm-lang__standin" role="note">
              영어 제목을 입력해 주세요 — 지금은 한국어가 임시로 들어가 있어요.
            </span>
          )}
        </div>
        <div className="hgadm-field">
          <label className="hgadm-field__label" htmlFor={descriptionId}>
            설명 · {language.label}
          </label>
          <Textarea
            id={descriptionId}
            rows={descriptionRows}
            maxLength={2000}
            value={text.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder={language.required ? undefined : value.en.description || undefined}
          />
        </div>
        <p className="hgadm-lang__note">
          {language.required
            ? "영어 제목은 꼭 입력해 주세요. 다른 언어로 쓰지 않은 칸은 앱에서 영어로 보여요."
            : `앱 언어가 ${language.label}인 회원에게 보여요. 비워 두면 그 칸은 영어로 보여요.`}
        </p>
      </div>
    </div>
  );
}

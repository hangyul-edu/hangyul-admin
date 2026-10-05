import { useState } from "react";
import type { CatalogTranslation } from "../api";
import { Input, Textarea } from "./kit";

/**
 * Title and description in every app language, for courses, series and
 * lessons.
 *
 * Korean is the base and required: it is the item's own `title` /
 * `description`. Each other language is optional, and anything left empty is
 * shown to members in Korean (per field). One tab per language; a ✓ marks the
 * languages that have a title.
 */

export const CATALOG_LANGUAGES = [
  { locale: "ko", label: "한국어", required: true },
  { locale: "en", label: "English", required: false },
] as const;

export type CatalogLocale = (typeof CATALOG_LANGUAGES)[number]["locale"];
export type LanguageText = { title: string; description: string };
export type LanguageDraft = Record<CatalogLocale, LanguageText>;

/** A form draft from an item's Korean text and its translations. */
export function languageDraft(item?: {
  title: string;
  description?: string | null;
  translations?: CatalogTranslation[];
} | null): LanguageDraft {
  const en = item?.translations?.find((t) => t.locale === "en");
  return {
    ko: { title: item?.title ?? "", description: item?.description ?? "" },
    en: { title: en?.title ?? "", description: en?.description ?? "" },
  };
}

/** The non-Korean entries to send; a language with nothing written is left out. */
export function translationsOf(draft: LanguageDraft): CatalogTranslation[] {
  const en = { title: draft.en.title.trim(), description: draft.en.description.trim() };
  return en.title || en.description ? [{ locale: "en", ...en }] : [];
}

/** The English title, for a second line under the Korean one in lists. */
export function englishTitle(item: { translations?: CatalogTranslation[] }): string | null {
  return item.translations?.find((t) => t.locale === "en" && t.title.trim())?.title ?? null;
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
  const [active, setActive] = useState<CatalogLocale>("ko");
  const language = CATALOG_LANGUAGES.find((l) => l.locale === active)!;
  const text = value[active];
  const set = (patch: Partial<LanguageText>) => onChange({ ...value, [active]: { ...text, ...patch } });
  const titleId = `hgadm-lang-title-${active}`;
  const descriptionId = `hgadm-lang-desc-${active}`;

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
            onChange={(e) => set({ title: e.target.value })}
            placeholder={language.required ? undefined : value.ko.title || undefined}
          />
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
            placeholder={language.required ? undefined : value.ko.description || undefined}
          />
        </div>
        <p className="hgadm-lang__note">
          {language.required
            ? "한국어는 꼭 입력해 주세요. 다른 언어로 쓰지 않은 칸은 앱에서 한국어로 보여요."
            : `앱 언어가 ${language.label}인 회원에게 보여요. 비워 두면 그 칸은 한국어로 보여요.`}
        </p>
      </div>
    </div>
  );
}

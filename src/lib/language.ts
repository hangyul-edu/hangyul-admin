/**
 * The languages members can use the app in — the same set as the backend's
 * `AppLanguage`. The portal itself is Korean-only; it uses this list for
 * content authored per language (FAQs).
 */
export type AppLanguage = "en" | "ko";

export const SUPPORTED_LANGUAGES: { code: AppLanguage; nativeLabel: string }[] = [
  { code: "en", nativeLabel: "English" },
  { code: "ko", nativeLabel: "한국어" },
];

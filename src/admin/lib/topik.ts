import { TOPIK_TYPE_LABEL_KO } from "../../lib/topikTypeLabels";

/**
 * How the admin names TOPIK sections and question types.
 *
 * The codes (`reading`, `reading_07`) are what the API stores; an operator
 * reads the member app's own Korean labels instead, so a list never shows a
 * bare code and a form never asks anyone to type one.
 */
export const TOPIK_SECTIONS = [
  ["listening", "듣기"],
  ["reading", "읽기"],
  ["writing", "쓰기"],
] as const;

const SECTION_LABEL: Record<string, string> = Object.fromEntries(TOPIK_SECTIONS);

export function topikSectionLabel(code: string): string {
  return SECTION_LABEL[code] ?? code;
}

/** A question type's label, or its code when the app has no label for it. */
export function topikTypeLabel(code: string): string {
  return TOPIK_TYPE_LABEL_KO[code] ?? code;
}

/** The type to keep when the section changes: cleared if it belongs to another. */
export function typeForSection(type: string, section: string): string {
  return !type || !section || type.startsWith(`${section}_`) ? type : "";
}

/** Every known question type, those of `section` only when one is given. */
export function topikTypeCodes(section?: string): string[] {
  const all = Object.keys(TOPIK_TYPE_LABEL_KO);
  return section ? all.filter((code) => code.startsWith(`${section}_`)) : all;
}

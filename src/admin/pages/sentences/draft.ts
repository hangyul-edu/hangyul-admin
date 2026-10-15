import type { AdminSentence } from "../../api";
import type { FieldDoc } from "../../components/BulkImportButton";

/** The editor's working copy of a sentence. */
export interface SentenceDraft {
  korean: string;
  translation: string;
  romanization: string;
  topic: string;
  level: string;
  grammar_points: string;
  /** Editing a sentence with blanks: its blanks are character offsets into
   *  the Korean text, which the server does not re-anchor when the text
   *  changes, so the text is shown but not editable here. */
  blanked?: boolean;
}

export function emptySentenceDraft(): SentenceDraft {
  return { korean: "", translation: "", romanization: "", topic: "", level: "1", grammar_points: "" };
}

export function draftFromSentence(s: AdminSentence): SentenceDraft {
  return {
    korean: s.korean,
    translation: s.translation,
    romanization: s.romanization ?? "",
    topic: s.topic ?? "",
    level: String(s.level),
    grammar_points: s.grammar_points.join(", "),
    blanked: Boolean(s.blanks_json?.length || s.display_text),
  };
}

/** The request body; grammar points are typed comma-separated. */
export function sentenceBody(d: SentenceDraft) {
  return {
    korean: d.korean,
    translation: d.translation,
    romanization: d.romanization || null,
    topic: d.topic || null,
    level: Number(d.level),
    grammar_points: d.grammar_points
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

/** The example file the bulk-import dialog offers for download. */
export const BATCH_TEMPLATE = JSON.stringify(
  [
    {
      korean: "오늘 날씨가 정말 좋아요.",
      translation: "The weather is really nice today.",
      romanization: "oneul nalssiga jeongmal joayo",
      topic: "daily",
      level: 1,
      grammar_points: ["-아요/어요"],
    },
    {
      korean: "주말에 친구를 만나요.",
      translation: "I meet a friend on the weekend.",
      topic: "daily",
      level: 1,
      grammar_points: ["-아요/어요"],
    },
  ],
  null,
  2,
);

/** The upload format, for the import dialog's field reference. */
export const SENTENCE_FIELDS: FieldDoc[] = [
  { name: "korean", need: "필수", meaning: "학습할 한국어 문장 (최대 500자)", example: "오늘 날씨가 좋아요." },
  { name: "translation", need: "필수", meaning: "문장의 뜻", example: "The weather is nice today." },
  { name: "level", need: "선택", meaning: "회화 레벨 1–10, 없으면 1", example: "2" },
  { name: "topic", need: "선택", meaning: "주제 (영문 소문자 권장)", example: "daily" },
  { name: "romanization", need: "선택", meaning: "로마자 발음 표기", example: "oneul nalssiga joayo" },
  { name: "grammar_points", need: "선택", meaning: "이 문장에서 배우는 문법 목록", example: '["-아요/어요"]' },
  { name: "display_text", need: "선택", meaning: "빈칸을 표시해 학습자에게 보여 줄 문장", example: "오늘 ___가 좋아요." },
  { name: "blanks_json", need: "선택", meaning: "빈칸 위치: start(몇 번째 글자부터), length(몇 글자), answer(정답)", example: '[{"start":3,"length":2,"answer":"날씨"}]' },
  { name: "translation_language", need: "선택", meaning: "번역 언어, 없으면 en", example: "en" },
];

import type { AdminQuiz } from "../../api";

/** Answer formats, as the API names them and as the portal labels them. */
export const FORMATS = [
  ["single_choice", "객관식"],
  ["short_answer", "빈칸 채우기"],
  ["free_response", "서술형"],
] as const;
export const FORMAT_LABEL: Record<string, string> = Object.fromEntries(FORMATS);

/** The editor's working copy of a question: every value as the form holds it. */
export interface QuizDraft {
  answer_format: string;
  material_kind: string;
  topik_section: string;
  topik_question_type: string;
  prompt: string;
  prompt_translation: string;
  content_html: string;
  level: string;
  choices: { key: string; text: string }[];
  correct_choice: string;
  blanks: { label: string; answer: string }[];
  hint: string;
  explanation: string;
  audio_duration_ms: string;
  image_url: string;
  answer_max_length: string;
  answer_min_length: string;
  scoring_criteria: string;
  max_score: string;
}

const EMPTY: QuizDraft = {
  answer_format: "single_choice",
  material_kind: "text",
  topik_section: "",
  topik_question_type: "",
  prompt: "",
  prompt_translation: "",
  content_html: "",
  level: "1",
  choices: [
    { key: "1", text: "" },
    { key: "2", text: "" },
    { key: "3", text: "" },
    { key: "4", text: "" },
  ],
  correct_choice: "1",
  blanks: [{ label: "", answer: "" }],
  hint: "",
  explanation: "",
  audio_duration_ms: "0",
  image_url: "",
  answer_max_length: "",
  answer_min_length: "",
  scoring_criteria: "",
  max_score: "",
};

/** A blank question to start from — a fresh copy, so edits never touch the template. */
export function emptyDraft(): QuizDraft {
  return { ...EMPTY, choices: EMPTY.choices.map((c) => ({ ...c })), blanks: EMPTY.blanks.map((b) => ({ ...b })) };
}

/**
 * Whether the draft is scored against a rubric, so the criteria / max-score
 * fields must be offered: free response always, and a short answer as soon as
 * one blank has no fixed answer ("정답을 비우면 기준 채점") — the server then
 * requires scoring_criteria and a positive max_score.
 */
export function criteriaGraded(d: QuizDraft): boolean {
  if (d.answer_format === "free_response") return true;
  if (d.scoring_criteria.trim() !== "") return true;
  return d.answer_format === "short_answer" && d.blanks.some((b) => b.label.trim() !== "" && b.answer.trim() === "");
}

export function draftFromQuiz(quiz: AdminQuiz): QuizDraft {
  return {
    answer_format: quiz.answer_format,
    material_kind: quiz.material_kind,
    topik_section: quiz.topik_section ?? "",
    topik_question_type: quiz.topik_question_type ?? "",
    prompt: quiz.prompt,
    prompt_translation: quiz.prompt_translation ?? "",
    content_html: quiz.content_html ?? "",
    level: String(quiz.level),
    choices: quiz.choices.length ? quiz.choices.map((c) => ({ key: c.key, text: c.text })) : EMPTY.choices,
    correct_choice: quiz.correct_choice ?? "1",
    blanks: quiz.blanks.length ? quiz.blanks.map((b) => ({ label: b.label, answer: b.answer ?? "" })) : EMPTY.blanks,
    hint: quiz.hint ?? "",
    explanation: quiz.explanation ?? "",
    audio_duration_ms: String(quiz.audio_duration_ms),
    image_url: quiz.image_url ?? "",
    answer_max_length: quiz.answer_max_length === null ? "" : String(quiz.answer_max_length),
    answer_min_length: quiz.answer_min_length === null ? "" : String(quiz.answer_min_length),
    scoring_criteria: quiz.scoring_criteria.join("\n"),
    max_score: quiz.max_score === null ? "" : String(quiz.max_score),
  };
}

/**
 * The request body for POST/PUT /admin/quizzes. PUT replaces the question
 * wholesale — anything omitted is cleared — so every field the admin view
 * carries has to round-trip through the draft, including ones the form only
 * shows for some formats.
 */
export function draftToBody(d: QuizDraft): Record<string, unknown> {
  const isChoice = d.answer_format === "single_choice";
  const isShort = d.answer_format === "short_answer";
  const criteria = d.scoring_criteria
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    answer_format: d.answer_format,
    material_kind: d.material_kind,
    topik_section: d.topik_section || null,
    topik_question_type: d.topik_question_type || null,
    prompt: d.prompt,
    prompt_translation: d.prompt_translation || null,
    content_html: d.content_html || null,
    level: Number(d.level),
    choices: isChoice ? d.choices.filter((c) => c.text.trim()) : null,
    correct_choice: isChoice ? d.correct_choice : null,
    blanks: isShort
      ? d.blanks.filter((b) => b.label.trim() || b.answer.trim()).map((b) => ({ label: b.label, answer: b.answer || null }))
      : null,
    hint: d.hint || null,
    explanation: d.explanation || null,
    audio_duration_ms: Number(d.audio_duration_ms) || 0,
    image_url: d.material_kind === "image" ? d.image_url.trim() || null : null,
    answer_max_length: d.answer_max_length === "" ? null : Number(d.answer_max_length),
    answer_min_length: d.answer_min_length === "" ? null : Number(d.answer_min_length),
    scoring_criteria: criteria.length ? criteria : null,
    max_score: d.max_score === "" ? null : Number(d.max_score),
  };
}

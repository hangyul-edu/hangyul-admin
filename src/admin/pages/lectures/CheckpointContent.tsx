/**
 * The content a checkpoint plays, written on the checkpoint itself: the
 * sentence a conversation lecture has the learner repeat, or the question a
 * TOPIK lecture asks. It is stored as the lecture's own (never in the shared
 * catalogue). An existing sentence or question can still be used as a
 * starting point — "기존 콘텐츠에서 불러오기" copies it into the form.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { adminApi } from "../../api";
import type { AdminQuiz, AdminSentence } from "../../api";
import { CONVERSATION_LEVELS, TOPIK_GRADES } from "../../../lib/levels";
import { errorMessage } from "../../../lib/http";
import { Button, ErrorState, Input, LoadingState, SearchBox, Select, Textarea } from "../../components/kit";
import type { QuizDraft } from "../Quizzes";
import { criteriaGraded, draftFromQuiz, draftToBody } from "../Quizzes";
import { TopikTypeSelect } from "../../components/TopikTypeSelect";
import { typeForSection } from "../../lib/topik";

// ---- Sentence ----------------------------------------------------------------

export interface SentenceForm {
  korean: string;
  translation: string;
  romanization: string;
  level: string;
  grammar_points: string;
  /** Fields the form does not edit, carried through so a save keeps them. */
  keep: Pick<AdminSentence, "display_text" | "blanks_json" | "topic" | "translation_language"> | null;
  /** The Korean the kept blanks were placed on; changing it drops them. */
  keptKorean: string;
}

export function emptySentence(): SentenceForm {
  return { korean: "", translation: "", romanization: "", level: "1", grammar_points: "", keep: null, keptKorean: "" };
}

export function sentenceFormFrom(s: AdminSentence): SentenceForm {
  return {
    korean: s.korean,
    translation: s.translation,
    romanization: s.romanization ?? "",
    level: String(s.level ?? 1),
    grammar_points: (s.grammar_points ?? []).join(", "),
    keep: {
      display_text: s.display_text ?? null,
      blanks_json: s.blanks_json ?? null,
      topic: s.topic ?? null,
      translation_language: s.translation_language,
    },
    keptKorean: s.korean,
  };
}

export function sentenceBody(f: SentenceForm): Record<string, unknown> {
  // Blanks are offsets into the Korean text; once it changes they no longer fit.
  const blanksFit = f.keep !== null && f.korean === f.keptKorean;
  return {
    korean: f.korean.trim(),
    translation: f.translation.trim(),
    romanization: f.romanization.trim() || null,
    level: Number(f.level),
    grammar_points: f.grammar_points
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean),
    topic: f.keep?.topic ?? null,
    ...(f.keep?.translation_language ? { translation_language: f.keep.translation_language } : {}),
    display_text: blanksFit ? f.keep?.display_text ?? null : null,
    blanks_json: blanksFit ? f.keep?.blanks_json ?? null : null,
  };
}

/** Why the sentence cannot be saved yet, or null. */
export function sentenceProblem(f: SentenceForm): string | null {
  if (!f.korean.trim() || !f.translation.trim()) return "따라 말할 한국어 문장과 뜻을 입력하세요.";
  return null;
}

export function SentenceFields({
  form,
  readOnly,
  onChange,
}: {
  form: SentenceForm;
  readOnly: boolean;
  onChange: (form: SentenceForm) => void;
}) {
  const set = (patch: Partial<SentenceForm>) => onChange({ ...form, ...patch });
  return (
    <div className="hgadm-cpc">
      <Labeled label="따라 말할 한국어 문장" required>
        <Textarea
          rows={2}
          value={form.korean}
          readOnly={readOnly}
          aria-label="따라 말할 한국어 문장"
          placeholder="예: 만나서 반갑습니다."
          onChange={(e) => set({ korean: e.target.value })}
        />
      </Labeled>
      <Labeled label="뜻 (영어)" required>
        <Input
          value={form.translation}
          readOnly={readOnly}
          aria-label="뜻 (영어)"
          placeholder="예: Nice to meet you."
          onChange={(e) => set({ translation: e.target.value })}
        />
      </Labeled>
      <div className="hgadm-cpc__row">
        <Labeled label="로마자 표기">
          <Input
            value={form.romanization}
            readOnly={readOnly}
            aria-label="로마자 표기"
            placeholder="선택"
            onChange={(e) => set({ romanization: e.target.value })}
          />
        </Labeled>
        <Labeled label="회화 레벨">
          <Select value={form.level} disabled={readOnly} aria-label="회화 레벨" onChange={(e) => set({ level: e.target.value })}>
            {CONVERSATION_LEVELS.map((l) => (
              <option key={l} value={l}>
                레벨 {l}
              </option>
            ))}
          </Select>
        </Labeled>
      </div>
      <details className="hgadm-cpc__more">
        <summary>더 보기</summary>
        <Labeled label="문법 포인트" hint="쉼표로 구분 · 예: -아요/어요, -고 싶다">
          <Input
            value={form.grammar_points}
            readOnly={readOnly}
            aria-label="문법 포인트"
            onChange={(e) => set({ grammar_points: e.target.value })}
          />
        </Labeled>
      </details>
    </div>
  );
}

// ---- Question ----------------------------------------------------------------

const FORMATS: [string, string][] = [
  ["single_choice", "객관식"],
  ["short_answer", "단답형"],
  ["free_response", "서술형"],
];

export function emptyQuiz(): QuizDraft {
  return {
    answer_format: "single_choice",
    material_kind: "text",
    topik_section: "",
    topik_question_type: "",
    prompt: "",
    prompt_translation: "",
    content_html: "",
    level: "1",
    choices: ["1", "2", "3", "4"].map((key) => ({ key, text: "" })),
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
}

export function quizFormFrom(q: AdminQuiz): QuizDraft {
  const d = draftFromQuiz(q);
  // An imported question that had no choices/blanks gets the empty rows to fill.
  return {
    ...d,
    choices: d.choices.length ? d.choices : emptyQuiz().choices,
    blanks: d.blanks.length ? d.blanks : emptyQuiz().blanks,
  };
}

export const quizBody = draftToBody;

/** Why the question cannot be saved yet, or null. */
export function quizProblem(d: QuizDraft): string | null {
  if (!d.prompt.trim()) return "문제(지시문)를 입력하세요.";
  if (d.answer_format === "single_choice") {
    const filled = d.choices.filter((c) => c.text.trim());
    if (filled.length < 2) return "보기를 2개 이상 입력하세요.";
    if (!filled.some((c) => c.key === d.correct_choice)) return "정답 보기를 고르세요.";
  }
  if (d.answer_format === "short_answer" && !d.blanks.some((b) => b.label.trim() || b.answer.trim()))
    return "정답을 입력하세요.";
  if (d.answer_format === "free_response" && !(Number(d.answer_max_length) > 0)) return "최대 글자 수를 입력하세요.";
  if (criteriaGraded(d) && (!d.scoring_criteria.trim() || !(Number(d.max_score) > 0)))
    return "채점 기준과 만점을 입력하세요.";
  return null;
}

/** Choices renumbered 1..n, keeping which one is correct. */
function renumber(d: QuizDraft, choices: { key: string; text: string }[]): QuizDraft {
  const correctIndex = choices.findIndex((c) => c.key === d.correct_choice);
  const next = choices.map((c, i) => ({ key: String(i + 1), text: c.text }));
  return { ...d, choices: next, correct_choice: next[Math.max(0, correctIndex)]?.key ?? "1" };
}

export function QuizFields({
  draft,
  readOnly,
  onChange,
}: {
  draft: QuizDraft;
  readOnly: boolean;
  onChange: (draft: QuizDraft) => void;
}) {
  const set = (patch: Partial<QuizDraft>) => onChange({ ...draft, ...patch });
  return (
    <div className="hgadm-cpc">
      <div className="hgins-seg" role="radiogroup" aria-label="답 형식">
        {FORMATS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={draft.answer_format === value}
            disabled={readOnly}
            className={`hgins-seg__btn${draft.answer_format === value ? " is-on" : ""}`}
            onClick={() => set({ answer_format: value })}
          >
            {label}
          </button>
        ))}
      </div>
      <Labeled label="문제" required>
        <Textarea
          rows={2}
          value={draft.prompt}
          readOnly={readOnly}
          aria-label="문제"
          placeholder="예: 들은 내용과 같은 것을 고르십시오."
          onChange={(e) => set({ prompt: e.target.value })}
        />
      </Labeled>
      <Labeled label="지문" hint="선택 · 표나 서식이 필요하면 HTML로 쓸 수 있어요">
        <Textarea
          rows={2}
          value={draft.content_html}
          readOnly={readOnly}
          aria-label="지문"
          onChange={(e) => set({ content_html: e.target.value })}
        />
      </Labeled>

      {draft.answer_format === "single_choice" && (
        <div role="group" aria-label="보기">
          <span className="hgadm-field__label">보기 · 정답을 고르세요</span>
          {draft.choices.map((choice, i) => (
            <div className="hgadm-cpc__choice" key={choice.key}>
              <input
                type="radio"
                name="cp-correct"
                checked={draft.correct_choice === choice.key}
                disabled={readOnly}
                onChange={() => set({ correct_choice: choice.key })}
                aria-label={`정답: 보기 ${choice.key}`}
              />
              <span className="hgadm-cpc__key">{choice.key}</span>
              <Input
                value={choice.text}
                readOnly={readOnly}
                aria-label={`보기 ${choice.key}`}
                onChange={(e) => {
                  const choices = [...draft.choices];
                  choices[i] = { ...choice, text: e.target.value };
                  set({ choices });
                }}
              />
              {!readOnly && draft.choices.length > 2 && (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`보기 ${choice.key} 삭제`}
                  onClick={() => onChange(renumber(draft, draft.choices.filter((_, j) => j !== i)))}
                >
                  <X size={14} strokeWidth={2} />
                </Button>
              )}
            </div>
          ))}
          {!readOnly && draft.choices.length < 5 && (
            <Button size="sm" variant="ghost" onClick={() => onChange(renumber(draft, [...draft.choices, { key: "", text: "" }]))}>
              + 보기 추가
            </Button>
          )}
        </div>
      )}

      {draft.answer_format === "short_answer" && (
        <div role="group" aria-label="정답">
          <span className="hgadm-field__label">정답 · 빈칸이 여럿이면 ㄱ·ㄴ처럼 표시를 붙이세요</span>
          {draft.blanks.map((blank, i) => (
            <div className="hgadm-cpc__choice" key={i}>
              <Input
                style={{ width: 64 }}
                value={blank.label}
                readOnly={readOnly}
                placeholder="표시"
                aria-label={`빈칸 ${i + 1} 표시`}
                onChange={(e) => {
                  const blanks = [...draft.blanks];
                  blanks[i] = { ...blank, label: e.target.value };
                  set({ blanks });
                }}
              />
              <Input
                value={blank.answer}
                readOnly={readOnly}
                placeholder="정답 (비우면 채점 기준으로 채점)"
                aria-label={`빈칸 ${i + 1} 정답`}
                onChange={(e) => {
                  const blanks = [...draft.blanks];
                  blanks[i] = { ...blank, answer: e.target.value };
                  set({ blanks });
                }}
              />
              {!readOnly && draft.blanks.length > 1 && (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`빈칸 ${i + 1} 삭제`}
                  onClick={() => set({ blanks: draft.blanks.filter((_, j) => j !== i) })}
                >
                  <X size={14} strokeWidth={2} />
                </Button>
              )}
            </div>
          ))}
          {!readOnly && (
            <Button size="sm" variant="ghost" onClick={() => set({ blanks: [...draft.blanks, { label: "", answer: "" }] })}>
              + 빈칸 추가
            </Button>
          )}
        </div>
      )}

      {criteriaGraded(draft) && (
        <>
          <div className="hgadm-cpc__row">
            <Labeled label="최대 글자 수" required={draft.answer_format === "free_response"}>
              <Input
                type="number"
                min={1}
                value={draft.answer_max_length}
                readOnly={readOnly}
                aria-label="최대 글자 수"
                onChange={(e) => set({ answer_max_length: e.target.value })}
              />
            </Labeled>
            <Labeled label="만점" required>
              <Input
                type="number"
                min={1}
                value={draft.max_score}
                readOnly={readOnly}
                aria-label="만점"
                onChange={(e) => set({ max_score: e.target.value })}
              />
            </Labeled>
          </div>
          <Labeled label="채점 기준" required hint="한 줄에 하나씩">
            <Textarea
              rows={2}
              value={draft.scoring_criteria}
              readOnly={readOnly}
              aria-label="채점 기준"
              onChange={(e) => set({ scoring_criteria: e.target.value })}
            />
          </Labeled>
        </>
      )}

      <Labeled label="해설" hint="선택 · 답한 뒤 학습자에게 보여요">
        <Textarea
          rows={2}
          value={draft.explanation}
          readOnly={readOnly}
          aria-label="해설"
          onChange={(e) => set({ explanation: e.target.value })}
        />
      </Labeled>

      <details className="hgadm-cpc__more">
        <summary>더 보기 (급수·힌트·번역·TOPIK 유형)</summary>
        <div className="hgadm-cpc__row">
          <Labeled label="TOPIK 급수">
            <Select value={draft.level} disabled={readOnly} aria-label="TOPIK 급수" onChange={(e) => set({ level: e.target.value })}>
              {TOPIK_GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}급
                </option>
              ))}
            </Select>
          </Labeled>
          <Labeled label="TOPIK 영역">
            <Select
              value={draft.topik_section}
              disabled={readOnly}
              aria-label="TOPIK 영역"
              onChange={(e) =>
                set({
                  topik_section: e.target.value,
                  topik_question_type: typeForSection(draft.topik_question_type, e.target.value),
                })
              }
            >
              <option value="">해당 없음</option>
              <option value="listening">듣기</option>
              <option value="reading">읽기</option>
              <option value="writing">쓰기</option>
            </Select>
          </Labeled>
        </div>
        <Labeled label="문제 유형" hint="영역을 고르면 그 영역의 유형만 보여요.">
          <TopikTypeSelect
            value={draft.topik_question_type}
            section={draft.topik_section}
            disabled={readOnly}
            aria-label="문제 유형"
            onChange={(code) => set({ topik_question_type: code })}
          />
        </Labeled>
        <Labeled label="힌트">
          <Input value={draft.hint} readOnly={readOnly} aria-label="힌트" onChange={(e) => set({ hint: e.target.value })} />
        </Labeled>
        <Labeled label="문제 번역 (영어)">
          <Input
            value={draft.prompt_translation}
            readOnly={readOnly}
            aria-label="문제 번역 (영어)"
            onChange={(e) => set({ prompt_translation: e.target.value })}
          />
        </Labeled>
      </details>
    </div>
  );
}

// ---- Starting from existing content ---------------------------------------------

/**
 * Search the shared sentences / question bank and copy one into the form. It
 * is copied, not linked: the checkpoint keeps its own content.
 */
export function CopyFromCatalog({
  kind,
  onSentence,
  onQuiz,
}: {
  kind: "sentence" | "quiz";
  onSentence: (s: AdminSentence) => void;
  onQuiz: (q: AdminQuiz) => void;
}) {
  const [q, setQ] = useState("");
  const sentences = useQuery({
    queryKey: ["admin", "checkpoint-copy", "sentence", q],
    queryFn: () => adminApi.listSentences({ q: q || undefined, page: 1, page_size: 8 }),
    enabled: kind === "sentence",
  });
  const quizzes = useQuery({
    queryKey: ["admin", "checkpoint-copy", "quiz", q],
    queryFn: () => adminApi.listQuizzes({ q: q || undefined, limit: 8, offset: 0 }),
    enabled: kind === "quiz",
  });
  const active = kind === "sentence" ? sentences : quizzes;
  const noun = kind === "sentence" ? "문장" : "문제";
  return (
    <div className="hgadm-cp__picker">
      <SearchBox value={q} placeholder={kind === "sentence" ? "한국어·번역 검색" : "문제 내용 검색"} onSearch={setQ} />
      {active.isPending ? (
        <LoadingState />
      ) : active.isError ? (
        <ErrorState message={errorMessage(active.error)} onRetry={() => void active.refetch()} />
      ) : kind === "sentence" ? (
        (sentences.data?.items ?? []).length === 0 ? (
          <div className="hgadm-cp__none">{q ? `‘${q}’에 맞는 ${noun}이 없어요.` : `등록된 ${noun}이 없어요.`}</div>
        ) : (
          <ul className="hgadm-cp__options">
            {(sentences.data?.items ?? []).map((s) => (
              <li key={s.sentence_id}>
                <button type="button" className="hgadm-cp__option" onClick={() => onSentence(s)}>
                  <span className="hgadm-cp__option-label">{s.korean}</span>
                  <span className="hgadm-cp__option-detail">{s.translation}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : (quizzes.data?.items ?? []).length === 0 ? (
        <div className="hgadm-cp__none">{q ? `‘${q}’에 맞는 ${noun}가 없어요.` : `등록된 ${noun}가 없어요.`}</div>
      ) : (
        <ul className="hgadm-cp__options">
          {(quizzes.data?.items ?? []).map((quiz) => (
            <li key={quiz.quiz_id}>
              <button type="button" className="hgadm-cp__option" onClick={() => onQuiz(quiz)}>
                <span className="hgadm-cp__option-label">{quiz.prompt}</span>
                <span className="hgadm-cp__option-detail">{quiz.choices.map((c) => `${c.key}) ${c.text}`).join("   ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A label above a control, without `Field`'s wrapping <label> (which would hijack clicks in groups). */
function Labeled({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="hgadm-field">
      <span className="hgadm-field__label">
        {label}
        {required && <span className="hgadm-field__req"> *</span>}
      </span>
      {children}
      {hint && <span className="hgadm-field__hint">{hint}</span>}
    </div>
  );
}

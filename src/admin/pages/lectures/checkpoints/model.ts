import type { AdminCheckpoint, AdminCheckpointWrite, CheckpointInteractionType } from "../../../api";
import type { BadgeTone } from "../../../components/kit";
import { roundTime } from "../../../lib/videoFile";
import type { QuizDraft } from "../../quizzes/draft";
import type { SentenceForm } from "../CheckpointContent";
import {
  emptyQuiz,
  emptySentence,
  quizBody,
  quizFormFrom,
  quizProblem,
  sentenceBody,
  sentenceFormFrom,
  sentenceProblem,
} from "../CheckpointContent";

/** The two modals a lecture can pause for (COU-006 conversation, COU-011 TOPIK). */
export type ContentKind = "sentence" | "quiz";

/** A conversation lecture pauses for sentences to repeat; a TOPIK lecture for questions. */
const KIND_BY_TRACK: Record<string, ContentKind> = {
  track_conversation: "sentence",
  track_topik: "quiz",
};

export function contentKindOf(trackId: string): ContentKind {
  return KIND_BY_TRACK[trackId] ?? "sentence";
}

type KindCopy ={ add: string; noun: string; heading: string; hint: string };

export const KIND_COPY: Record<ContentKind, KindCopy> = {
  sentence: {
    add: "이 지점에 회화 문장 추가",
    noun: "회화 문장",
    heading: "따라 말할 문장",
    hint: "학습자는 이 지점에서 문장을 듣고 따라 말해요. 여기서 쓴 문장은 이 강의 전용이라 문장 관리 목록에는 나오지 않아요.",
  },
  quiz: {
    add: "이 지점에 TOPIK 문제 추가",
    noun: "TOPIK 문제",
    heading: "풀 문제",
    hint: "학습자는 이 지점에서 문제를 풀어요. 객관식은 선택형, 단답형·서술형은 답안 입력 모달로 열려요. 여기서 쓴 문제는 이 강의 전용이에요.",
  },
};

export const TYPE_LABEL: Record<CheckpointInteractionType, [string, BadgeTone]> = {
  speaking_exercise: ["회화 · 따라 말하기", "info"],
  multiple_choice: ["TOPIK · 객관식", "brand"],
  short_answer: ["TOPIK · 주관식/쓰기", "warning"],
};

/** The closest two checkpoints may sit (the server refuses closer). */
export const MIN_GAP_SECONDS = 1;
/** "미리보기" plays the lead-up to a checkpoint and stops on it, as a learner meets it. */
export const LEAD_IN_SECONDS = 3;

export interface Draft {
  checkpointId: string | null;
  /** Seconds into the video, to the hundredth — taken from the preview, never typed. */
  at: number;
  /** The checkpoint's content, written here (one of the two, by lecture kind). */
  sentence: SentenceForm | null;
  quiz: QuizDraft | null;
  /**
   * An older checkpoint's link to shared catalogue content, kept while its
   * content is not edited; editing it makes the lecture its own copy.
   */
  linkedId: string | null;
}

export const kindOf = (c: AdminCheckpoint): ContentKind => (c.sentence_id ? "sentence" : "quiz");

/** A new checkpoint at `at`, with empty content of the lecture's kind. */
export function newDraft(kind: ContentKind, at: number): Draft {
  return {
    checkpointId: null,
    at: roundTime(at),
    sentence: kind === "sentence" ? emptySentence() : null,
    quiz: kind === "quiz" ? emptyQuiz() : null,
    linkedId: null,
  };
}

/** An existing checkpoint opened for editing. */
export function draftFromCheckpoint(checkpoint: AdminCheckpoint, kind: ContentKind): Draft {
  // Content of the other kind (from before checkpoints followed the lecture)
  // has to be replaced, so the editor starts it empty.
  const fits = kindOf(checkpoint) === kind && !checkpoint.content_archived;
  const sentence = fits && checkpoint.sentence ? sentenceFormFrom(checkpoint.sentence) : null;
  const quiz = fits && checkpoint.quiz ? quizFormFrom(checkpoint.quiz) : null;
  return {
    checkpointId: checkpoint.checkpoint_id,
    at: roundTime(checkpoint.at_second),
    sentence: kind === "sentence" ? (sentence ?? emptySentence()) : null,
    quiz: kind === "quiz" ? (quiz ?? emptyQuiz()) : null,
    linkedId: fits && !checkpoint.content_owned ? (checkpoint.sentence_id ?? checkpoint.quiz_id ?? null) : null,
  };
}

/** The request body: a link to shared content, or the content written here. */
export function draftBody(d: Draft, kind: ContentKind): AdminCheckpointWrite {
  const content: Omit<AdminCheckpointWrite, "at_second"> = d.linkedId
    ? kind === "sentence"
      ? { sentence_id: d.linkedId }
      : { quiz_id: d.linkedId }
    : kind === "sentence"
      ? { sentence: sentenceBody(d.sentence ?? emptySentence()) }
      : { quiz: quizBody(d.quiz ?? emptyQuiz()) };
  return { at_second: d.at, ...content };
}

/**
 * Whether the draft can be saved: inside the video, at least MIN_GAP_SECONDS
 * from every other checkpoint (the server refuses it too), and with complete
 * content unless it links to shared content.
 */
export function checkDraft(draft: Draft | null, items: AdminCheckpoint[], duration: number, kind: ContentKind) {
  if (!draft) return { clash: undefined, contentProblem: null, canSave: false };
  const clash = items.find((c) => c.checkpoint_id !== draft.checkpointId && Math.abs(c.at_second - draft.at) < MIN_GAP_SECONDS);
  const inside = draft.at >= 0 && draft.at < duration;
  const contentProblem = draft.linkedId
    ? null
    : kind === "sentence"
      ? sentenceProblem(draft.sentence ?? emptySentence())
      : quizProblem(draft.quiz ?? emptyQuiz());
  return { clash, contentProblem, canSave: inside && !clash && contentProblem === null };
}

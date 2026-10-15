import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { adminApi } from "../../api";
import type { AdminCheckpoint, AdminCheckpointWrite, AdminLecture, CheckpointInteractionType } from "../../api";
import { StreamVideo } from "../../../components/StreamVideo";
import { formatPrecise, parseTime, roundTime } from "../../lib/videoFile";
import { errorMessage } from "../../../lib/http";
import { useToast, useToastError } from "../../../hooks/toast";
import { Badge, Button, ConfirmDialog, ErrorState, LoadingState } from "../../components/kit";
import type { BadgeTone } from "../../components/kit";
import type { QuizDraft } from "../Quizzes";
import type { SentenceForm } from "./CheckpointContent";
import {
  CopyFromCatalog,
  QuizFields,
  SentenceFields,
  emptyQuiz,
  emptySentence,
  quizBody,
  quizFormFrom,
  quizProblem,
  sentenceBody,
  sentenceFormFrom,
  sentenceProblem,
} from "./CheckpointContent";

/** The two modals a lecture can pause for (COU-006 conversation, COU-011 TOPIK). */
type ContentKind = "sentence" | "quiz";

/** A conversation lecture pauses for sentences to repeat; a TOPIK lecture for questions. */
const KIND_BY_TRACK: Record<string, ContentKind> = {
  track_conversation: "sentence",
  track_topik: "quiz",
};

const KIND_COPY: Record<ContentKind, { add: string; noun: string; heading: string; hint: string }> = {
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
const LEAD_IN_SECONDS = 3;
const SPEEDS = [1, 0.5] as const;
/** At most this many fresh preview URLs per window before showing the error. */
const STREAM_REFRESH_LIMIT = 2;
const STREAM_REFRESH_WINDOW_MS = 5 * 60 * 1000;

interface Draft {
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

const kindOf = (c: AdminCheckpoint): ContentKind => (c.sentence_id ? "sentence" : "quiz");

/**
 * Step 3 of a lecture: where the video pauses for a modal — a sentence to
 * repeat on a conversation lecture, a TOPIK question on a TOPIK lecture.
 *
 * Checkpoints are placed by watching the lecture's own video, shown whole
 * (never cropped): play, drag the timeline, or step by 1s / 0.1s (also ←/→,
 * Shift for 0.1s, Space to play) to the moment, then add one there. Times
 * keep hundredths of a second. Every checkpoint is a marker on the timeline;
 * opening one moves the preview to it, and "미리보기" plays the few seconds
 * before it and stops on it, as the learner will meet it. Checkpoints must be
 * at least 1s apart (checked here and by the server), inside the video, and
 * are flagged when the video they were placed on has since been replaced.
 */
export function CheckpointEditor({ lecture, canWrite }: { lecture: AdminLecture; canWrite: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const stopAtRef = useRef<number | null>(null);
  const [now, setNow] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(SPEEDS[0]);
  const [videoError, setVideoError] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<AdminCheckpoint | null>(null);
  const key = ["admin", "lecture-checkpoints", lecture.lecture_id];
  const kind = KIND_BY_TRACK[lecture.track_id] ?? "sentence";
  const copy = KIND_COPY[kind];

  const list = useQuery({ queryKey: key, queryFn: () => adminApi.listCheckpoints(lecture.lecture_id) });
  const videoId = list.data?.video_id ?? null;
  const preview = useQuery({
    queryKey: ["admin", "lecture-preview", lecture.lecture_id, videoId],
    queryFn: () => adminApi.previewLectureVideo(lecture.lecture_id),
    enabled: !!videoId,
    // A new URL reloads the video and loses the frame being placed, so the
    // URL is only replaced when the stream actually fails (it is signed for at
    // least the video's length plus slack) — never on a timer or tab focus.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  // Where to pick up once a fresh URL has loaded, and recent refreshes (a
  // stream that keeps failing shows the error instead of looping).
  const restoreRef = useRef<{ at: number; play: boolean } | null>(null);
  const refreshTimesRef = useRef<number[]>([]);

  /** The stream stopped (usually its signed URL ran out): fetch a fresh one and keep the frame. */
  function refreshStream() {
    const stamp = Date.now();
    const recent = refreshTimesRef.current.filter((t) => stamp - t < STREAM_REFRESH_WINDOW_MS);
    refreshTimesRef.current = recent;
    const v = videoRef.current;
    const previousUrl = preview.data?.url;
    if (recent.length >= STREAM_REFRESH_LIMIT) {
      setVideoError(true);
      return;
    }
    refreshTimesRef.current = [...recent, stamp];
    restoreRef.current = { at: v?.currentTime ?? now, play: !!v && !v.paused };
    void preview.refetch().then((r) => {
      // The same URL again (an offline file that will not load) cannot help.
      if (r.isError || r.data?.url === previousUrl) {
        restoreRef.current = null;
        setVideoError(true);
      }
    });
  }

  const duration = list.data?.duration_seconds ?? 0;
  const items = list.data?.items ?? [];

  function refresh() {
    void qc.invalidateQueries({ queryKey: key });
    // The lecture list and page header show the checkpoint count.
    void qc.invalidateQueries({ queryKey: ["admin", "lectures"] });
    void qc.invalidateQueries({ queryKey: ["admin", "lecture", lecture.lecture_id] });
  }

  function seek(seconds: number) {
    const target = roundTime(Math.max(0, Math.min(seconds, Math.max(0, duration - 0.05))));
    stopAtRef.current = null;
    setNow(target);
    if (videoRef.current) videoRef.current.currentTime = target;
    return target;
  }

  function pause() {
    videoRef.current?.pause();
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    stopAtRef.current = null;
    if (v.paused) void v.play();
    else v.pause();
  }

  /** Play the lead-up to `at` and stop on it — what the learner sees before the modal. */
  function previewTo(at: number) {
    seek(at - LEAD_IN_SECONDS);
    stopAtRef.current = at;
    void videoRef.current?.play();
  }

  function cycleSpeed() {
    const next = SPEEDS[(SPEEDS.indexOf(speed as (typeof SPEEDS)[number]) + 1) % SPEEDS.length];
    setSpeed(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
  }

  function startAdd() {
    pause();
    setDraft({
      checkpointId: null,
      at: roundTime(now),
      sentence: kind === "sentence" ? emptySentence() : null,
      quiz: kind === "quiz" ? emptyQuiz() : null,
      linkedId: null,
    });
  }

  function select(checkpoint: AdminCheckpoint) {
    pause();
    seek(checkpoint.at_second);
    // Content of the other kind (from before checkpoints followed the
    // lecture) has to be replaced, so the editor starts it empty.
    const fits = kindOf(checkpoint) === kind && !checkpoint.content_archived;
    const sentence = fits && checkpoint.sentence ? sentenceFormFrom(checkpoint.sentence) : null;
    const quiz = fits && checkpoint.quiz ? quizFormFrom(checkpoint.quiz) : null;
    setDraft({
      checkpointId: checkpoint.checkpoint_id,
      at: roundTime(checkpoint.at_second),
      sentence: kind === "sentence" ? sentence ?? emptySentence() : null,
      quiz: kind === "quiz" ? quiz ?? emptyQuiz() : null,
      linkedId:
        fits && !checkpoint.content_owned ? (checkpoint.sentence_id ?? checkpoint.quiz_id ?? null) : null,
    });
  }

  /** Move the draft's time, and the preview with it, so the frame is in view. */
  function moveDraft(to: number) {
    if (!draft) return;
    pause();
    setDraft({ ...draft, at: seek(to) });
  }

  // Keyboard: Space plays/pauses; ←/→ step 1s (Shift: 0.1s) — the draft's
  // time while one is open, the preview's otherwise.
  const keyState = useRef({ now, draft, duration });
  keyState.current = { now, draft, duration };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(el.tagName))) return;
      const step = e.shiftKey ? 0.1 : 1;
      const { now: at, draft: d } = keyState.current;
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const delta = e.key === "ArrowLeft" ? -step : step;
        if (d) moveDraft(d.at + delta);
        else seek(at + delta);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const save = useMutation({
    mutationFn: (d: Draft) => {
      const content: Omit<AdminCheckpointWrite, "at_second"> = d.linkedId
        ? kind === "sentence"
          ? { sentence_id: d.linkedId }
          : { quiz_id: d.linkedId }
        : kind === "sentence"
          ? { sentence: sentenceBody(d.sentence ?? emptySentence()) }
          : { quiz: quizBody(d.quiz ?? emptyQuiz()) };
      const body: AdminCheckpointWrite = { at_second: d.at, ...content };
      return d.checkpointId
        ? adminApi.replaceCheckpoint(lecture.lecture_id, d.checkpointId, body)
        : adminApi.createCheckpoint(lecture.lecture_id, body);
    },
    onSuccess: () => {
      toast.success("체크포인트를 저장했어요.");
      setDraft(null);
      refresh();
    },
    onError: toastError,
  });

  const remove = useMutation({
    mutationFn: (checkpoint: AdminCheckpoint) => adminApi.deleteCheckpoint(lecture.lecture_id, checkpoint.checkpoint_id),
    onSuccess: () => {
      toast.success("체크포인트를 삭제했어요.");
      setDeleting(null);
      setDraft(null);
      refresh();
    },
    onError: toastError,
  });

  // Another checkpoint less than MIN_GAP_SECONDS away (the server refuses it too).
  const clash = draft
    ? items.find((c) => c.checkpoint_id !== draft.checkpointId && Math.abs(c.at_second - draft.at) < MIN_GAP_SECONDS)
    : undefined;
  const inside = !!draft && draft.at >= 0 && draft.at < duration;
  const contentProblem = !draft
    ? null
    : draft.linkedId
      ? null
      : kind === "sentence"
        ? sentenceProblem(draft.sentence ?? emptySentence())
        : quizProblem(draft.quiz ?? emptyQuiz());
  const canSave = !!draft && inside && !clash && contentProblem === null;

  if (list.isPending) return <LoadingState />;
  if (list.isError) return <ErrorState message={errorMessage(list.error)} onRetry={() => void list.refetch()} />;

  if (!videoId) {
    return (
      <div className="hgadm-lw__locked">
        영상이 올라가고 재생 가능 상태가 되면, 영상을 보면서 원하는 지점에 {copy.noun}를 추가할 수 있어요.
        {items.length > 0 && ` (기존 체크포인트 ${items.length}개는 영상이 준비되면 다시 표시됩니다.)`}
      </div>
    );
  }

  const review = items.filter((c) => c.needs_review || c.out_of_range || kindOf(c) !== kind).length;

  return (
    <div className="hgadm-cpe">
      {review > 0 && (
        <div className="hgadm-cpe__warn" role="alert">
          확인이 필요한 체크포인트가 {review}개 있어요. 영상이 바뀌었거나 강의 종류와 맞지 않는 항목이에요 — 눌러서
          시점과 내용을 확인하고 저장해 주세요.
        </div>
      )}

      <div className="hgadm-cpe__layout">
        <div className="hgadm-cpe__stage">
          {/* The whole frame at its own aspect ratio — a portrait lecture is
              shown tall, a landscape one wide; never cropped or stretched. */}
          <div className="hgadm-cpe__screen">
            {preview.isPending ? (
              <LoadingState />
            ) : preview.isError || videoError ? (
              <ErrorState
                message="영상을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
                onRetry={() => {
                  setVideoError(false);
                  refreshTimesRef.current = [];
                  restoreRef.current = { at: now, play: false };
                  void preview.refetch();
                }}
              />
            ) : (
              <StreamVideo
                ref={videoRef}
                src={preview.data.url}
                className="hgadm-cpe__video"
                playsInline
                // "auto", so the first frame is on screen before anything is played.
                preload="auto"
                onClick={togglePlay}
                onTimeUpdate={(e) => {
                  const v = e.currentTarget;
                  const stopAt = stopAtRef.current;
                  if (stopAt !== null && v.currentTime >= stopAt) {
                    stopAtRef.current = null;
                    v.pause();
                    v.currentTime = stopAt;
                    setNow(stopAt);
                    return;
                  }
                  setNow(v.currentTime);
                }}
                onSeeked={(e) => setNow(e.currentTarget.currentTime)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onLoadedMetadata={(e) => {
                  // After a fresh URL: back to the same frame.
                  const restore = restoreRef.current;
                  if (!restore) return;
                  restoreRef.current = null;
                  const v = e.currentTarget;
                  v.currentTime = restore.at;
                  setNow(restore.at);
                  if (restore.play) void v.play().catch(() => setPlaying(false));
                }}
                onStreamError={refreshStream}
              />
            )}
          </div>

          <div className="hgadm-cpe__controls">
            <Button size="sm" variant="primary" onClick={togglePlay} aria-label={playing ? "일시정지" : "재생"}>
              {playing ? "❚❚" : "▶"}
            </Button>
            <span className="hgadm-cpe__clock" aria-live="off">
              <strong>{formatPrecise(now)}</strong> / {formatPrecise(duration)}
            </span>
            <div className="hgadm-cpe__nudges" role="group" aria-label="미세 이동">
              {[-1, -0.1, 0.1, 1].map((step) => (
                <Button key={step} size="sm" variant="ghost" onClick={() => seek(now + step)}>
                  {step > 0 ? `+${step}초` : `${step}초`}
                </Button>
              ))}
            </div>
            <Button size="sm" variant="ghost" onClick={cycleSpeed} aria-label={`재생 속도 ${speed}배`}>
              {speed}x
            </Button>
          </div>

          <Timeline
            trackRef={trackRef}
            duration={duration}
            now={now}
            items={items}
            kind={kind}
            selectedId={draft?.checkpointId ?? null}
            draftAt={draft ? draft.at : null}
            onSeek={(s) => {
              pause();
              seek(s);
            }}
            onSelect={select}
          />
          <p className="hgadm-cpe__keys">
            Space 재생/정지 · ←/→ 1초 · Shift+←/→ 0.1초 · 마커를 누르면 그 체크포인트로 이동
          </p>

          {canWrite && !draft && (
            <div className="hgadm-cpe__add">
              <Button variant="primary" onClick={startAdd}>
                + {copy.add} ({formatPrecise(now)})
              </Button>
            </div>
          )}
        </div>

        <aside className="hgadm-cpe__side">
          {draft ? (
            <DraftPanel
              draft={draft}
              kind={kind}
              now={roundTime(now)}
              duration={duration}
              clash={clash}
              canWrite={canWrite}
              saving={save.isPending}
              canSave={canSave}
              contentProblem={contentProblem}
              onChange={setDraft}
              onMove={moveDraft}
              onPreview={() => previewTo(draft.at)}
              onSave={() => save.mutate(draft)}
              onCancel={() => setDraft(null)}
              onDelete={
                draft.checkpointId
                  ? () => setDeleting(items.find((c) => c.checkpoint_id === draft.checkpointId) ?? null)
                  : undefined
              }
            />
          ) : (
            <CheckpointList items={items} kind={kind} copy={copy} onSelect={select} onPreview={(c) => previewTo(c.at_second)} />
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title="체크포인트 삭제"
        message={`${deleting ? formatPrecise(deleting.at_second) : ""} 지점의 체크포인트를 삭제할까요? ${
          deleting?.content_owned
            ? "이 체크포인트에서 만든 문장·문제도 함께 보관 처리돼요."
            : "연결된 공용 문장·문제는 그대로 남아요."
        }`}
        danger
        confirmLabel="삭제"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

/**
 * The scrub bar with a marker per checkpoint. Press and drag anywhere on it
 * to scrub; press a marker to open that checkpoint.
 */
function Timeline({
  trackRef,
  duration,
  now,
  items,
  kind,
  selectedId,
  draftAt,
  onSeek,
  onSelect,
}: {
  trackRef: React.RefObject<HTMLDivElement>;
  duration: number;
  now: number;
  items: AdminCheckpoint[];
  kind: ContentKind;
  selectedId: string | null;
  draftAt: number | null;
  onSeek: (seconds: number) => void;
  onSelect: (checkpoint: AdminCheckpoint) => void;
}) {
  const pct = (s: number) => `${duration ? Math.min(100, (s / duration) * 100) : 0}%`;
  const at = (e: ReactPointerEvent) => {
    const box = (trackRef.current as HTMLDivElement).getBoundingClientRect();
    return ((e.clientX - box.left) / box.width) * duration;
  };
  return (
    <div className="hgadm-cpe__timeline">
      <div
        ref={trackRef}
        className="hgadm-cpe__track"
        role="slider"
        aria-label="재생 위치"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={roundTime(now)}
        aria-valuetext={formatPrecise(now)}
        tabIndex={0}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId);
          onSeek(at(e));
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture?.(e.pointerId)) onSeek(at(e));
        }}
      >
        <span className="hgadm-cpe__played" style={{ width: pct(now) }} />
        <span className="hgadm-cpe__head" style={{ left: pct(now) }} />
      </div>
      <div className="hgadm-cpe__markers">
        {items.map((c) => (
          <button
            key={c.checkpoint_id}
            type="button"
            className={[
              "hgadm-cpe__marker",
              `is-${c.sentence_id ? "speak" : "topik"}`,
              c.checkpoint_id === selectedId ? "is-selected" : "",
              c.needs_review || c.out_of_range || kindOf(c) !== kind ? "is-flagged" : "",
            ].join(" ")}
            style={{ left: pct(c.out_of_range ? duration : c.at_second) }}
            title={`${formatPrecise(c.at_second)} · ${TYPE_LABEL[c.interaction_type][0]}`}
            aria-label={`${formatPrecise(c.at_second)} ${TYPE_LABEL[c.interaction_type][0]} 체크포인트`}
            onClick={() => onSelect(c)}
          />
        ))}
        {draftAt !== null && selectedId === null && (
          <span className="hgadm-cpe__marker is-draft" style={{ left: pct(draftAt) }} aria-hidden />
        )}
      </div>
    </div>
  );
}

function CheckpointList({
  items,
  kind,
  copy,
  onSelect,
  onPreview,
}: {
  items: AdminCheckpoint[];
  kind: ContentKind;
  copy: (typeof KIND_COPY)[ContentKind];
  onSelect: (c: AdminCheckpoint) => void;
  onPreview: (c: AdminCheckpoint) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="hgadm-cpe__empty">
        아직 체크포인트가 없어요. 영상을 재생하거나 타임라인을 끌어 원하는 지점으로 이동한 뒤, ‘{copy.add}’를
        누르고 그 자리에서 {copy.noun}를 바로 쓰면 돼요. 미리 다른 메뉴에서 만들어 둘 필요가 없어요.
      </div>
    );
  }
  return (
    <ul className="hgadm-cpe__list" aria-label="체크포인트 목록">
      {items.map((c) => {
        const [label, tone] = TYPE_LABEL[c.interaction_type];
        return (
          <li key={c.checkpoint_id} className="hgadm-cpe__row">
            <button type="button" className="hgadm-cpe__item" onClick={() => onSelect(c)}>
              <span className="hgadm-cpe__time">{formatPrecise(c.at_second)}</span>
              <span className="hgadm-cpe__item-body">
                <Badge tone={tone}>{label}</Badge>
                <span className="hgadm-cell-main">{c.content_label ?? "(삭제된 콘텐츠)"}</span>
                {c.content_detail && <span className="hgadm-cell-sub">{c.content_detail}</span>}
                {kindOf(c) !== kind ? (
                  <Badge tone="danger">강의 종류와 맞지 않음 — 교체 필요</Badge>
                ) : c.out_of_range ? (
                  <Badge tone="danger">영상 길이를 벗어남</Badge>
                ) : c.needs_review ? (
                  <Badge tone="warning">영상 교체 후 확인 필요</Badge>
                ) : null}
                {c.content_archived && <Badge tone="danger">보관된 콘텐츠 — 교체 필요</Badge>}
                {c.content_owned === false && !c.content_archived && kindOf(c) === kind && (
                  <Badge tone="neutral">공용 콘텐츠 연결</Badge>
                )}
              </span>
            </button>
            <Button size="sm" variant="secondary" onClick={() => onPreview(c)} aria-label={`${formatPrecise(c.at_second)} 미리보기`}>
              <Play size={12} strokeWidth={2.25} aria-hidden />
              미리보기
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

function DraftPanel({
  draft,
  kind,
  now,
  duration,
  clash,
  canWrite,
  saving,
  canSave,
  contentProblem,
  onChange,
  onMove,
  onPreview,
  onSave,
  onCancel,
  onDelete,
}: {
  draft: Draft;
  kind: ContentKind;
  now: number;
  duration: number;
  clash: AdminCheckpoint | undefined;
  canWrite: boolean;
  saving: boolean;
  canSave: boolean;
  contentProblem: string | null;
  onChange: (draft: Draft) => void;
  onMove: (to: number) => void;
  onPreview: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const copy = KIND_COPY[kind];
  return (
    <div className="hgadm-cpe__draft" aria-label="체크포인트 편집">
      <div className="hgadm-cpe__draft-title">
        {draft.checkpointId ? "체크포인트 편집" : `새 체크포인트 · ${copy.noun}`}
      </div>

      <Group label="재생 시점">
        <div className="hgadm-cpe__at">
          {canWrite ? (
            <TimeInput value={draft.at} duration={duration} onCommit={onMove} />
          ) : (
            <strong>{formatPrecise(draft.at)}</strong>
          )}
          <Button size="sm" variant="ghost" onClick={onPreview}>
            앞 {LEAD_IN_SECONDS}초부터 미리보기
          </Button>
        </div>
        {canWrite && (
          <div className="hgadm-cpe__at-nudges" role="group" aria-label="시점 조정">
            {[-1, -0.1, 0.1, 1].map((step) => (
              <Button key={step} size="sm" variant="ghost" onClick={() => onMove(draft.at + step)}>
                {step > 0 ? `+${step}초` : `${step}초`}
              </Button>
            ))}
            {now !== draft.at && (
              <Button size="sm" onClick={() => onChange({ ...draft, at: now })}>
                현재 위치({formatPrecise(now)})로
              </Button>
            )}
          </div>
        )}
        {draft.at >= duration && (
          <div className="hgadm-lw__error">영상 길이({formatPrecise(duration)}) 안의 지점을 골라 주세요.</div>
        )}
        {clash && (
          <div className="hgadm-lw__error">
            {formatPrecise(clash.at_second)}의 체크포인트와 {MIN_GAP_SECONDS}초 이상 떨어져야 해요.
          </div>
        )}
      </Group>

      <Group label={copy.heading} hint={copy.hint}>
        {draft.linkedId && (
          <div className="hgadm-cpe__linked" role="note">
            공용 {kind === "sentence" ? "문장" : "문제"}이 연결된 체크포인트예요. 내용을 고치면 이 강의 전용 사본으로
            저장되고, 공용 {kind === "sentence" ? "문장" : "문제"}은 그대로 남아요.
          </div>
        )}
        {kind === "sentence" ? (
          <SentenceFields
            form={draft.sentence ?? emptySentence()}
            readOnly={!canWrite}
            // Editing the content detaches it from the shared row it linked.
            onChange={(sentence) => onChange({ ...draft, sentence, linkedId: null })}
          />
        ) : (
          <QuizFields
            draft={draft.quiz ?? emptyQuiz()}
            readOnly={!canWrite}
            onChange={(quiz) => onChange({ ...draft, quiz, linkedId: null })}
          />
        )}
        {canWrite && (
          <details className="hgadm-cpc__more">
            <summary>기존 {kind === "sentence" ? "문장" : "문제"}에서 불러오기</summary>
            <p className="hgadm-field__hint">고르면 내용이 위 칸에 복사돼요. 복사본은 이 강의 전용이고, 원본은 그대로예요.</p>
            <CopyFromCatalog
              kind={kind}
              onSentence={(s) => onChange({ ...draft, sentence: { ...sentenceFormFrom(s) }, linkedId: null })}
              onQuiz={(q) => onChange({ ...draft, quiz: quizFormFrom(q), linkedId: null })}
            />
          </details>
        )}
      </Group>

      {canWrite && contentProblem && <p className="hgadm-field__hint">{contentProblem}</p>}

      <div className="hgadm-cpe__draft-actions">
        {onDelete && canWrite && (
          <Button variant="danger-soft" onClick={onDelete}>
            삭제
          </Button>
        )}
        <span className="hgadm-cpe__spacer" />
        <Button variant="ghost" onClick={onCancel}>
          닫기
        </Button>
        {canWrite && (
          <Button variant="primary" loading={saving} disabled={!canSave} onClick={onSave}>
            저장
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * The checkpoint's time, typed exactly: "1:23.45", "1:02:03.5" or seconds
 * ("83.45"). Applied on Enter or when the field loses focus — the preview
 * jumps there — and Esc puts back the current time.
 */
function TimeInput({ value, duration, onCommit }: { value: number; duration: number; onCommit: (seconds: number) => void }) {
  const [text, setText] = useState(formatPrecise(value));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setText(formatPrecise(value));
    setError(null);
  }, [value]);

  function commit() {
    const seconds = parseTime(text);
    if (seconds === null) {
      setError("1:23.45 또는 83.45처럼 입력해 주세요.");
    } else if (seconds >= duration) {
      setError(`영상 길이(${formatPrecise(duration)})보다 앞선 시점을 입력해 주세요.`);
    } else if (seconds === value) {
      setText(formatPrecise(value));
      setError(null);
    } else {
      setError(null);
      onCommit(seconds);
    }
  }

  return (
    <span className="hgadm-cpe__time-input">
      <input
        className="hgadm-input"
        value={text}
        inputMode="decimal"
        spellCheck={false}
        aria-label="체크포인트 시점 (분:초.00)"
        aria-invalid={error ? true : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            setText(formatPrecise(value));
            setError(null);
          }
        }}
      />
      {error && (
        <span className="hgadm-lw__error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

/**
 * `Field` wraps its control in a <label>, which turns a click anywhere on it
 * into a click on the first button inside — wrong for a radio group or a
 * result list. Same look, as a plain group.
 */
function Group({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="hgadm-field" role="group" aria-label={label}>
      <span className="hgadm-field__label">{label}</span>
      {children}
      {hint && <span className="hgadm-field__hint">{hint}</span>}
    </div>
  );
}


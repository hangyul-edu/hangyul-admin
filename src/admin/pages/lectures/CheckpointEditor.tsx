import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../api";
import type { AdminCheckpoint, AdminCheckpointWrite, AdminLecture, CheckpointInteractionType } from "../../api";
import { StreamVideo } from "../../../components/StreamVideo";
import { formatClock } from "../../lib/videoFile";
import { errorMessage } from "../../../lib/http";
import { useToast, useToastError } from "../../../hooks/toast";
import { Badge, Button, ConfirmDialog, ErrorState, LoadingState, SearchBox } from "../../components/kit";
import type { BadgeTone } from "../../components/kit";

/** The two modals a lecture can pause for (COU-006 conversation, COU-011 TOPIK). */
type ContentKind = "sentence" | "quiz";

export const TYPE_LABEL: Record<CheckpointInteractionType, [string, BadgeTone]> = {
  speaking_exercise: ["회화 · 따라 말하기", "info"],
  multiple_choice: ["TOPIK · 객관식", "brand"],
  short_answer: ["TOPIK · 주관식/쓰기", "warning"],
};

interface Draft {
  checkpointId: string | null;
  kind: ContentKind;
  /** Whole seconds into the video — always taken from the preview, never typed. */
  at: number;
  contentId: string;
  contentLabel: string;
}

/**
 * Step 3 of a lecture: where the video pauses for a conversation or TOPIK
 * modal.
 *
 * Checkpoints are placed by watching the lecture's own video: play or scrub
 * the preview to the moment, then "이 지점에 추가". Every checkpoint is a
 * marker on the timeline; clicking one jumps the preview there. Times come
 * from the video, so they cannot fall outside it, and the server re-checks
 * that. When the video is replaced, checkpoints placed on the old one are
 * flagged until they are confirmed on the new one.
 */
export function CheckpointEditor({ lecture, canWrite }: { lecture: AdminLecture; canWrite: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [now, setNow] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<AdminCheckpoint | null>(null);
  const key = ["admin", "lecture-checkpoints", lecture.lecture_id];

  const list = useQuery({ queryKey: key, queryFn: () => adminApi.listCheckpoints(lecture.lecture_id) });
  const videoId = list.data?.video_id ?? null;
  const preview = useQuery({
    queryKey: ["admin", "lecture-preview", lecture.lecture_id, videoId],
    queryFn: () => adminApi.previewLectureVideo(lecture.lecture_id),
    enabled: !!videoId,
    // Signed URLs expire; a fresh one well before that keeps the preview working.
    staleTime: 5 * 60 * 1000,
  });

  const duration = list.data?.duration_seconds ?? 0;
  const items = list.data?.items ?? [];

  function refresh() {
    void qc.invalidateQueries({ queryKey: key });
    // The lecture list and page header show the checkpoint count.
    void qc.invalidateQueries({ queryKey: ["admin", "lectures"] });
    void qc.invalidateQueries({ queryKey: ["admin", "lecture", lecture.lecture_id] });
  }

  function seek(seconds: number) {
    const target = Math.max(0, Math.min(seconds, Math.max(0, duration - 1)));
    setNow(target);
    if (videoRef.current) videoRef.current.currentTime = target;
  }

  function pause() {
    videoRef.current?.pause();
  }

  function startAdd(kind: ContentKind) {
    pause();
    setDraft({ checkpointId: null, kind, at: Math.floor(now), contentId: "", contentLabel: "" });
  }

  function select(checkpoint: AdminCheckpoint) {
    pause();
    seek(checkpoint.at_second);
    setDraft({
      checkpointId: checkpoint.checkpoint_id,
      kind: checkpoint.sentence_id ? "sentence" : "quiz",
      at: checkpoint.at_second,
      contentId: checkpoint.sentence_id ?? checkpoint.quiz_id ?? "",
      contentLabel: checkpoint.content_label ?? "",
    });
  }

  const save = useMutation({
    mutationFn: (d: Draft) => {
      const body: AdminCheckpointWrite = {
        at_second: d.at,
        ...(d.kind === "sentence" ? { sentence_id: d.contentId } : { quiz_id: d.contentId }),
      };
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

  // Another checkpoint already fires at this second (the server refuses it too).
  const clash = draft ? items.find((c) => c.at_second === draft.at && c.checkpoint_id !== draft.checkpointId) : undefined;
  const inside = !!draft && draft.at >= 0 && draft.at < duration;
  const canSave = !!draft && inside && !clash && !!draft.contentId;

  if (list.isPending) return <LoadingState />;
  if (list.isError) return <ErrorState message={errorMessage(list.error)} onRetry={() => void list.refetch()} />;

  if (!videoId) {
    return (
      <div className="hgadm-lw__locked">
        영상이 올라가고 재생 가능 상태가 되면, 영상을 보면서 원하는 지점에 체크포인트를 추가할 수 있어요.
        {items.length > 0 && ` (기존 체크포인트 ${items.length}개는 영상이 준비되면 다시 표시됩니다.)`}
      </div>
    );
  }

  const review = items.filter((c) => c.needs_review || c.out_of_range).length;

  return (
    <div className="hgadm-cpe">
      {review > 0 && (
        <div className="hgadm-cpe__warn" role="alert">
          영상이 바뀌어 확인이 필요한 체크포인트가 {review}개 있어요. 항목을 눌러 새 영상에서 시점을 확인하고
          저장해 주세요.
        </div>
      )}

      <div className="hgadm-cpe__layout">
        <div className="hgadm-cpe__stage">
          <div className="hgadm-cpe__screen">
            {preview.isPending ? (
              <LoadingState />
            ) : preview.isError || videoError ? (
              <ErrorState
                message="영상을 불러오지 못했어요. 잠시 후 다시 시도해 주세요."
                onRetry={() => {
                  setVideoError(false);
                  void preview.refetch();
                }}
              />
            ) : (
              <StreamVideo
                ref={videoRef}
                src={preview.data.url}
                className="hgadm-cpe__video"
                playsInline
                preload="metadata"
                onClick={() => (videoRef.current?.paused ? void videoRef.current.play() : pause())}
                onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
                onSeeked={(e) => setNow(e.currentTarget.currentTime)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onError={() => setVideoError(true)}
              />
            )}
          </div>

          <div className="hgadm-cpe__controls">
            <Button
              size="sm"
              variant="primary"
              onClick={() => (videoRef.current?.paused ? void videoRef.current.play() : pause())}
              aria-label={playing ? "일시정지" : "재생"}
            >
              {playing ? "❚❚" : "▶"}
            </Button>
            <span className="hgadm-cpe__clock" aria-live="off">
              {formatClock(now)} / {formatClock(duration)}
            </span>
            <div className="hgadm-cpe__nudges" role="group" aria-label="미세 이동">
              {[-5, -1, 1, 5].map((step) => (
                <Button key={step} size="sm" variant="ghost" onClick={() => seek(Math.floor(now) + step)}>
                  {step > 0 ? `+${step}초` : `${step}초`}
                </Button>
              ))}
            </div>
          </div>

          <Timeline
            duration={duration}
            now={now}
            items={items}
            selectedId={draft?.checkpointId ?? null}
            draftAt={draft && !draft.checkpointId ? draft.at : null}
            onSeek={seek}
            onSelect={select}
          />

          {canWrite && !draft && (
            <div className="hgadm-cpe__add">
              <span className="hgadm-muted">{formatClock(now)} 지점에</span>
              <Button size="sm" variant="primary" onClick={() => startAdd("sentence")}>
                + 회화 (따라 말하기)
              </Button>
              <Button size="sm" variant="primary" onClick={() => startAdd("quiz")}>
                + TOPIK 문제
              </Button>
            </div>
          )}
        </div>

        <aside className="hgadm-cpe__side">
          {draft ? (
            <DraftPanel
              draft={draft}
              now={Math.floor(now)}
              duration={duration}
              clash={clash}
              canWrite={canWrite}
              saving={save.isPending}
              canSave={canSave}
              onChange={setDraft}
              onPreview={() => {
                seek(draft.at);
                void videoRef.current?.play();
              }}
              onSave={() => save.mutate(draft)}
              onCancel={() => setDraft(null)}
              onDelete={
                draft.checkpointId
                  ? () => setDeleting(items.find((c) => c.checkpoint_id === draft.checkpointId) ?? null)
                  : undefined
              }
            />
          ) : (
            <CheckpointList items={items} onSelect={select} />
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title="체크포인트 삭제"
        message={`${deleting ? formatClock(deleting.at_second) : ""} 지점의 체크포인트를 삭제할까요? 연결된 문장·문제는 삭제되지 않습니다.`}
        danger
        confirmLabel="삭제"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

/** The scrub bar with a marker per checkpoint; click the bar to seek, a marker to open it. */
function Timeline({
  duration,
  now,
  items,
  selectedId,
  draftAt,
  onSeek,
  onSelect,
}: {
  duration: number;
  now: number;
  items: AdminCheckpoint[];
  selectedId: string | null;
  draftAt: number | null;
  onSeek: (seconds: number) => void;
  onSelect: (checkpoint: AdminCheckpoint) => void;
}) {
  const pct = (s: number) => `${duration ? Math.min(100, (s / duration) * 100) : 0}%`;
  return (
    <div className="hgadm-cpe__timeline">
      <div
        className="hgadm-cpe__track"
        role="slider"
        aria-label="재생 위치"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={Math.floor(now)}
        aria-valuetext={formatClock(now)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") onSeek(Math.floor(now) - 1);
          if (e.key === "ArrowRight") onSeek(Math.floor(now) + 1);
        }}
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          onSeek(Math.round(((e.clientX - box.left) / box.width) * duration));
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
              c.needs_review || c.out_of_range ? "is-flagged" : "",
            ].join(" ")}
            style={{ left: pct(c.out_of_range ? duration : c.at_second) }}
            title={`${formatClock(c.at_second)} · ${TYPE_LABEL[c.interaction_type][0]}`}
            aria-label={`${formatClock(c.at_second)} ${TYPE_LABEL[c.interaction_type][0]} 체크포인트`}
            onClick={() => onSelect(c)}
          />
        ))}
        {draftAt !== null && <span className="hgadm-cpe__marker is-draft" style={{ left: pct(draftAt) }} aria-hidden />}
      </div>
    </div>
  );
}

function CheckpointList({ items, onSelect }: { items: AdminCheckpoint[]; onSelect: (c: AdminCheckpoint) => void }) {
  if (items.length === 0) {
    return (
      <div className="hgadm-cpe__empty">
        아직 체크포인트가 없어요. 영상을 재생하거나 타임라인을 눌러 원하는 지점으로 이동한 뒤, 아래 버튼으로
        추가하세요.
      </div>
    );
  }
  return (
    <ul className="hgadm-cpe__list" aria-label="체크포인트 목록">
      {items.map((c) => {
        const [label, tone] = TYPE_LABEL[c.interaction_type];
        return (
          <li key={c.checkpoint_id}>
            <button type="button" className="hgadm-cpe__item" onClick={() => onSelect(c)}>
              <span className="hgadm-cpe__time">{formatClock(c.at_second)}</span>
              <span className="hgadm-cpe__item-body">
                <Badge tone={tone}>{label}</Badge>
                <span className="hgadm-cell-main">{c.content_label ?? "(삭제된 콘텐츠)"}</span>
                {c.out_of_range ? (
                  <Badge tone="danger">영상 길이를 벗어남</Badge>
                ) : c.needs_review ? (
                  <Badge tone="warning">영상 교체 후 확인 필요</Badge>
                ) : null}
                {c.content_archived && <Badge tone="danger">보관된 콘텐츠 — 교체 필요</Badge>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function DraftPanel({
  draft,
  now,
  duration,
  clash,
  canWrite,
  saving,
  canSave,
  onChange,
  onPreview,
  onSave,
  onCancel,
  onDelete,
}: {
  draft: Draft;
  now: number;
  duration: number;
  clash: AdminCheckpoint | undefined;
  canWrite: boolean;
  saving: boolean;
  canSave: boolean;
  onChange: (draft: Draft) => void;
  onPreview: () => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="hgadm-cpe__draft" aria-label="체크포인트 편집">
      <div className="hgadm-cpe__draft-title">{draft.checkpointId ? "체크포인트 편집" : "새 체크포인트"}</div>

      <Group label="재생 시점">
        <div className="hgadm-cpe__at">
          <strong>{formatClock(draft.at)}</strong>
          <Button size="sm" variant="ghost" onClick={onPreview}>
            이 지점부터 재생
          </Button>
        </div>
        {canWrite && now !== draft.at && (
          <Button size="sm" onClick={() => onChange({ ...draft, at: now })}>
            현재 재생 위치({formatClock(now)})로 옮기기
          </Button>
        )}
        {draft.at >= duration && <div className="hgadm-lw__error">영상 길이({formatClock(duration)}) 안의 지점을 골라 주세요.</div>}
        {clash && <div className="hgadm-lw__error">{formatClock(draft.at)}에는 이미 다른 체크포인트가 있어요.</div>}
      </Group>

      <Group label="모달 종류">
        <div className="hgadm-cp__kinds" role="radiogroup" aria-label="모달 종류">
          {(
            [
              ["sentence", "회화 (따라 말하기)"],
              ["quiz", "TOPIK 문제"],
            ] as const
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={draft.kind === kind}
              disabled={!canWrite}
              className={`hgadm-cp__kind ${draft.kind === kind ? "is-on" : ""}`}
              onClick={() => draft.kind !== kind && onChange({ ...draft, kind, contentId: "", contentLabel: "" })}
            >
              {label}
            </button>
          ))}
        </div>
      </Group>

      <Group
        label={draft.kind === "sentence" ? "따라 말할 문장" : "TOPIK 문제"}
        hint={
          draft.kind === "quiz"
            ? "객관식은 선택형 모달, 주관식·쓰기 문제는 답안 입력 모달로 열립니다."
            : "문장 콘텐츠에서 등록한 문장을 고르세요."
        }
      >
        {draft.contentId ? (
          <div className="hgadm-cp__picked">
            <div>
              <div className="hgadm-cell-main">{draft.contentLabel || draft.contentId}</div>
              <div className="hgadm-cell-sub hgadm-cell-mono">{draft.contentId}</div>
            </div>
            {canWrite && (
              <Button size="sm" onClick={() => onChange({ ...draft, contentId: "", contentLabel: "" })}>
                변경
              </Button>
            )}
          </div>
        ) : (
          <ContentPicker kind={draft.kind} onPick={(id, label) => onChange({ ...draft, contentId: id, contentLabel: label })} />
        )}
      </Group>

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

function ContentPicker({ kind, onPick }: { kind: ContentKind; onPick: (id: string, label: string) => void }) {
  const [q, setQ] = useState("");
  useEffect(() => setQ(""), [kind]);
  const sentences = useQuery({
    queryKey: ["admin", "checkpoint-picker", "sentence", q],
    queryFn: () => adminApi.listSentences({ q: q || undefined, page: 1, page_size: 10 }),
    enabled: kind === "sentence",
  });
  const quizzes = useQuery({
    queryKey: ["admin", "checkpoint-picker", "quiz", q],
    queryFn: () => adminApi.listQuizzes({ q: q || undefined, limit: 10, offset: 0 }),
    enabled: kind === "quiz",
  });
  const active = kind === "sentence" ? sentences : quizzes;
  const options =
    kind === "sentence"
      ? (sentences.data?.items ?? []).map((s) => ({ id: s.sentence_id, label: s.korean, detail: s.translation }))
      : (quizzes.data?.items ?? []).map((quiz) => ({
          id: quiz.quiz_id,
          label: quiz.prompt,
          detail: [quiz.topik_question_type, quiz.answer_format === "single_choice" ? "객관식" : "주관식/쓰기"]
            .filter(Boolean)
            .join(" · "),
        }));
  return (
    <div className="hgadm-cp__picker">
      <SearchBox value={q} placeholder={kind === "sentence" ? "한국어·번역·문장 ID 검색" : "문제 내용·문제 ID 검색"} onSearch={setQ} />
      {active.isPending ? (
        <LoadingState />
      ) : active.isError ? (
        <ErrorState message={errorMessage(active.error)} onRetry={() => void active.refetch()} />
      ) : options.length === 0 ? (
        <div className="hgadm-muted hgadm-cp__none">검색 결과가 없습니다.</div>
      ) : (
        <ul className="hgadm-cp__options">
          {options.map((o) => (
            <li key={o.id}>
              <button type="button" className="hgadm-cp__option" onClick={() => onPick(o.id, o.label)}>
                <span className="hgadm-cell-main">{o.label}</span>
                <span className="hgadm-cell-sub">
                  <span className="hgadm-cell-mono">{o.id}</span>
                  {o.detail && ` · ${o.detail}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

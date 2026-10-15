import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../api";
import type { AdminCheckpoint, AdminLecture } from "../../api";
import { StreamVideo } from "../../../components/StreamVideo";
import { errorMessage } from "../../../lib/http";
import { useToast, useToastError } from "../../../hooks/toast";
import { Button, ConfirmDialog, ErrorState, LoadingState } from "../../components/kit";
import { formatPrecise, roundTime } from "../../lib/videoFile";
import {
  KIND_COPY,
  checkDraft,
  contentKindOf,
  draftBody,
  draftFromCheckpoint,
  kindOf,
  newDraft,
  type ContentKind,
  type Draft,
} from "./checkpoints/model";
import { CheckpointList, DraftPanel, Timeline } from "./checkpoints/parts";
import { useEditorKeys, usePreviewPlayer } from "./checkpoints/usePreviewPlayer";


/** Saving and deleting a checkpoint; the lecture's counts refresh with it. */
function useCheckpointMutations(lecture: AdminLecture, kind: ContentKind, { onSaved, onDeleted }: { onSaved: () => void; onDeleted: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin", "lecture-checkpoints", lecture.lecture_id] });
    // The lecture list and page header show the checkpoint count.
    void qc.invalidateQueries({ queryKey: ["admin", "lectures"] });
    void qc.invalidateQueries({ queryKey: ["admin", "lecture", lecture.lecture_id] });
  };
  const save = useMutation({
    mutationFn: (d: Draft) =>
      d.checkpointId
        ? adminApi.replaceCheckpoint(lecture.lecture_id, d.checkpointId, draftBody(d, kind))
        : adminApi.createCheckpoint(lecture.lecture_id, draftBody(d, kind)),
    onSuccess: () => {
      toast.success("체크포인트를 저장했어요.");
      onSaved();
      refresh();
    },
    onError: toastError,
  });
  const remove = useMutation({
    mutationFn: (checkpoint: AdminCheckpoint) => adminApi.deleteCheckpoint(lecture.lecture_id, checkpoint.checkpoint_id),
    onSuccess: () => {
      toast.success("체크포인트를 삭제했어요.");
      onDeleted();
      refresh();
    },
    onError: toastError,
  });
  return { save, remove };
}

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
  const trackRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<AdminCheckpoint | null>(null);
  const kind = contentKindOf(lecture.track_id);
  const copy = KIND_COPY[kind];

  const list = useQuery({
    queryKey: ["admin", "lecture-checkpoints", lecture.lecture_id],
    queryFn: () => adminApi.listCheckpoints(lecture.lecture_id),
  });
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
  const duration = list.data?.duration_seconds ?? 0;
  const items = list.data?.items ?? [];
  const player = usePreviewPlayer(duration, preview);
  const { save, remove } = useCheckpointMutations(lecture, kind, {
    onSaved: () => setDraft(null),
    onDeleted: () => {
      setDeleting(null);
      setDraft(null);
    },
  });

  const startAdd = () => {
    player.pause();
    setDraft(newDraft(kind, player.now));
  };
  const select = (checkpoint: AdminCheckpoint) => {
    player.pause();
    player.seek(checkpoint.at_second);
    setDraft(draftFromCheckpoint(checkpoint, kind));
  };
  /** Move the draft's time, and the preview with it, so the frame is in view. */
  const moveDraft = (to: number) => {
    if (!draft) return;
    player.pause();
    setDraft({ ...draft, at: player.seek(to) });
  };
  useEditorKeys({ now: player.now, draft, togglePlay: player.togglePlay, seek: player.seek, moveDraft });

  const { clash, contentProblem, canSave } = checkDraft(draft, items, duration, kind);

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
          확인이 필요한 체크포인트가 {review}개 있어요. 영상이 바뀌었거나 강의 종류와 맞지 않는 항목이에요 — 눌러서 시점과
          내용을 확인하고 저장해 주세요.
        </div>
      )}

      <div className="hgadm-cpe__layout">
        <div className="hgadm-cpe__stage">
          {/* The whole frame at its own aspect ratio — a portrait lecture is
              shown tall, a landscape one wide; never cropped or stretched. */}
          <div className="hgadm-cpe__screen">
            {preview.isPending ? (
              <LoadingState />
            ) : preview.isError || player.videoError ? (
              <ErrorState message="영상을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." onRetry={player.retry} />
            ) : (
              <StreamVideo
                ref={player.videoRef}
                src={preview.data.url}
                className="hgadm-cpe__video"
                playsInline
                // "auto", so the first frame is on screen before anything is played.
                preload="auto"
                onClick={player.togglePlay}
                {...player.videoEvents}
              />
            )}
          </div>

          <PlayerControls player={player} duration={duration} />

          <Timeline
            trackRef={trackRef}
            duration={duration}
            now={player.now}
            items={items}
            kind={kind}
            selectedId={draft?.checkpointId ?? null}
            draftAt={draft ? draft.at : null}
            onSeek={(s) => {
              player.pause();
              player.seek(s);
            }}
            onSelect={select}
          />
          <p className="hgadm-cpe__keys">Space 재생/정지 · ←/→ 1초 · Shift+←/→ 0.1초 · 마커를 누르면 그 체크포인트로 이동</p>

          {canWrite && !draft && (
            <div className="hgadm-cpe__add">
              <Button variant="primary" onClick={startAdd}>
                + {copy.add} ({formatPrecise(player.now)})
              </Button>
            </div>
          )}
        </div>

        <aside className="hgadm-cpe__side">
          {draft ? (
            <DraftPanel
              draft={draft}
              kind={kind}
              now={roundTime(player.now)}
              duration={duration}
              clash={clash}
              canWrite={canWrite}
              saving={save.isPending}
              canSave={canSave}
              contentProblem={contentProblem}
              onChange={setDraft}
              onMove={moveDraft}
              onPreview={() => player.previewTo(draft.at)}
              onSave={() => save.mutate(draft)}
              onCancel={() => setDraft(null)}
              onDelete={
                draft.checkpointId
                  ? () => setDeleting(items.find((c) => c.checkpoint_id === draft.checkpointId) ?? null)
                  : undefined
              }
            />
          ) : (
            <CheckpointList items={items} kind={kind} copy={copy} onSelect={select} onPreview={(c) => player.previewTo(c.at_second)} />
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title="체크포인트 삭제"
        message={`${deleting ? formatPrecise(deleting.at_second) : ""} 지점의 체크포인트를 삭제할까요? ${
          deleting?.content_owned ? "이 체크포인트에서 만든 문장·문제도 함께 보관 처리돼요." : "연결된 공용 문장·문제는 그대로 남아요."
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

/** Play/pause, the clock, fine steps and the playback speed. */
function PlayerControls({ player, duration }: { player: ReturnType<typeof usePreviewPlayer>; duration: number }) {
  return (
    <div className="hgadm-cpe__controls">
      <Button size="sm" variant="primary" onClick={player.togglePlay} aria-label={player.playing ? "일시정지" : "재생"}>
        {player.playing ? "❚❚" : "▶"}
      </Button>
      <span className="hgadm-cpe__clock" aria-live="off">
        <strong>{formatPrecise(player.now)}</strong> / {formatPrecise(duration)}
      </span>
      <div className="hgadm-cpe__nudges" role="group" aria-label="미세 이동">
        {[-1, -0.1, 0.1, 1].map((step) => (
          <Button key={step} size="sm" variant="ghost" onClick={() => player.seek(player.now + step)}>
            {step > 0 ? `+${step}초` : `${step}초`}
          </Button>
        ))}
      </div>
      <Button size="sm" variant="ghost" onClick={player.cycleSpeed} aria-label={`재생 속도 ${player.speed}배`}>
        {player.speed}x
      </Button>
    </div>
  );
}

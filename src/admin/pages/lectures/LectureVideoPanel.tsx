import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../api";
import type { AdminLecture, AdminLectureVideo } from "../../api";
import { tusUploadToUrl } from "../../lib/videoUpload";
import { formatClock, readVideoDuration } from "../../lib/videoFile";
import { formatDateTime } from "../../lib/format";
import { errorMessage } from "../../../lib/http";
import { useToast, useToastError } from "../../../hooks/toast";
import { Badge, Button, ConfirmDialog, ErrorState, LoadingState, statusLabel, statusTone } from "../../components/kit";

const IN_PROGRESS = ["pending", "uploading", "processing"];
/** A video uploaded without a file name (the provider's own uploads) — never shown by its ID. */
const UNNAMED_VIDEO = "이름 없는 영상";

/** What the upload is doing right now, for the progress line. */
type Transfer = { name: string; duration: number | null; percent: number | null };

/**
 * Step 2 of a lecture: its video.
 *
 * Choosing a file reads its length in the browser straight away, sends the
 * file (directly to the hosting provider, or through the API offline), and
 * the lecture's length then follows the video — nobody types seconds. A
 * replacement keeps the old video playing until the new one is ready, and
 * warns that existing checkpoints must be re-checked against it.
 *
 * Every write here is `content:write`; render the write controls only when
 * `canWrite` (the server enforces it either way).
 */
export function LectureVideoPanel({
  lecture,
  canWrite,
  checkpointCount,
  onChanged,
}: {
  lecture: AdminLecture;
  canWrite: boolean;
  checkpointCount: number;
  onChanged: () => void;
}) {
  const toast = useToast();
  const toastError = useToastError();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [transfer, setTransfer] = useState<Transfer | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [deleting, setDeleting] = useState<AdminLectureVideo | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  // The running tus upload, so leaving the page stops it instead of leaving
  // it streaming in the background with nothing on screen to show it.
  const abortRef = useRef<(() => void) | null>(null);
  useEffect(() => () => abortRef.current?.(), []);

  const key = ["admin", "lecture-videos", lecture.lecture_id];
  const videos = useQuery({
    queryKey: key,
    queryFn: () => adminApi.listLectureVideos(lecture.lecture_id),
    refetchInterval: (q) =>
      q.state.data?.items.some((v) => IN_PROGRESS.includes(v.upload_status)) ? 5000 : false,
  });

  const items = videos.data?.items ?? [];
  const current = items.find((v) => v.is_primary && !v.deleted_at) ?? null;
  const incoming = items.find((v) => !v.is_primary && !v.deleted_at && IN_PROGRESS.includes(v.upload_status)) ?? null;
  const history = items.filter((v) => v !== current && v !== incoming);
  const previousStatus = useRef<string | undefined>(undefined);

  function refresh() {
    void qc.invalidateQueries({ queryKey: key });
    onChanged();
  }

  // Tell the page when the playable video changes (it became ready, or a
  // replacement took over), so the length and the checkpoint editor follow.
  const signature = current ? `${current.video_id}:${current.upload_status}` : "";
  useEffect(() => {
    if (previousStatus.current !== undefined && previousStatus.current !== signature) onChanged();
    previousStatus.current = signature;
  }, [signature, onChanged]);

  // One upload at a time. A ref, not the `transfer` state: reading the
  // file's length is async, so a second pick could slip in before re-render.
  const busyRef = useRef(false);

  async function upload(file: File | undefined) {
    if (!file || busyRef.current) return;
    busyRef.current = true;
    const duration = await readVideoDuration(file);
    setTransfer({ name: file.name, duration, percent: 0 });
    let videoId: string | null = null;
    try {
      const session = await adminApi.createVideoUploadSession(lecture.lecture_id, {
        filename: file.name,
        file_size_bytes: file.size,
        content_type: file.type || "video/mp4",
        ...(duration ? { duration_seconds: duration } : {}),
      });
      videoId = session.video_id;
      if (session.upload_protocol === "api") {
        // The offline provider takes the file through our API.
        setTransfer({ name: file.name, duration, percent: null });
        await adminApi.sendOfflineVideoFile(session.video_id, file);
      } else {
        // Direct resumable upload: the bytes go straight to the provider.
        const sent = tusUploadToUrl(session.upload_url, file, (percent) =>
          setTransfer({ name: file.name, duration, percent }),
        );
        abortRef.current = sent.abort;
        await sent.promise;
      }
      videoId = null;
      toast.success(
        session.upload_protocol === "api"
          ? "영상을 올렸어요."
          : "업로드 완료. 인코딩이 끝나면 자동으로 재생 가능 상태가 됩니다.",
      );
    } catch (e) {
      toast.error(errorMessage(e));
      // The session created the row as `uploading` before any bytes were sent;
      // without this it would stay "업로드 중" forever.
      if (videoId) await adminApi.deleteLectureVideo(videoId).catch(() => undefined);
    } finally {
      busyRef.current = false;
      abortRef.current = null;
      setTransfer(null);
      if (fileRef.current) fileRef.current.value = "";
      refresh();
    }
  }

  function pickFile() {
    if (current && checkpointCount > 0) setConfirmReplace(true);
    else fileRef.current?.click();
  }

  const refreshStatus = useMutation({
    mutationFn: (video: AdminLectureVideo) => adminApi.refreshLectureVideo(video.video_id),
    onSuccess: refresh,
    onError: toastError,
  });
  const removeVideo = useMutation({
    mutationFn: (video: AdminLectureVideo) => adminApi.deleteLectureVideo(video.video_id),
    onSuccess: () => {
      toast.success("영상을 삭제했어요.");
      setDeleting(null);
      refresh();
    },
    onError: toastError,
  });

  const input = (
    <input
      ref={fileRef}
      type="file"
      hidden
      accept="video/mp4,video/quicktime,video/webm"
      onChange={(e) => void upload(e.target.files?.[0])}
    />
  );

  if (videos.isPending) return <LoadingState />;
  if (videos.isError) return <ErrorState message={errorMessage(videos.error)} onRetry={() => void videos.refetch()} />;

  return (
    <div className="hgadm-lw__video">
      {input}
      {transfer ? (
        <div className="hgadm-lw__transfer" role="status">
          <div className="hgadm-cell-main">{transfer.name}</div>
          <div className="hgadm-cell-sub">
            {transfer.duration ? `길이 ${formatClock(transfer.duration)} 확인 · ` : ""}
            {transfer.percent === null ? "올리는 중…" : `올리는 중… ${transfer.percent}%`}
          </div>
          <div className="hgadm-lw__bar">
            <span style={{ width: `${transfer.percent ?? 100}%` }} className={transfer.percent === null ? "is-indeterminate" : ""} />
          </div>
        </div>
      ) : !current ? (
        canWrite ? (
          <div
            className="hgadm-dropzone hgadm-lw__drop"
            role="button"
            tabIndex={0}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void upload(e.dataTransfer.files?.[0]);
            }}
          >
            <strong>영상 파일을 끌어다 놓거나 클릭해서 올리세요</strong>
            <span>mp4 · mov · webm, 최대 2GB. 길이는 파일에서 자동으로 읽어요.</span>
          </div>
        ) : (
          <div className="hgadm-muted">아직 영상이 없습니다.</div>
        )
      ) : (
        <div className="hgadm-lw__current">
          <div>
            <div className="hgadm-cell-main">
              {current.original_file_name ?? UNNAMED_VIDEO}{" "}
              <Badge tone={statusTone(current.upload_status)}>{statusLabel(current.upload_status)}</Badge>
            </div>
            <div className="hgadm-cell-sub">
              길이 {current.duration_seconds ? formatClock(current.duration_seconds) : "확인 중"} ·{" "}
              {(current.file_size_bytes / 1024 / 1024).toFixed(1)}MB · {formatDateTime(current.uploaded_at)}
            </div>
            {current.failure_reason && <div className="hgadm-lw__error">{current.failure_reason}</div>}
          </div>
          {canWrite && (
            <div className="hgadm-row">
              {IN_PROGRESS.includes(current.upload_status) && (
                <Button size="sm" loading={refreshStatus.isPending} onClick={() => refreshStatus.mutate(current)}>
                  상태 새로고침
                </Button>
              )}
              <Button size="sm" onClick={pickFile}>
                영상 교체
              </Button>
              <Button size="sm" variant="danger-soft" onClick={() => setDeleting(current)}>
                삭제
              </Button>
            </div>
          )}
        </div>
      )}

      {incoming && (
        <div className="hgadm-lw__incoming" role="status">
          새 영상 <strong>{incoming.original_file_name ?? UNNAMED_VIDEO}</strong> 처리 중 — 끝나면 지금
          영상과 자동으로 교체돼요.
          {canWrite && (
            <Button size="sm" variant="ghost" loading={refreshStatus.isPending} onClick={() => refreshStatus.mutate(incoming)}>
              상태 새로고침
            </Button>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="hgadm-lw__history">
          <button type="button" className="hgadm-lw__link" onClick={() => setShowHistory((v) => !v)}>
            이전 업로드 {history.length}개 {showHistory ? "숨기기" : "보기"}
          </button>
          {showHistory && (
            <ul>
              {history.map((v) => (
                <li key={v.video_id}>
                  <span>{v.original_file_name ?? UNNAMED_VIDEO}</span>
                  <Badge tone={statusTone(v.upload_status)}>{statusLabel(v.upload_status)}</Badge>
                  <span className="hgadm-muted">
                    {v.duration_seconds ? formatClock(v.duration_seconds) : "—"} · {formatDateTime(v.uploaded_at)}
                  </span>
                  {v.failure_reason && <span className="hgadm-lw__error">{v.failure_reason}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmReplace}
        title="영상 교체"
        message={`이 강의에는 체크포인트 ${checkpointCount}개가 있어요. 새 영상이 준비되면 각 체크포인트의 시점을 새 영상에서 다시 확인해야 합니다 (확인이 필요한 항목은 표시돼요). 교체할까요?`}
        confirmLabel="파일 선택"
        onConfirm={() => {
          setConfirmReplace(false);
          fileRef.current?.click();
        }}
        onCancel={() => setConfirmReplace(false)}
      />
      <ConfirmDialog
        open={deleting !== null}
        title="영상 삭제"
        message="호스팅된 영상을 삭제할까요? 학습자는 새 영상을 올릴 때까지 이 강의를 재생할 수 없고, 체크포인트도 동작하지 않습니다."
        danger
        confirmLabel="삭제"
        loading={removeVideo.isPending}
        onConfirm={() => deleting && removeVideo.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

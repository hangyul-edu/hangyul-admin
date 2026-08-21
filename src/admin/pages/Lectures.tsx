import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { adminApi } from "../api";
import type { AdminLecture, AdminLectureVideo } from "../api";
import { tusUploadToUrl } from "../lib/videoUpload";
import { errorMessage } from "../../lib/http";
import { useToast } from "../../hooks/toast";
import { useAdminAuth } from "../auth";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Modal,
  Pagination,
  SearchBox,
  Select,
  formatDateTime,
  formatDuration,
  statusTone,
} from "../components/kit";
import type { Column } from "../components/kit";

const TRACKS = [
  ["track_conversation", "회화"],
  ["track_topik", "TOPIK"],
] as const;
const TRACK_LABEL = Object.fromEntries(TRACKS);
const KINDS = [
  ["video", "영상 강의"],
  ["speak_practice", "말하기 연습"],
  ["question_practice", "문제 연습"],
] as const;

interface LectureDraft {
  track_id: string;
  course_id: string;
  title: string;
  kind: string;
  duration_seconds: string;
  access: string;
  sequence: string;
  thumbnail_url: string;
  topik_question_type: string;
}

const EMPTY: LectureDraft = {
  track_id: "track_conversation",
  course_id: "",
  title: "",
  kind: "video",
  duration_seconds: "0",
  access: "free",
  sequence: "0",
  thumbnail_url: "",
  topik_question_type: "",
};

export function LecturesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAdminAuth();
  const canWrite = can("content:write");
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState<LectureDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminLecture | null>(null);
  const [videoLecture, setVideoLecture] = useState<AdminLecture | null>(null);

  const q = params.get("q") ?? "";
  const track = params.get("track_id") ?? "";
  const courseId = params.get("course_id") ?? "";
  const access = params.get("access") ?? "";
  const page = Number(params.get("page") ?? "1");

  function patchParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  }

  const courses = useQuery({
    queryKey: ["admin", "courses", ""],
    queryFn: () => adminApi.listCourses(),
  });

  const query = useQuery({
    queryKey: ["admin", "lectures", { q, track, courseId, access, page }],
    queryFn: () =>
      adminApi.listLectures({
        q: q || undefined,
        track_id: track || undefined,
        course_id: courseId || undefined,
        access: access || undefined,
        page,
        page_size: 25,
      }),
  });

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["admin", "lectures"] });
    void qc.invalidateQueries({ queryKey: ["admin", "courses"] });
  }

  const save = useMutation({
    mutationFn: (d: LectureDraft) => {
      const base = {
        title: d.title,
        duration_seconds: Number(d.duration_seconds),
        access: d.access,
        sequence: Number(d.sequence),
        thumbnail_url: d.thumbnail_url || undefined,
        topik_question_type: d.topik_question_type || undefined,
      };
      if (editingId) {
        return adminApi.updateLecture(editingId, {
          ...base,
          course_id: d.course_id || undefined,
          clear_course: d.course_id === "",
        });
      }
      return adminApi.createLecture({
        ...base,
        track_id: d.track_id,
        course_id: d.course_id || undefined,
        kind: d.kind,
      });
    },
    onSuccess: () => {
      toast.success("강의를 저장했어요.");
      setDraft(null);
      setEditingId(null);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (lecture: AdminLecture) => adminApi.deleteLecture(lecture.lecture_id),
    onSuccess: () => {
      toast.success("강의를 삭제했어요.");
      setDeleting(null);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const columns: Column<AdminLecture>[] = [
    {
      key: "title",
      header: "강의",
      render: (l) => (
        <div className="hgadm-row">
          {l.thumbnail_url && <img src={l.thumbnail_url} alt="" className="hgadm-thumb" />}
          <div>
            <div className="hgadm-cell-main">{l.title}</div>
            <div className="hgadm-cell-sub hgadm-cell-mono">{l.lecture_id}</div>
          </div>
        </div>
      ),
    },
    {
      key: "track",
      header: "트랙/레벨",
      render: (l) => (
        <div>
          <Badge tone="brand">{TRACK_LABEL[l.track_id] ?? l.track_id}</Badge>
          <div className="hgadm-cell-sub">순서 {l.sequence}</div>
        </div>
      ),
    },
    {
      key: "kind",
      header: "유형",
      render: (l) => KINDS.find(([v]) => v === l.kind)?.[1] ?? l.kind,
    },
    {
      key: "access",
      header: "공개 범위",
      render: (l) => (
        <Badge tone={l.access === "premium" ? "warning" : "success"}>
          {l.access === "premium" ? "프리미엄" : "무료"}
        </Badge>
      ),
    },
    {
      key: "video",
      header: "영상",
      render: (l) =>
        l.kind !== "video" ? (
          <span className="hgadm-muted">해당 없음</span>
        ) : l.video_status ? (
          <Badge tone={statusTone(l.video_status)}>{l.video_status}</Badge>
        ) : (
          <Badge tone="danger">영상 없음</Badge>
        ),
    },
    {
      key: "duration",
      header: "길이",
      render: (l) => (l.duration_seconds ? formatDuration(l.duration_seconds) : "—"),
    },
    {
      key: "actions",
      header: "",
      render: (l) =>
        canWrite ? (
          <div className="hgadm-row" onClick={(e) => e.stopPropagation()}>
            {l.kind === "video" && (
              <Button size="sm" onClick={() => setVideoLecture(l)}>
                영상 관리
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                setEditingId(l.lecture_id);
                setDraft({
                  track_id: l.track_id,
                  course_id: l.course_id ?? "",
                  title: l.title,
                  kind: l.kind,
                  duration_seconds: String(l.duration_seconds),
                  access: l.access,
                  sequence: String(l.sequence),
                  thumbnail_url: l.thumbnail_url ?? "",
                  topik_question_type: l.topik_question_type ?? "",
                });
              }}
            >
              수정
            </Button>
            <Button size="sm" variant="danger-soft" onClick={() => setDeleting(l)}>
              삭제
            </Button>
          </div>
        ) : null,
    },
  ];

  const draftCourses =
    courses.data?.items.filter((c) => !draft || c.track_id === draft.track_id) ?? [];

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>강의·영상 관리</h1>
          <div className="hgadm-page-head__desc">
            강의 메타데이터(제목·레벨·코스·공개 범위)와 호스팅 영상 업로드를 관리합니다.
            영상은 업로드 후 인코딩이 끝나면 자동으로 재생 가능(ready) 상태가 됩니다.
          </div>
        </div>
        {canWrite && (
          <div className="hgadm-page-head__actions">
            <Button
              variant="primary"
              onClick={() => {
                setEditingId(null);
                setDraft({ ...EMPTY });
              }}
            >
              + 강의 추가
            </Button>
          </div>
        )}
      </div>

      <div className="hgadm-card">
        <div className="hgadm-toolbar">
          <SearchBox
            value={q}
            placeholder="제목·강의 ID 검색"
            onSearch={(next) => patchParams({ q: next, page: null })}
          />
          <Select
            value={track}
            onChange={(e) => patchParams({ track_id: e.target.value, page: null })}
            style={{ width: 130 }}
          >
            <option value="">트랙: 전체</option>
            {TRACKS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            value={courseId}
            onChange={(e) => patchParams({ course_id: e.target.value, page: null })}
            style={{ minWidth: 180 }}
          >
            <option value="">코스: 전체</option>
            {courses.data?.items.map((c) => (
              <option key={c.course_id} value={c.course_id}>
                {c.title}
              </option>
            ))}
          </Select>
          <Select
            value={access}
            onChange={(e) => patchParams({ access: e.target.value, page: null })}
            style={{ width: 140 }}
          >
            <option value="">공개: 전체</option>
            <option value="free">무료</option>
            <option value="premium">프리미엄</option>
          </Select>
        </div>
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={query.data.items}
              rowKey={(l) => l.lecture_id}
              empty="조건에 맞는 강의가 없습니다."
            />
            <Pagination
              page={query.data.page}
              pageSize={query.data.page_size}
              total={query.data.total}
              onPageChange={(next) => patchParams({ page: String(next) })}
            />
          </>
        )}
      </div>

      <Modal
        open={draft !== null}
        title={editingId ? "강의 수정" : "강의 추가"}
        size="lg"
        onClose={() => setDraft(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              취소
            </Button>
            <Button
              variant="primary"
              loading={save.isPending}
              disabled={!draft?.title.trim()}
              onClick={() => draft && save.mutate(draft)}
            >
              저장
            </Button>
          </>
        }
      >
        {draft && (
          <div className="hgadm-form-grid">
            <Field label="트랙" required hint={editingId ? "트랙은 변경할 수 없습니다." : undefined}>
              <Select
                value={draft.track_id}
                disabled={editingId !== null}
                onChange={(e) =>
                  setDraft({ ...draft, track_id: e.target.value, course_id: "" })
                }
              >
                {TRACKS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="유형" required hint={editingId ? "유형은 변경할 수 없습니다." : undefined}>
              <Select
                value={draft.kind}
                disabled={editingId !== null}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value })}
              >
                {KINDS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="제목" required>
              <Input
                value={draft.title}
                maxLength={200}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </Field>
            <Field label="소속 코스" hint="같은 트랙의 코스만 선택 가능">
              <Select
                value={draft.course_id}
                onChange={(e) => setDraft({ ...draft, course_id: e.target.value })}
              >
                <option value="">(코스 없음)</option>
                {draftCourses.map((c) => (
                  <option key={c.course_id} value={c.course_id}>
                    {c.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="정렬 순서">
              <Input
                type="number"
                min={0}
                value={draft.sequence}
                onChange={(e) => setDraft({ ...draft, sequence: e.target.value })}
              />
            </Field>
            <Field label="공개 범위" required>
              <Select
                value={draft.access}
                onChange={(e) => setDraft({ ...draft, access: e.target.value })}
              >
                <option value="free">무료</option>
                <option value="premium">프리미엄</option>
              </Select>
            </Field>
            <Field label="길이 (초)" hint="영상 업로드 시 자동 갱신됩니다.">
              <Input
                type="number"
                min={0}
                value={draft.duration_seconds}
                onChange={(e) => setDraft({ ...draft, duration_seconds: e.target.value })}
              />
            </Field>
            <div className="span-2">
              <ThumbnailField
                value={draft.thumbnail_url}
                onChange={(url) => setDraft({ ...draft, thumbnail_url: url })}
              />
            </div>
            {draft.track_id === "track_topik" && (
              <Field label="TOPIK 문제 유형" hint="예: reading_03 (문제 연습 강의에만 필요)">
                <Input
                  value={draft.topik_question_type}
                  maxLength={24}
                  onChange={(e) =>
                    setDraft({ ...draft, topik_question_type: e.target.value })
                  }
                />
              </Field>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="강의 삭제"
        message={`'${deleting?.title ?? ""}' 강의를 영구 삭제할까요? 시청 기록과 영상 정보도 함께 삭제되며 되돌릴 수 없습니다.`}
        danger
        confirmLabel="삭제"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />

      {videoLecture && (
        <VideoManagerModal
          lecture={videoLecture}
          onClose={() => {
            setVideoLecture(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ThumbnailField({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <Field label="썸네일" hint="JPEG/PNG/WebP, 최대 5MB">
      <div className="hgadm-row">
        {value && <img src={value} alt="썸네일" className="hgadm-thumb" />}
        <div
          className="hgadm-dropzone"
          style={{ flex: 1, padding: "14px 12px" }}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? "업로드 중…" : value ? "클릭해서 교체" : "클릭해서 업로드"}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading(true);
              try {
                const result = await adminApi.uploadMedia(file);
                onChange(result.url);
              } catch (err) {
                toast.error(errorMessage(err));
              } finally {
                setUploading(false);
                if (fileRef.current) fileRef.current.value = "";
              }
            }}
          />
        </div>
      </div>
    </Field>
  );
}

function VideoManagerModal({
  lecture,
  onClose,
}: {
  lecture: AdminLecture;
  onClose: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [deleting, setDeleting] = useState<AdminLectureVideo | null>(null);

  const query = useQuery({
    queryKey: ["admin", "lecture-videos", lecture.lecture_id],
    queryFn: () => adminApi.listLectureVideos(lecture.lecture_id),
    refetchInterval: (q) =>
      q.state.data?.items.some((v) =>
        ["pending", "uploading", "processing"].includes(v.upload_status),
      )
        ? 5000
        : false,
  });

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["admin", "lecture-videos", lecture.lecture_id] });
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    try {
      // Direct resumable upload: the backend provisions a one-time session, then
      // the browser streams the bytes straight to Cloudflare via tus (never
      // through our API). The new video is promoted to primary only once it is
      // fully processed, so a replace never interrupts the current video.
      const session = await adminApi.createVideoUploadSession(lecture.lecture_id, {
        filename: file.name,
        file_size_bytes: file.size,
        content_type: file.type || "video/mp4",
      });
      await tusUploadToUrl(session.upload_url, file, setProgress).promise;
      toast.success("업로드 완료. 인코딩이 끝나면 자동으로 준비됩니다.");
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
      setProgress(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const refreshStatus = useMutation({
    mutationFn: (video: AdminLectureVideo) => adminApi.refreshLectureVideo(video.video_id),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });

  const removeVideo = useMutation({
    mutationFn: (video: AdminLectureVideo) => adminApi.deleteLectureVideo(video.video_id),
    onSuccess: () => {
      toast.success("영상을 삭제했어요.");
      setDeleting(null);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const hasPrimary = query.data?.items.some(
    (v) => v.is_primary && v.deleted_at === null && v.upload_status !== "deleted",
  );

  return (
    <Modal open title={`영상 관리 — ${lecture.title}`} size="xl" onClose={onClose}>
      <div
        className="hgadm-dropzone"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void upload(e.dataTransfer.files?.[0]);
        }}
        style={{ marginBottom: 14 }}
      >
        {uploading ? (
          <span>Cloudflare로 직접 업로드 중… {progress}%</span>
        ) : (
          <span>
            {hasPrimary
              ? "새 파일을 올리면 기존 대표 영상이 교체됩니다"
              : "클릭하거나 영상 파일을 끌어다 놓아 업로드"}
          </span>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm"
          onChange={(e) => void upload(e.target.files?.[0])}
        />
      </div>

      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <div className="hgadm-state" style={{ padding: 24 }}>
          <div className="hgadm-state__desc">아직 업로드된 영상이 없습니다.</div>
        </div>
      ) : (
        <div className="hgadm-table-wrap">
          <table className="hgadm-table">
            <thead>
              <tr>
                <th>파일</th>
                <th>상태</th>
                <th>길이</th>
                <th>업로드</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((v) => (
                <tr key={v.video_id}>
                  <td>
                    <div className="hgadm-cell-main">
                      {v.original_file_name ?? v.video_id}
                      {v.is_primary && <Badge tone="brand"> 대표</Badge>}
                    </div>
                    <div className="hgadm-cell-sub">
                      {v.provider} · {(v.file_size_bytes / 1024 / 1024).toFixed(1)}MB
                    </div>
                  </td>
                  <td>
                    <Badge tone={statusTone(v.upload_status)}>{v.upload_status}</Badge>
                    {v.failure_reason && (
                      <div className="hgadm-cell-sub" style={{ color: "var(--danger)" }}>
                        {v.failure_reason}
                      </div>
                    )}
                  </td>
                  <td>{v.duration_seconds ? formatDuration(v.duration_seconds) : "—"}</td>
                  <td>{formatDateTime(v.uploaded_at)}</td>
                  <td>
                    <div className="hgadm-row">
                      {["processing", "pending", "uploading"].includes(v.upload_status) && (
                        <Button
                          size="sm"
                          loading={refreshStatus.isPending}
                          onClick={() => refreshStatus.mutate(v)}
                        >
                          상태 새로고침
                        </Button>
                      )}
                      {v.upload_status !== "deleted" && (
                        <Button
                          size="sm"
                          variant="danger-soft"
                          onClick={() => setDeleting(v)}
                        >
                          삭제
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="영상 삭제"
        message="호스팅된 영상을 삭제할까요? 학습자는 이 강의를 더 이상 재생할 수 없게 됩니다."
        danger
        confirmLabel="삭제"
        loading={removeVideo.isPending}
        onConfirm={() => deleting && removeVideo.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </Modal>
  );
}

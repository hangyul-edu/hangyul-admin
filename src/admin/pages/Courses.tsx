import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { adminApi } from "../api";
import type { AdminCourse } from "../api";
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
  Select,
  Textarea,
} from "../components/kit";
import type { Column } from "../components/kit";

const TRACKS = [
  ["track_conversation", "회화"],
  ["track_topik", "TOPIK"],
] as const;
const TRACK_LABEL = Object.fromEntries(TRACKS);

interface CourseDraft {
  track_id: string;
  title: string;
  description: string;
  sequence: string;
  cover_image_url: string;
}

const EMPTY: CourseDraft = {
  track_id: "track_conversation",
  title: "",
  description: "",
  sequence: "0",
  cover_image_url: "",
};

export function CoursesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAdminAuth();
  const canWrite = can("content:write");
  const [track, setTrack] = useState("");
  const [draft, setDraft] = useState<CourseDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminCourse | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const query = useQuery({
    queryKey: ["admin", "courses", track],
    queryFn: () => adminApi.listCourses(track || undefined),
  });

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["admin", "courses"] });
  }

  const save = useMutation({
    mutationFn: (d: CourseDraft) => {
      const body = {
        title: d.title,
        description: d.description,
        sequence: Number(d.sequence),
        cover_image_url: d.cover_image_url || null,
      };
      return editingId
        ? adminApi.updateCourse(editingId, body)
        : adminApi.createCourse({ ...body, track_id: d.track_id });
    },
    onSuccess: () => {
      toast.success("코스를 저장했어요.");
      setDraft(null);
      setEditingId(null);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (course: AdminCourse) => adminApi.deleteCourse(course.course_id),
    onSuccess: () => {
      toast.success("코스를 삭제했어요.");
      setDeleting(null);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  async function onFileChosen(file: File | undefined) {
    if (!file || !draft) return;
    setUploading(true);
    try {
      const result = await adminApi.uploadMedia(file);
      setDraft({ ...draft, cover_image_url: result.url });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const columns: Column<AdminCourse>[] = [
    {
      key: "cover",
      header: "커버",
      width: 90,
      render: (c) =>
        c.cover_image_url ? (
          <img src={c.cover_image_url} alt="" className="hgadm-thumb" />
        ) : (
          <span className="hgadm-muted">—</span>
        ),
    },
    {
      key: "title",
      header: "코스",
      render: (c) => (
        <div>
          <div className="hgadm-cell-main">{c.title}</div>
          <div className="hgadm-cell-sub hgadm-cell-mono">{c.course_id}</div>
        </div>
      ),
    },
    {
      key: "track",
      header: "트랙",
      render: (c) => <Badge tone="brand">{TRACK_LABEL[c.track_id] ?? c.track_id}</Badge>,
    },
    { key: "sequence", header: "순서", numeric: true, render: (c) => c.sequence },
    {
      key: "lectures",
      header: "강의 수",
      numeric: true,
      render: (c) => (
        <Link to={`/lectures?course_id=${c.course_id}`} onClick={(e) => e.stopPropagation()}>
          {c.lecture_count}개
        </Link>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (c) =>
        canWrite ? (
          <div className="hgadm-row" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              onClick={() => {
                setEditingId(c.course_id);
                setDraft({
                  track_id: c.track_id,
                  title: c.title,
                  description: c.description,
                  sequence: String(c.sequence),
                  cover_image_url: c.cover_image_url ?? "",
                });
              }}
            >
              수정
            </Button>
            <Button size="sm" variant="danger-soft" onClick={() => setDeleting(c)}>
              삭제
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>코스 관리</h1>
          <div className="hgadm-page-head__desc">
            트랙별 코스(강의 묶음)를 관리합니다. 강의가 남아 있는 코스는 삭제할 수
            없습니다.
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
              + 코스 추가
            </Button>
          </div>
        )}
      </div>

      <div className="hgadm-card">
        <div className="hgadm-toolbar">
          <Select value={track} onChange={(e) => setTrack(e.target.value)} style={{ width: 150 }}>
            <option value="">트랙: 전체</option>
            {TRACKS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            rows={query.data.items}
            rowKey={(c) => c.course_id}
            empty="코스가 없습니다."
          />
        )}
      </div>

      <Modal
        open={draft !== null}
        title={editingId ? "코스 수정" : "코스 추가"}
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
          <div>
            <div className="hgadm-form-grid">
              <Field label="트랙" required hint={editingId ? "트랙은 변경할 수 없습니다." : undefined}>
                <Select
                  value={draft.track_id}
                  disabled={editingId !== null}
                  onChange={(e) => setDraft({ ...draft, track_id: e.target.value })}
                >
                  {TRACKS.map(([value, label]) => (
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
              <Field label="정렬 순서">
                <Input
                  type="number"
                  min={0}
                  value={draft.sequence}
                  onChange={(e) => setDraft({ ...draft, sequence: e.target.value })}
                />
              </Field>
            </div>
            <Field label="설명">
              <Textarea
                rows={3}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </Field>
            <Field label="커버 이미지" hint="JPEG/PNG/WebP, 최대 5MB">
              <div>
                {draft.cover_image_url && (
                  <img
                    src={draft.cover_image_url}
                    alt="커버 미리보기"
                    className="hgadm-thumb"
                    style={{ width: 140, height: 84, marginBottom: 8 }}
                  />
                )}
                <div className="hgadm-dropzone" onClick={() => fileRef.current?.click()}>
                  {uploading ? "업로드 중…" : "클릭해서 이미지 업로드"}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => void onFileChosen(e.target.files?.[0])}
                  />
                </div>
              </div>
            </Field>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="코스 삭제"
        message={`'${deleting?.title ?? ""}' 코스를 삭제할까요? 강의가 남아 있으면 삭제할 수 없습니다.`}
        danger
        confirmLabel="삭제"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

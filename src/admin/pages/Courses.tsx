import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { adminApi } from "../api";
import type { AdminCourse } from "../api";
import { errorMessage } from "../../lib/http";
import { useToast, useToastError } from "../../hooks/toast";
import { useAdminAuth } from "../auth";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  ErrorState,
  Field,
  LoadingState,
  Modal,
  Select,
} from "../components/kit";
import type { Column } from "../components/kit";
import { LanguageFields, StandInBadge, koreanTitle, languageDraft, translationsOf } from "../components/LanguageFields";
import type { LanguageDraft } from "../components/LanguageFields";
import { MoveButtons, OrderNumber, useReorder } from "../components/ordering";
import { SeriesPanel } from "./courses/SeriesPanel";

const TRACKS = [
  ["track_conversation", "회화"],
  ["track_topik", "TOPIK"],
] as const;
const TRACK_LABEL = Object.fromEntries(TRACKS);

interface CourseDraft {
  track_id: string;
  text: LanguageDraft;
  cover_image_url: string;
}

const EMPTY: CourseDraft = {
  track_id: "track_conversation",
  text: languageDraft(null),
  cover_image_url: "",
};

export function CoursesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const { can } = useAdminAuth();
  const canWrite = can("content:write");
  const [track, setTrack] = useState("");
  const [draft, setDraft] = useState<CourseDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminCourse | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // The course whose series are open below the table — in the URL, so the
  // lecture form's "시리즈 추가" link lands straight on it.
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("course_id") ?? "";

  const query = useQuery({
    queryKey: ["admin", "courses", track],
    queryFn: () => adminApi.listCourses(track || undefined),
  });
  const selected = query.data?.items.find((c) => c.course_id === selectedId) ?? null;

  function select(course: AdminCourse) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (next.get("course_id") === course.course_id) next.delete("course_id");
        else next.set("course_id", course.course_id);
        return next;
      },
      { replace: true },
    );
  }

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["admin", "courses"] });
  }

  // Courses are ordered within their track; a new one goes to the end.
  const courseKey = ["admin", "courses", track];
  const reorder = useReorder<AdminCourse>({
    queryKey: courseKey,
    idOf: (c) => c.course_id,
    save: (ids) => {
      const trackOf = query.data?.items.find((c) => c.course_id === ids[0])?.track_id ?? "";
      return adminApi.reorderCourses(trackOf, ids);
    },
    alsoRefresh: [["admin", "courses"]],
  });
  const items = query.data?.items ?? [];
  const trackIds = (trackId: string) => items.filter((c) => c.track_id === trackId).map((c) => c.course_id);

  const save = useMutation({
    mutationFn: (d: CourseDraft) => {
      const body = {
        title: d.text.en.title.trim(),
        description: d.text.en.description,
        cover_image_url: d.cover_image_url || null,
        translations: translationsOf(d.text),
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
    onError: toastError,
  });

  const remove = useMutation({
    mutationFn: (course: AdminCourse) => adminApi.deleteCourse(course.course_id),
    onSuccess: () => {
      toast.success("코스를 삭제했어요.");
      setDeleting(null);
      refresh();
    },
    onError: toastError,
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
      key: "order",
      header: "앱 표시 순서",
      width: 120,
      render: (c) => {
        const scope = trackIds(c.track_id);
        const index = scope.indexOf(c.course_id);
        return (
          <div className="hgadm-row" onClick={(e) => e.stopPropagation()}>
            <OrderNumber position={index + 1} />
            {canWrite && (
              <MoveButtons
                name={c.title}
                index={index}
                count={scope.length}
                disabled={reorder.saving}
                onMove={(dir) => reorder.move(scope, c.course_id, dir)}
              />
            )}
          </div>
        );
      },
    },
    {
      key: "cover",
      header: "대표 이미지",
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
          <div className="hgadm-title-row">
            <span className="hgadm-cell-main">{c.title}</span>
            <StandInBadge title={c.title} />
          </div>
          {koreanTitle(c) && <div className="hgadm-cell-sub">{koreanTitle(c)}</div>}
        </div>
      ),
    },
    {
      key: "track",
      header: "학습 분야",
      render: (c) => <Badge tone="brand">{TRACK_LABEL[c.track_id] ?? c.track_id}</Badge>,
    },
    {
      key: "series",
      header: "시리즈",
      numeric: true,
      render: (c) =>
        c.series_count ? `${c.series_count}개` : <Badge tone="warning">없음</Badge>,
    },
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
            <Button size="sm" variant={c.course_id === selectedId ? "primary" : "secondary"} onClick={() => select(c)}>
              시리즈 관리
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditingId(c.course_id);
                setDraft({
                  track_id: c.track_id,
                  text: languageDraft(c),
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
            코스 › 시리즈 › 강의 순으로 묶여요. 코스를 누르면 그 코스의 시리즈(썸네일이 있는 카드)를 관리할 수
            있고, 강의는 시리즈 안에만 넣을 수 있어요. 시리즈가 남아 있는 코스는 삭제할 수 없습니다. 앱의 강의
            탭에는 학습 분야마다 아래 순서대로 코스가 보여요 — ↑ / ↓ 로 바꾸면 바로 저장돼요.
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
            <option value="">학습 분야: 전체</option>
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
            onRowClick={select}
            empty="코스가 없습니다."
          />
        )}
      </div>

      {selected ? (
        <SeriesPanel key={selected.course_id} course={selected} canWrite={canWrite} />
      ) : (
        query.isSuccess &&
        query.data.items.length > 0 && (
          <p className="hgadm-muted hgadm-series__hint">코스를 누르면 그 코스의 시리즈를 볼 수 있어요.</p>
        )
      )}

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
              disabled={!draft?.text.en.title.trim()}
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
              <Field
                label="학습 분야"
                required
                hint={
                  editingId
                    ? "학습 분야는 변경할 수 없습니다."
                    : "새 코스는 이 학습 분야의 맨 뒤에 놓여요. 순서는 목록에서 ↑ / ↓ 로 바꿔요."
                }
              >
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
            </div>
            <LanguageFields
              noun="코스"
              titleMaxLength={200}
              value={draft.text}
              onChange={(text) => setDraft({ ...draft, text })}
            />
            <Field label="대표 이미지" hint="JPEG/PNG/WebP, 최대 5MB">
              <div>
                {draft.cover_image_url && (
                  <img
                    src={draft.cover_image_url}
                    alt="대표 이미지 미리보기"
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
        message={
          deleting && deleting.series_count > 0
            ? `‘${deleting.title}’ 코스에는 시리즈가 ${deleting.series_count}개 있어 삭제할 수 없어요. 시리즈를 먼저 삭제해 주세요(강의가 든 시리즈는 강의부터 옮기거나 삭제해야 해요).`
            : `‘${deleting?.title ?? ""}’ 코스를 삭제할까요?`
        }
        danger
        confirmLabel="삭제"
        confirmDisabled={!!deleting && deleting.series_count > 0}
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import type { AdminCourse } from "../../api";
import { errorMessage } from "../../../lib/http";
import { useAdminAuth } from "../../auth";
import { Badge, Button, ConfirmDialog, DataTable, ErrorState, LoadingState, Select, Thumb } from "../../components/kit";
import type { Column } from "../../components/kit";
import { StandInBadge, koreanTitle } from "../../components/LanguageFields";
import { MoveButtons, OrderNumber } from "../../components/ordering";
import { CourseEditor } from "./CourseEditor";
import { SeriesPanel } from "./SeriesPanel";
import { TRACKS, TRACK_LABEL } from "../../lib/tracks";
import {
  draftFromCourse,
  emptyCourseDraft,
  useCourseList,
  useCourseMutations,
  useSelectedCourse,
  type CourseDraft,
} from "./useCourses";

/** 코스 관리: courses by track, in app order; choosing one opens its series below. */
export function CoursesPage() {
  const { can } = useAdminAuth();
  const canWrite = can("content:write");
  const [track, setTrack] = useState("");
  const [draft, setDraft] = useState<CourseDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminCourse | null>(null);

  const { selectedId, toggle: select } = useSelectedCourse();
  const { query, reorder, trackIds } = useCourseList(track);
  const { save, remove } = useCourseMutations({
    onSaved: () => {
      setDraft(null);
      setEditingId(null);
    },
    onDeleted: () => setDeleting(null),
  });
  const selected = query.data?.items.find((c) => c.course_id === selectedId) ?? null;

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
    { key: "cover", header: "대표 이미지", width: 90, render: (c) => <Thumb src={c.cover_image_url} /> },
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
    { key: "track", header: "학습 분야", render: (c) => <Badge tone="brand">{TRACK_LABEL[c.track_id] ?? c.track_id}</Badge> },
    {
      key: "series",
      header: "시리즈",
      numeric: true,
      render: (c) => (c.series_count ? `${c.series_count}개` : <Badge tone="warning">없음</Badge>),
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
                setDraft(draftFromCourse(c));
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
            코스 › 시리즈 › 강의 순으로 묶여요. 코스를 누르면 그 코스의 시리즈(썸네일이 있는 카드)를 관리할 수 있고, 강의는
            시리즈 안에만 넣을 수 있어요. 시리즈가 남아 있는 코스는 삭제할 수 없습니다. 앱의 강의 탭에는 학습 분야마다 아래
            순서대로 코스가 보여요 — ↑ / ↓ 로 바꾸면 바로 저장돼요.
          </div>
        </div>
        {canWrite && (
          <div className="hgadm-page-head__actions">
            <Button
              variant="primary"
              onClick={() => {
                setEditingId(null);
                setDraft(emptyCourseDraft());
              }}
            >
              + 코스 추가
            </Button>
          </div>
        )}
      </div>

      <div className="hgadm-card">
        <div className="hgadm-toolbar">
          <Select value={track} onChange={(e) => setTrack(e.target.value)}>
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
          <DataTable columns={columns} rows={query.data.items} rowKey={(c) => c.course_id} onRowClick={select} empty="코스가 없습니다." />
        )}
      </div>

      {selected ? (
        <SeriesPanel key={selected.course_id} course={selected} canWrite={canWrite} />
      ) : (
        query.isSuccess &&
        query.data.items.length > 0 && <p className="hgadm-muted hgadm-series__hint">코스를 누르면 그 코스의 시리즈를 볼 수 있어요.</p>
      )}

      <CourseEditor
        draft={draft}
        setDraft={setDraft}
        editing={editingId !== null}
        saving={save.isPending}
        onSave={(d) => save.mutate({ id: editingId, draft: d })}
      />

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

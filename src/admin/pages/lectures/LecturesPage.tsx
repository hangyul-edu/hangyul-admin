import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import type { AdminLecture } from "../../api";
import { errorMessage } from "../../../lib/http";
import { useAdminAuth } from "../../auth";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  ErrorState,
  LoadingState,
  Pagination,
  statusLabel,
  statusTone,
  Thumb,
} from "../../components/kit";
import type { Column } from "../../components/kit";
import { StandInBadge, koreanTitle } from "../../components/LanguageFields";
import { MoveButtons, OrderNumber } from "../../components/ordering";
import { TRACK_LABEL } from "../../lib/tracks";
import { useUrlFilters } from "../../lib/urlFilters";
import { formatClock } from "../../lib/videoFile";
import { LectureFilters } from "./LectureFilters";
import { LectureFormModal } from "./LectureFormModal";
import { useDeleteLecture, useLectureList } from "./useLectures";

/** The columns every lecture row has; the order column is added while ordering. */
function lectureColumns({
  canWrite,
  onOpen,
  onDelete,
}: {
  canWrite: boolean;
  onOpen: (l: AdminLecture) => void;
  onDelete: (l: AdminLecture) => void;
}): Column<AdminLecture>[] {
  return [
    {
      key: "title",
      header: "강의",
      render: (l) => (
        <div className="hgadm-row">
          <Thumb src={l.thumbnail_url} />
          <div>
            <div className="hgadm-title-row">
              <span className="hgadm-cell-main">{l.title}</span>
              <StandInBadge title={l.title} />
            </div>
            {koreanTitle(l) && <div className="hgadm-cell-sub">{koreanTitle(l)}</div>}
          </div>
        </div>
      ),
    },
    {
      key: "home",
      header: "코스 › 시리즈",
      render: (l) => (
        <div>
          <div>{l.course_title ?? "—"}</div>
          <div className="hgadm-cell-sub">{l.series_title ? `› ${l.series_title}` : "시리즈 없음"}</div>
        </div>
      ),
    },
    { key: "track", header: "학습 분야", render: (l) => <Badge tone="brand">{TRACK_LABEL[l.track_id] ?? l.track_id}</Badge> },
    {
      key: "access",
      header: "공개 범위",
      render: (l) => (
        <Badge tone={l.access === "premium" ? "warning" : "success"}>{l.access === "premium" ? "프리미엄" : "무료"}</Badge>
      ),
    },
    {
      key: "video",
      header: "영상",
      render: (l) =>
        l.video_status ? (
          <div>
            <Badge tone={statusTone(l.video_status)}>{statusLabel(l.video_status)}</Badge>
            {l.video_status === "ready" && l.duration_seconds > 0 && <div className="hgadm-cell-sub">{formatClock(l.duration_seconds)}</div>}
          </div>
        ) : (
          <Badge tone="danger">영상 없음</Badge>
        ),
    },
    {
      key: "checkpoints",
      header: "체크포인트",
      render: (l) => (l.checkpoint_count ? `${l.checkpoint_count}개` : <span className="hgadm-muted">없음</span>),
    },
    {
      key: "actions",
      header: "",
      render: (l) => (
        <div className="hgadm-row" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" onClick={() => onOpen(l)}>
            {canWrite ? "편집" : "보기"}
          </Button>
          {canWrite && (
            <Button size="sm" variant="danger-soft" onClick={() => onDelete(l)}>
              삭제
            </Button>
          )}
        </div>
      ),
    },
  ];
}

/**
 * The lecture catalogue. A lecture is one video: adding one asks for its
 * basic information and then opens its workspace, where the video is uploaded
 * (its length is read from it) and checkpoints are placed on it.
 */
export function LecturesPage() {
  const nav = useNavigate();
  const location = useLocation();
  const { can } = useAdminAuth();
  const canWrite = can("content:write");
  const filters = useUrlFilters();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<AdminLecture | null>(null);

  const value = {
    q: filters.value("q"),
    track: filters.value("track_id"),
    courseId: filters.value("course_id"),
    seriesId: filters.value("series_id"),
    access: filters.value("access"),
    page: filters.number("page", 1),
  };
  const { query, courses, series, ordering, reorder, lectureIds, courseTitle, seriesTitle, refresh } = useLectureList(value);
  const remove = useDeleteLecture(() => setDeleting(null));

  // The workspace's back link returns to this list as filtered now.
  const open = (l: AdminLecture) => nav(`/lectures/${l.lecture_id}`, { state: { listSearch: location.search } });

  const orderColumn: Column<AdminLecture> = {
    key: "order",
    header: "앱 표시 순서",
    width: 120,
    render: (l) => {
      const index = lectureIds.indexOf(l.lecture_id);
      return (
        <div className="hgadm-row" onClick={(e) => e.stopPropagation()}>
          <OrderNumber position={index + 1} />
          {canWrite && (
            <MoveButtons
              name={l.title}
              index={index}
              count={lectureIds.length}
              disabled={reorder.saving}
              onMove={(dir) => reorder.move(lectureIds, l.lecture_id, dir)}
            />
          )}
        </div>
      );
    },
  };
  const columns = [...(ordering ? [orderColumn] : []), ...lectureColumns({ canWrite, onOpen: open, onDelete: setDeleting })];

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          {/* Opened for one course (코스 관리 → a series' "강의 N개 보기", or a
              course's lecture link): the way back to that course's series. */}
          {value.courseId && (
            <div className="hgadm-row hgadm-mb-4">
              <Link
                to={`/courses?course_id=${encodeURIComponent(value.courseId)}`}
                className="hgadm-muted hgadm-row hgadm-text-sm hgadm-row--tight"
              >
                <ArrowLeft size={14} strokeWidth={2} />
                {courseTitle ? `${courseTitle} 시리즈 목록` : "코스의 시리즈 목록"}
              </Link>
            </div>
          )}
          <h1>강의·영상 관리</h1>
          <div className="hgadm-page-head__desc">
            강의는 영상 한 편이고, 코스의 시리즈 안에 들어가요. 강의를 추가하면 영상을 올리고(길이는 영상에서 자동으로 읽어요),
            그 영상을 보면서 회화·TOPIK 체크포인트를 원하는 지점에 붙일 수 있어요.
          </div>
        </div>
        {canWrite && (
          <div className="hgadm-page-head__actions">
            <Button variant="primary" onClick={() => setCreating(true)}>
              + 강의 추가
            </Button>
          </div>
        )}
      </div>

      <div className="hgadm-card">
        <LectureFilters filters={filters} value={value} courses={courses} series={series} ordering={ordering} seriesTitle={seriesTitle} />
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          <>
            <DataTable columns={columns} rows={query.data.items} rowKey={(l) => l.lecture_id} onRowClick={open} empty="조건에 맞는 강의가 없습니다." />
            {!ordering && (
              <Pagination
                page={query.data.page}
                pageSize={query.data.page_size}
                total={query.data.total}
                onPageChange={(next) => filters.patch({ page: String(next) })}
              />
            )}
          </>
        )}
      </div>

      {creating && (
        <LectureFormModal
          lecture={null}
          initialCourseId={value.courseId || undefined}
          initialSeriesId={value.seriesId || undefined}
          onClose={() => setCreating(false)}
          onSaved={(created) => {
            setCreating(false);
            refresh();
            open(created);
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="강의 삭제"
        message={`'${deleting?.title ?? ""}' 강의를 영구 삭제할까요? 체크포인트·시청 기록·영상 정보도 함께 삭제되며 되돌릴 수 없습니다.`}
        danger
        confirmLabel="삭제"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUrlFilters } from "../lib/urlFilters";
import { adminApi } from "../api";
import type { AdminLecture } from "../api";
import { errorMessage } from "../../lib/http";
import { useToast, useToastError } from "../../hooks/toast";
import { useAdminAuth } from "../auth";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  ErrorState,
  LoadingState,
  Pagination,
  SearchBox,
  Select,
  statusLabel,
  statusTone,
} from "../components/kit";
import type { Column } from "../components/kit";
import { formatClock } from "../lib/videoFile";
import { LectureFormModal, TRACKS, TRACK_LABEL } from "./lectures/LectureFormModal";

/**
 * The lecture catalogue. A lecture is one video: adding one asks for its
 * basic information and then opens its workspace, where the video is uploaded
 * (its length is read from it) and checkpoints are placed on it.
 */
export function LecturesPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const toast = useToast();
  const toastError = useToastError();
  const { can } = useAdminAuth();
  const canWrite = can("content:write");
  const filters = useUrlFilters();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<AdminLecture | null>(null);

  const q = filters.value("q");
  const track = filters.value("track_id");
  const courseId = filters.value("course_id");
  const access = filters.value("access");
  const page = filters.number("page", 1);

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

  const remove = useMutation({
    mutationFn: (lecture: AdminLecture) => adminApi.deleteLecture(lecture.lecture_id),
    onSuccess: () => {
      toast.success("강의를 삭제했어요.");
      setDeleting(null);
      void qc.invalidateQueries({ queryKey: ["admin", "lectures"] });
      void qc.invalidateQueries({ queryKey: ["admin", "courses"] });
    },
    onError: toastError,
  });

  const open = (l: AdminLecture) => nav(`/lectures/${l.lecture_id}`);

  const columns: Column<AdminLecture>[] = [
    {
      key: "title",
      header: "강의",
      render: (l) => (
        <div className="hgadm-row">
          {l.thumbnail_url && <img src={l.thumbnail_url} alt="" className="hgadm-thumb" />}
          <div className="hgadm-cell-main">{l.title}</div>
        </div>
      ),
    },
    {
      key: "track",
      header: "학습 분야/순서",
      render: (l) => (
        <div>
          <Badge tone="brand">{TRACK_LABEL[l.track_id] ?? l.track_id}</Badge>
          <div className="hgadm-cell-sub">순서 {l.sequence}</div>
        </div>
      ),
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
        l.video_status ? (
          <div>
            <Badge tone={statusTone(l.video_status)}>{statusLabel(l.video_status)}</Badge>
            {l.video_status === "ready" && l.duration_seconds > 0 && (
              <div className="hgadm-cell-sub">{formatClock(l.duration_seconds)}</div>
            )}
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
          <Button size="sm" onClick={() => open(l)}>
            {canWrite ? "편집" : "보기"}
          </Button>
          {canWrite && (
            <Button size="sm" variant="danger-soft" onClick={() => setDeleting(l)}>
              삭제
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>강의·영상 관리</h1>
          <div className="hgadm-page-head__desc">
            강의는 영상 한 편입니다. 강의를 추가하면 영상을 올리고(길이는 영상에서 자동으로 읽어요), 그 영상을
            보면서 회화·TOPIK 체크포인트를 원하는 지점에 붙일 수 있어요.
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
        <div className="hgadm-toolbar">
          <SearchBox
            value={q}
            placeholder="강의 제목 검색"
            onSearch={(next) => filters.patch({ q: next, page: null })}
          />
          <Select
            value={courseId}
            onChange={(e) => filters.patch({ course_id: e.target.value, page: null })}
            style={{ minWidth: 180 }}
          >
            <option value="">코스: 전체</option>
            {courses.data?.items.map((c) => (
              <option key={c.course_id} value={c.course_id}>
                {c.title}
              </option>
            ))}
          </Select>
          {/* Sized to its own widest label: "학습 분야: 전체" measures 132px
              in this trigger. 150 matches the same filter on the 코스 page. */}
          <Select
            value={track}
            onChange={(e) => filters.patch({ track_id: e.target.value, page: null })}
            style={{ width: 150 }}
          >
            <option value="">학습 분야: 전체</option>
            {TRACKS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            value={access}
            onChange={(e) => filters.patch({ access: e.target.value, page: null })}
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
              onRowClick={open}
              empty="조건에 맞는 강의가 없습니다."
            />
            <Pagination
              page={query.data.page}
              pageSize={query.data.page_size}
              total={query.data.total}
              onPageChange={(next) => filters.patch({ page: String(next) })}
            />
          </>
        )}
      </div>

      {creating && (
        <LectureFormModal
          lecture={null}
          onClose={() => setCreating(false)}
          onSaved={(created) => {
            setCreating(false);
            void qc.invalidateQueries({ queryKey: ["admin", "lectures"] });
            void qc.invalidateQueries({ queryKey: ["admin", "courses"] });
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

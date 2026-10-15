import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../api";
import type { AdminLecture } from "../../api";
import { useToast, useToastError } from "../../../hooks/toast";
import { useReorder } from "../../components/ordering";

export type LectureFilters = {
  q: string;
  track: string;
  courseId: string;
  seriesId: string;
  access: string;
  page: number;
};

/** What the lecture list shows changes the lecture and course lists. */
function useRefreshLectures() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["admin", "lectures"] });
    void qc.invalidateQueries({ queryKey: ["admin", "courses"] });
  };
}

/**
 * The lecture list for the current filters, the course and series choices
 * behind them, and the order within a series.
 *
 * Lessons are ordered within their series. With one series chosen and
 * nothing else narrowing the list, every lesson of it is shown in the app's
 * order and can be moved; any other view is a search, not an order.
 */
export function useLectureList(f: LectureFilters) {
  const courses = useQuery({ queryKey: ["admin", "courses", ""], queryFn: () => adminApi.listCourses() });
  // The series filter lists the chosen course's series.
  const series = useQuery({
    queryKey: ["admin", "series", f.courseId],
    queryFn: () => adminApi.listSeries(f.courseId),
    enabled: !!f.courseId,
  });
  const ordering = !!f.seriesId && !f.q && !f.track && !f.access;
  const listKey = ["admin", "lectures", { ...f, ordering }];
  const query = useQuery({
    queryKey: listKey,
    queryFn: () =>
      adminApi.listLectures({
        q: f.q || undefined,
        track_id: f.track || undefined,
        course_id: f.courseId || undefined,
        series_id: f.seriesId || undefined,
        access: f.access || undefined,
        page: ordering ? 1 : f.page,
        page_size: ordering ? 100 : 25,
      }),
  });
  const reorder = useReorder<AdminLecture>({
    queryKey: listKey,
    idOf: (l) => l.lecture_id,
    save: (ids) => adminApi.reorderSeriesLectures(f.seriesId, ids),
    alsoRefresh: [["admin", "series-lessons", f.seriesId], ["admin", "lecture"]],
  });
  return {
    query,
    courses: courses.data?.items ?? [],
    series: series.data?.items ?? [],
    ordering,
    reorder,
    lectureIds: (query.data?.items ?? []).map((l) => l.lecture_id),
    courseTitle: courses.data?.items.find((c) => c.course_id === f.courseId)?.title,
    seriesTitle: series.data?.items.find((s) => s.series_id === f.seriesId)?.title,
    refresh: useRefreshLectures(),
  };
}

export function useDeleteLecture(onDeleted: () => void) {
  const toast = useToast();
  const toastError = useToastError();
  const refresh = useRefreshLectures();
  return useMutation({
    mutationFn: (lecture: AdminLecture) => adminApi.deleteLecture(lecture.lecture_id),
    onSuccess: () => {
      toast.success("강의를 삭제했어요.");
      onDeleted();
      refresh();
    },
    onError: toastError,
  });
}

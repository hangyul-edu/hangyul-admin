import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../../api";
import type { AdminLecture, AdminSeries } from "../../api";
import { errorMessage } from "../../../lib/http";
import { ErrorState, LoadingState } from "../../components/kit";
import { StandInBadge, koreanTitle } from "../../components/LanguageFields";
import { MoveButtons, OrderNumber, useReorder } from "../../components/ordering";

/** Every lesson of one series, which the series page (COU-002) lists top to bottom. */
export function seriesLessonsKey(seriesId: string) {
  return ["admin", "series-lessons", seriesId];
}

/**
 * A series' lessons in the order the app lists them (COU-002: 1-1, 1-2, …),
 * with ↑ / ↓ to change it. Each move is saved at once.
 */
export function LessonOrder({ series, canWrite }: { series: AdminSeries; canWrite: boolean }) {
  const key = seriesLessonsKey(series.series_id);
  const list = useQuery({
    queryKey: key,
    queryFn: () => adminApi.listLectures({ series_id: series.series_id, page_size: 100 }),
  });
  const reorder = useReorder<AdminLecture>({
    queryKey: key,
    idOf: (l) => l.lecture_id,
    save: (ids) => adminApi.reorderSeriesLectures(series.series_id, ids),
    alsoRefresh: [["admin", "lectures"], ["admin", "lecture"]],
  });

  if (list.isPending) return <LoadingState />;
  if (list.isError) return <ErrorState message={errorMessage(list.error)} onRetry={() => void list.refetch()} />;
  const lessons = list.data.items;
  if (lessons.length === 0) {
    return <div className="hgadm-series__empty">이 시리즈에는 아직 강의가 없어요.</div>;
  }
  const ids = lessons.map((l) => l.lecture_id);
  return (
    <ol className="hgadm-order-list" aria-label={`‘${series.title}’ 강의 순서`}>
      {lessons.map((lesson, index) => (
        <li key={lesson.lecture_id} className="hgadm-order-list__row">
          <OrderNumber position={index + 1} />
          <div className="hgadm-order-list__main">
            <div className="hgadm-title-row">
              <span className="hgadm-cell-main">{lesson.title}</span>
              <StandInBadge title={lesson.title} />
            </div>
            {koreanTitle(lesson) && <div className="hgadm-cell-sub">{koreanTitle(lesson)}</div>}
          </div>
          {canWrite && (
            <MoveButtons
              name={lesson.title}
              index={index}
              count={lessons.length}
              disabled={reorder.saving}
              onMove={(dir) => reorder.move(ids, lesson.lecture_id, dir)}
            />
          )}
        </li>
      ))}
    </ol>
  );
}

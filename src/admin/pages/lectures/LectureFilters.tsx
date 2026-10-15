import type { AdminCourse, AdminSeries } from "../../api";
import { SearchBox, Select } from "../../components/kit";
import { TRACKS } from "../../lib/tracks";
import type { UrlFilters } from "../../lib/urlFilters";
import type { LectureFilters as Filters } from "./useLectures";

/** Search, course → series, track and access filters, and what the order note says. */
export function LectureFilters({
  filters,
  value,
  courses,
  series,
  ordering,
  seriesTitle,
}: {
  filters: UrlFilters;
  value: Filters;
  courses: AdminCourse[];
  series: AdminSeries[];
  ordering: boolean;
  seriesTitle: string | undefined;
}) {
  const { q, courseId, seriesId, track, access } = value;
  return (
    <>
      <div className="hgadm-toolbar">
        <SearchBox value={q} placeholder="강의 제목 검색" onSearch={(next) => filters.patch({ q: next, page: null })} />
        <Select value={courseId} onChange={(e) => filters.patch({ course_id: e.target.value, series_id: null, page: null })}>
          <option value="">코스: 전체</option>
          {courses.map((c) => (
            <option key={c.course_id} value={c.course_id}>
              {c.title}
            </option>
          ))}
        </Select>
        <Select
          value={seriesId}
          disabled={!courseId}
          aria-label="시리즈"
          onChange={(e) => filters.patch({ series_id: e.target.value, page: null })}
        >
          <option value="">{courseId ? "시리즈: 전체" : "시리즈: 코스 먼저"}</option>
          {series.map((s) => (
            <option key={s.series_id} value={s.series_id}>
              {s.title}
            </option>
          ))}
        </Select>
        <Select value={track} onChange={(e) => filters.patch({ track_id: e.target.value, page: null })}>
          <option value="">학습 분야: 전체</option>
          {TRACKS.map(([trackId, label]) => (
            <option key={trackId} value={trackId}>
              {label}
            </option>
          ))}
        </Select>
        <Select value={access} onChange={(e) => filters.patch({ access: e.target.value, page: null })}>
          <option value="">공개: 전체</option>
          <option value="free">무료</option>
          <option value="premium">프리미엄</option>
        </Select>
      </div>
      <p className="hgadm-order-note" role="note">
        {ordering
          ? `‘${seriesTitle ?? "이 시리즈"}’의 강의가 앱에 보이는 순서예요. ↑ / ↓ 로 바꾸면 바로 저장돼요.`
          : seriesId
            ? "순서를 바꾸려면 검색어·학습 분야·공개 필터를 비우세요 — 시리즈의 강의 전체가 보여야 순서를 정할 수 있어요."
            : "강의는 시리즈 안에서 순서가 정해져요. 코스와 시리즈를 고르면 앱에 보이는 순서대로 나오고, 여기서 바로 바꿀 수 있어요."}
      </p>
    </>
  );
}

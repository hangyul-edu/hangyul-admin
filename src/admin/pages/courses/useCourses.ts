import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { adminApi } from "../../api";
import type { AdminCourse } from "../../api";
import { useToast, useToastError } from "../../../hooks/toast";
import { languageDraft, translationsOf } from "../../components/LanguageFields";
import type { LanguageDraft } from "../../components/LanguageFields";
import { useReorder } from "../../components/ordering";

const COURSES_KEY = ["admin", "courses"];

/** The editor's working copy of a course. */
export interface CourseDraft {
  track_id: string;
  text: LanguageDraft;
  cover_image_url: string;
}

export function emptyCourseDraft(): CourseDraft {
  return { track_id: "track_conversation", text: languageDraft(null), cover_image_url: "" };
}

export function draftFromCourse(c: AdminCourse): CourseDraft {
  return { track_id: c.track_id, text: languageDraft(c), cover_image_url: c.cover_image_url ?? "" };
}

/** The courses of one track (or all), and their order within each track. */
export function useCourseList(track: string) {
  const key = [...COURSES_KEY, track];
  const query = useQuery({ queryKey: key, queryFn: () => adminApi.listCourses(track || undefined) });
  const items = query.data?.items ?? [];
  // Courses are ordered within their track; a new one goes to the end.
  const reorder = useReorder<AdminCourse>({
    queryKey: key,
    idOf: (c) => c.course_id,
    save: (ids) => {
      const trackOf = items.find((c) => c.course_id === ids[0])?.track_id ?? "";
      return adminApi.reorderCourses(trackOf, ids);
    },
    alsoRefresh: [COURSES_KEY],
  });
  const trackIds = (trackId: string) => items.filter((c) => c.track_id === trackId).map((c) => c.course_id);
  return { query, reorder, trackIds };
}

/**
 * The course whose series are open below the table — in the URL, so the
 * lecture form's "시리즈 추가" link lands straight on it. Choosing it again
 * closes it.
 */
export function useSelectedCourse() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("course_id") ?? "";
  const toggle = (course: AdminCourse) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (next.get("course_id") === course.course_id) next.delete("course_id");
        else next.set("course_id", course.course_id);
        return next;
      },
      { replace: true },
    );
  return { selectedId, toggle };
}

/** Saving (create or update) and deleting a course. */
export function useCourseMutations({ onSaved, onDeleted }: { onSaved: () => void; onDeleted: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const refresh = () => void qc.invalidateQueries({ queryKey: COURSES_KEY });

  const save = useMutation({
    mutationFn: ({ id, draft }: { id: string | null; draft: CourseDraft }) => {
      const body = {
        title: draft.text.en.title.trim(),
        description: draft.text.en.description,
        cover_image_url: draft.cover_image_url || null,
        translations: translationsOf(draft.text),
      };
      return id ? adminApi.updateCourse(id, body) : adminApi.createCourse({ ...body, track_id: draft.track_id });
    },
    onSuccess: () => {
      toast.success("코스를 저장했어요.");
      onSaved();
      refresh();
    },
    onError: toastError,
  });

  const remove = useMutation({
    mutationFn: (course: AdminCourse) => adminApi.deleteCourse(course.course_id),
    onSuccess: () => {
      toast.success("코스를 삭제했어요.");
      onDeleted();
      refresh();
    },
    onError: toastError,
  });

  return { save, remove };
}

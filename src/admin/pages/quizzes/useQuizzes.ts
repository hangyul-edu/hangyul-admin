import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../api";
import type { AdminQuiz } from "../../api";
import { useToast, useToastError } from "../../../hooks/toast";
import { draftToBody, type QuizDraft } from "./draft";

export const QUIZZES_KEY = ["admin", "quizzes"];
export const PAGE_SIZE = 25;

type QuizFilters ={ q: string; format: string; section: string; level: string; aiOnly: string; page: number };

/** One page of the question list, for the current filters. */
export function useQuizList({ q, format, section, level, aiOnly, page }: QuizFilters) {
  return useQuery({
    queryKey: [...QUIZZES_KEY, { q, format, section, level, aiOnly, page }],
    queryFn: () =>
      adminApi.listQuizzes({
        q: q || undefined,
        answer_format: format || undefined,
        topik_section: section || undefined,
        level: level || undefined,
        is_ai_generated: aiOnly === "" ? undefined : aiOnly === "true",
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
  });
}

/** Saving (create or replace) and deleting a question, each refreshing the list. */
export function useQuizMutations({ onSaved, onDeleted }: { onSaved: () => void; onDeleted: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const refresh = () => void qc.invalidateQueries({ queryKey: QUIZZES_KEY });

  const save = useMutation({
    mutationFn: ({ id, draft }: { id: string | null; draft: QuizDraft }) =>
      id ? adminApi.replaceQuiz(id, draftToBody(draft)) : adminApi.createQuiz(draftToBody(draft)),
    onSuccess: () => {
      toast.success("문제를 저장했어요.");
      onSaved();
      refresh();
    },
    onError: toastError,
  });

  const remove = useMutation({
    mutationFn: (quiz: AdminQuiz) => adminApi.deleteQuiz(quiz.quiz_id),
    onSuccess: () => {
      toast.success("문제를 삭제했어요.");
      onDeleted();
      refresh();
    },
    onError: toastError,
  });

  return { save, remove, refresh };
}

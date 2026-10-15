import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../api";
import type { AdminSentence } from "../../api";
import { useToast, useToastError } from "../../../hooks/toast";
import { SENTENCE_TOPICS_KEY } from "../../lib/topicNames";
import { sentenceBody, type SentenceDraft } from "./draft";

export const SENTENCES_KEY = ["admin", "sentences"];
/** What changes when a sentence is added, edited or removed: the list and the topics in use. */
export const SENTENCE_KEYS = [SENTENCES_KEY, [...SENTENCE_TOPICS_KEY]];

export function useSentenceList(filters: { q: string; level: string; topic: string; aiOnly: string; page: number }) {
  const { q, level, topic, aiOnly, page } = filters;
  return useQuery({
    queryKey: [...SENTENCES_KEY, { q, level, topic, aiOnly, page }],
    queryFn: () =>
      adminApi.listSentences({
        q: q || undefined,
        level: level || undefined,
        topic: topic || undefined,
        is_ai_generated: aiOnly === "" ? undefined : aiOnly === "true",
        page,
        page_size: 25,
      }),
  });
}

/** Saving (create or update) and deleting a sentence. */
export function useSentenceMutations({ onSaved, onDeleted }: { onSaved: () => void; onDeleted: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const refresh = () => SENTENCE_KEYS.forEach((queryKey) => void qc.invalidateQueries({ queryKey }));

  const save = useMutation({
    mutationFn: ({ id, draft }: { id: string | null; draft: SentenceDraft }) => {
      const body = sentenceBody(draft);
      if (!id) return adminApi.createSentence(body);
      // The Korean text of a blanked sentence is not editable here; leave it
      // out rather than re-sending it.
      return adminApi.updateSentence(id, draft.blanked ? { ...body, korean: undefined } : body);
    },
    onSuccess: () => {
      toast.success("문장을 저장했어요.");
      onSaved();
      refresh();
    },
    onError: toastError,
  });

  const remove = useMutation({
    mutationFn: (s: AdminSentence) => adminApi.deleteSentence(s.sentence_id),
    onSuccess: () => {
      toast.success("문장을 삭제했어요.");
      onDeleted();
      refresh();
    },
    onError: toastError,
  });

  return { save, remove };
}

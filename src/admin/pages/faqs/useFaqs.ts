import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../api";
import type { AdminFaq } from "../../api";
import { useToast, useToastError } from "../../../hooks/toast";
import { draftTranslations, type FaqDraft } from "./draft";

export const FAQS_KEY = ["admin", "faqs"];

export function useFaqList() {
  return useQuery({ queryKey: FAQS_KEY, queryFn: adminApi.listFaqs });
}

/** Saving, publishing and deleting FAQs; each refreshes the list. */
export function useFaqMutations({ onSaved, onDeleted }: { onSaved: () => void; onDeleted: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const refresh = () => void qc.invalidateQueries({ queryKey: FAQS_KEY });

  const save = useMutation({
    mutationFn: async ({ editing, draft }: { editing: AdminFaq | null; draft: FaqDraft }) => {
      const translations = draftTranslations(draft);
      // No order: a new FAQ goes to the end of its category, and the order is
      // changed with ↑ / ↓ in the list.
      const body = { category: draft.category, translations, published: draft.published };
      if (!editing) return adminApi.createFaq(body);

      const saved = await adminApi.updateFaq(editing.faq_id, body);
      // PATCH only upserts, so a language the admin cleared has to be removed
      // explicitly. Never the last one — the editor requires one filled in.
      const kept = new Set(translations.map((t) => t.locale));
      let latest = saved;
      for (const { locale } of editing.translations) {
        if (!kept.has(locale)) latest = await adminApi.deleteFaqTranslation(editing.faq_id, locale);
      }
      return latest;
    },
    onSuccess: () => {
      toast.success("FAQ를 저장했어요.");
      onSaved();
      refresh();
    },
    onError: toastError,
  });

  const togglePublish = useMutation({
    mutationFn: (faq: AdminFaq) => adminApi.updateFaq(faq.faq_id, { published: !faq.published }),
    onSuccess: refresh,
    onError: toastError,
  });

  const remove = useMutation({
    mutationFn: (faq: AdminFaq) => adminApi.deleteFaq(faq.faq_id),
    onSuccess: () => {
      toast.success("FAQ를 삭제했어요.");
      onDeleted();
      refresh();
    },
    onError: toastError,
  });

  return { save, togglePublish, remove };
}

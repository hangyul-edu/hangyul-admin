import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../api";
import type { AdminNotice } from "../../api";
import { useToast, useToastError } from "../../../hooks/toast";
import { useReorder } from "../../components/ordering";
import { draftTranslations, type NoticeDraft } from "./draft";

const NOTICES_KEY = ["admin", "notices"];

/**
 * The notice list and its order. The app lists pinned notices first, then the
 * rest; each group keeps its own order, so a notice moves within its group.
 */
export function useNoticeList() {
  const query = useQuery({ queryKey: NOTICES_KEY, queryFn: adminApi.listNotices });
  const reorder = useReorder<AdminNotice>({
    queryKey: NOTICES_KEY,
    idOf: (n) => n.notice_id,
    save: (ids) => adminApi.reorderNotices(ids),
  });
  const groupIds = (pinned: boolean) => (query.data?.items ?? []).filter((n) => n.pinned === pinned).map((n) => n.notice_id);
  return { query, reorder, groupIds };
}

/** Saving, publishing and deleting notices; each refreshes the list. */
export function useNoticeMutations({ onSaved, onDeleted }: { onSaved: () => void; onDeleted: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const refresh = () => void qc.invalidateQueries({ queryKey: NOTICES_KEY });

  const save = useMutation({
    mutationFn: async ({ id, draft }: { id: string | null; draft: NoticeDraft }) => {
      const translations = draftTranslations(draft);
      // No order: a new notice goes to the end, and the order is changed with
      // ↑ / ↓ in the list.
      const body = { translations, pinned: draft.pinned, published: draft.published };
      if (!id) return adminApi.createNotice(body);

      const saved = await adminApi.updateNotice(id, body);
      // PATCH only upserts, so a ko/en language the admin cleared has to be
      // removed explicitly — otherwise the old text stays live. Never the last
      // one: `translations` is non-empty to get here. Locales this editor has
      // no fields for are left alone.
      const kept = new Set(translations.map((t) => t.locale));
      const removed = saved.translations
        .map((t) => t.locale)
        .filter((locale) => (locale === "ko" || locale === "en") && !kept.has(locale));
      let latest = saved;
      for (const locale of removed) latest = await adminApi.deleteNoticeTranslation(id, locale);
      return latest;
    },
    onSuccess: () => {
      toast.success("공지를 저장했어요.");
      onSaved();
      refresh();
    },
    onError: toastError,
  });

  const togglePublish = useMutation({
    mutationFn: (notice: AdminNotice) => adminApi.updateNotice(notice.notice_id, { published: !notice.published }),
    onSuccess: refresh,
    onError: toastError,
  });

  const remove = useMutation({
    mutationFn: (notice: AdminNotice) => adminApi.deleteNotice(notice.notice_id),
    onSuccess: () => {
      toast.success("공지를 삭제했어요.");
      onDeleted();
      refresh();
    },
    onError: toastError,
  });

  return { save, togglePublish, remove };
}

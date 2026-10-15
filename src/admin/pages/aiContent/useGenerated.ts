import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../api";
import { useToast, useToastError } from "../../../hooks/toast";

/** `GeneratedContentKind` on the backend — the values the list filters on. */
export const SENTENCE_KIND = "conversation_sentence";
export const QUESTION_KIND = "topik_question";

export const KIND_LABEL: Record<string, string> = {
  [SENTENCE_KIND]: "문장",
  [QUESTION_KIND]: "문제",
};

export type ReviewStatus = "approved" | "rejected" | "pending";

export type GeneratedFilters = { q: string; reviewStatus: string; kind: string; level: string; page: number };

export function useGeneratedList({ q, reviewStatus, kind, level, page }: GeneratedFilters) {
  return useQuery({
    queryKey: ["admin", "generated", { q, reviewStatus, kind, level, page }],
    queryFn: () =>
      adminApi.listGenerated({
        q: q || undefined,
        // "all" is a sentinel for "no status filter"; sending it would filter
        // to a non-existent status. Everything else is a real status value.
        review_status: reviewStatus === "all" ? undefined : reviewStatus,
        content_kind: kind || undefined,
        level: level || undefined,
        page,
        page_size: 25,
      }),
  });
}

export function useGeneratedDetail(contentId: string | null) {
  return useQuery({
    queryKey: ["admin", "generated-detail", contentId],
    queryFn: () => adminApi.getGenerated(contentId!),
    enabled: contentId !== null,
  });
}

/** A review or a deletion changes the queue, the open item and the dashboard's count. */
function useRefreshGenerated() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["admin", "generated"] });
    void qc.invalidateQueries({ queryKey: ["admin", "generated-detail"] });
    void qc.invalidateQueries({ queryKey: ["admin", "metrics", "overview"] });
  };
}

const REVIEWED: Record<ReviewStatus, string> = {
  approved: "승인했어요.",
  rejected: "반려했어요.",
  pending: "검수 대기로 되돌렸어요.",
};

export function useReviewGenerated(onReviewed: () => void) {
  const toast = useToast();
  const toastError = useToastError();
  const refresh = useRefreshGenerated();
  return useMutation({
    mutationFn: ({ contentId, status, note }: { contentId: string; status: ReviewStatus; note: string }) =>
      adminApi.reviewGenerated(contentId, { review_status: status, note: note || undefined }),
    onSuccess: (_, { status }) => {
      toast.success(REVIEWED[status]);
      onReviewed();
      refresh();
    },
    onError: toastError,
  });
}

export function useDeleteGenerated(onDeleted: () => void) {
  const toast = useToast();
  const toastError = useToastError();
  const refresh = useRefreshGenerated();
  return useMutation({
    mutationFn: (contentId: string) => adminApi.deleteGenerated(contentId),
    onSuccess: () => {
      toast.success("항목을 삭제했어요.");
      onDeleted();
      refresh();
    },
    onError: toastError,
  });
}

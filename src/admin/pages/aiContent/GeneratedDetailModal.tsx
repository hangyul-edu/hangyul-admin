import { useEffect, useState } from "react";
import type { GeneratedDetail } from "../../api";
import { errorMessage } from "../../../lib/http";
import { Badge, Button, Dl, ErrorState, Field, LoadingState, Modal, statusLabel, statusTone, Textarea } from "../../components/kit";
import { formatDateTime } from "../../lib/format";
import { topikTypeLabel } from "../../lib/topik";
import { useTopicNames } from "../../lib/topicNames";
import { KIND_LABEL, useGeneratedDetail, useReviewGenerated } from "./useGenerated";

/** One generated item: its source data and generation conditions, and its review. */
export function GeneratedDetailModal({
  contentId,
  canWrite,
  onClose,
  onDelete,
}: {
  contentId: string | null;
  canWrite: boolean;
  onClose: () => void;
  onDelete: (item: GeneratedDetail) => void;
}) {
  const detail = useGeneratedDetail(contentId);
  const { topicName } = useTopicNames();
  const [note, setNote] = useState("");
  const review = useReviewGenerated(() => setNote(""));

  // The note belongs to the item on screen. A review always writes the note
  // it is sent (an omitted one clears the saved note), so the box starts from
  // what is saved rather than empty — and never carries text typed for a
  // different item.
  const shownId = detail.data?.content_id;
  const savedNote = detail.data?.review_note ?? "";
  useEffect(() => setNote(savedNote), [shownId, savedNote]);

  const item = detail.data;
  const decide = (status: "approved" | "rejected") => item && review.mutate({ contentId: item.content_id, status, note });

  return (
    <Modal
      open={contentId !== null}
      title="생성 콘텐츠 상세"
      size="xl"
      onClose={onClose}
      footer={
        canWrite && item ? (
          <>
            <Button variant="danger-soft" onClick={() => onDelete(item)}>
              삭제
            </Button>
            <span className="hgadm-flex-1" />
            {item.review_status !== "rejected" && (
              <Button variant="danger" loading={review.isPending} onClick={() => decide("rejected")}>
                반려
              </Button>
            )}
            {item.review_status !== "approved" && (
              <Button variant="primary" loading={review.isPending} onClick={() => decide("approved")}>
                승인
              </Button>
            )}
          </>
        ) : undefined
      }
    >
      {detail.isPending ? (
        <LoadingState />
      ) : detail.isError ? (
        <ErrorState message={errorMessage(detail.error)} />
      ) : item ? (
        <div className="hgadm-text-md">
          <div className="hgadm-row hgadm-row--wrap hgadm-mb-12">
            <Badge tone={statusTone(item.review_status)}>{statusLabel(item.review_status)}</Badge>
            <Badge tone="info">{KIND_LABEL[item.content_kind] ?? item.content_kind}</Badge>
            <Badge tone="neutral">레벨 {item.level}</Badge>
            <span className="hgadm-cell-mono hgadm-muted">{item.model}</span>
          </div>
          <Dl
            items={[
              ["생성일", formatDateTime(item.created_at)],
              ["생성 경로", item.source],
              ["주제", item.topic ? topicName(item.topic) : null],
              ["TOPIK 유형", item.topik_question_type ? topikTypeLabel(item.topik_question_type) : null],
              ["언어", item.language],
              ["요청 사용자", item.created_by_user_id],
              ["검수", item.reviewed_by ? `${item.reviewed_by} · ${formatDateTime(item.reviewed_at)}` : "아직 검수되지 않음"],
              ["검수 메모", item.review_note],
            ]}
          />
          <hr className="hgadm-divider" />
          <div className="hgadm-field__label">생성 결과 원본</div>
          <pre className="hgadm-json">{JSON.stringify(item.payload, null, 2)}</pre>
          {canWrite && (
            <Field label="검수 메모" hint="승인/반려와 함께 저장됩니다.">
              <Textarea rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
            </Field>
          )}
        </div>
      ) : null}
    </Modal>
  );
}

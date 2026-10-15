import { useState } from "react";
import { Pin } from "lucide-react";
import type { AdminNotice } from "../../api";
import { errorMessage } from "../../../lib/http";
import { useAdminAuth } from "../../auth";
import { Badge, Button, ConfirmDialog, DataTable, ErrorState, LoadingState, Switch } from "../../components/kit";
import type { Column } from "../../components/kit";
import { MoveButtons, OrderNumber } from "../../components/ordering";
import { formatDateTime } from "../../lib/format";
import { draftFromNotice, emptyNoticeDraft, noticeTitle, type NoticeDraft } from "./draft";
import { NoticeEditor } from "./NoticeEditor";
import { useNoticeList, useNoticeMutations } from "./useNotices";

/** 공지 관리: the app's notices, pinned first, in the order the app lists them. */
export function NoticesPage() {
  const { can } = useAdminAuth();
  const canWrite = can("ops:write");
  const [draft, setDraft] = useState<NoticeDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminNotice | null>(null);

  const { query, reorder, groupIds } = useNoticeList();
  const { save, togglePublish, remove } = useNoticeMutations({
    onSaved: () => {
      setDraft(null);
      setEditingId(null);
    },
    onDeleted: () => setDeleting(null),
  });

  const columns: Column<AdminNotice>[] = [
    {
      key: "order",
      header: "앱 표시 순서",
      width: 120,
      render: (n) => {
        const scope = groupIds(n.pinned);
        const index = scope.indexOf(n.notice_id);
        return (
          <div className="hgadm-row">
            <OrderNumber position={index + 1} />
            {canWrite && (
              <MoveButtons
                name={noticeTitle(n) ?? "공지"}
                index={index}
                count={scope.length}
                disabled={reorder.saving}
                onMove={(dir) => reorder.move(scope, n.notice_id, dir)}
              />
            )}
          </div>
        );
      },
    },
    {
      key: "title",
      header: "공지",
      render: (n) => (
        <div>
          <div className="hgadm-cell-main hgadm-row hgadm-row--tight">
            {n.pinned && <Pin className="hgadm-notice-pin" size={14} strokeWidth={2} aria-label="고정됨" />}
            {noticeTitle(n) ?? "(제목 없음)"}
          </div>
          <div className="hgadm-cell-sub">번역: {n.translations.map((t) => t.locale).join(", ")}</div>
        </div>
      ),
    },
    {
      key: "published",
      header: "게시 상태",
      render: (n) => (
        <div>
          <Badge tone={n.published ? "success" : "neutral"} dot>
            {n.published ? "게시 중" : "초안"}
          </Badge>
          {n.published_at && <div className="hgadm-cell-sub">{formatDateTime(n.published_at)}</div>}
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (n) =>
        canWrite ? (
          <div className="hgadm-row" onClick={(e) => e.stopPropagation()}>
            <Switch checked={n.published} onChange={() => togglePublish.mutate(n)} label="게시 여부" />
            <Button
              size="sm"
              onClick={() => {
                setEditingId(n.notice_id);
                setDraft(draftFromNotice(n));
              }}
            >
              수정
            </Button>
            <Button size="sm" variant="danger-soft" onClick={() => setDeleting(n)}>
              삭제
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>공지 관리</h1>
          <div className="hgadm-page-head__desc">
            앱 공지사항입니다. 한국어/영어 번역을 각각 작성할 수 있으며, 초안은 사용자에게 노출되지 않습니다. 앱에는 상단 고정
            공지가 먼저, 그다음 나머지가 아래 순서대로 보여요 — ↑ / ↓ 로 바꾸면 바로 저장돼요.
          </div>
        </div>
        {canWrite && (
          <div className="hgadm-page-head__actions">
            <Button
              variant="primary"
              onClick={() => {
                setEditingId(null);
                setDraft(emptyNoticeDraft());
              }}
            >
              + 공지 작성
            </Button>
          </div>
        )}
      </div>

      <div className="hgadm-card">
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          <DataTable columns={columns} rows={query.data.items} rowKey={(n) => n.notice_id} empty="공지가 없습니다." />
        )}
      </div>

      <NoticeEditor
        draft={draft}
        setDraft={setDraft}
        editing={editingId !== null}
        saving={save.isPending}
        onSave={(d) => save.mutate({ id: editingId, draft: d })}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="공지 삭제"
        message="공지를 영구 삭제할까요? 잠시 내리려면 삭제 대신 게시를 끄는 것을 권장합니다."
        danger
        confirmLabel="삭제"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

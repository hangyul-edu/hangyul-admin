import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../api";
import type { AdminNotice, NoticeTranslation } from "../api";
import { errorMessage } from "../../lib/http";
import { useToast } from "../../hooks/toast";
import { useAdminAuth } from "../auth";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Modal,
  Switch,
  Textarea,
  formatDateTime,
} from "../components/kit";
import type { Column } from "../components/kit";

interface NoticeDraft {
  ko_title: string;
  ko_body: string;
  en_title: string;
  en_body: string;
  pinned: boolean;
  published: boolean;
  display_order: string;
}

const EMPTY: NoticeDraft = {
  ko_title: "",
  ko_body: "",
  en_title: "",
  en_body: "",
  pinned: false,
  published: false,
  display_order: "0",
};

function pick(notice: AdminNotice, locale: string): NoticeTranslation | undefined {
  return notice.translations.find((t) => t.locale === locale);
}

export function NoticesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAdminAuth();
  const canWrite = can("ops:write");
  const [draft, setDraft] = useState<NoticeDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminNotice | null>(null);

  const query = useQuery({ queryKey: ["admin", "notices"], queryFn: adminApi.listNotices });

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["admin", "notices"] });
  }

  const save = useMutation({
    mutationFn: (d: NoticeDraft) => {
      const translations: NoticeTranslation[] = [];
      if (d.ko_title.trim()) translations.push({ locale: "ko", title: d.ko_title, body: d.ko_body });
      if (d.en_title.trim()) translations.push({ locale: "en", title: d.en_title, body: d.en_body });
      const body = {
        translations,
        pinned: d.pinned,
        published: d.published,
        display_order: Number(d.display_order),
      };
      return editingId ? adminApi.updateNotice(editingId, body) : adminApi.createNotice(body);
    },
    onSuccess: () => {
      toast.success("공지를 저장했어요.");
      setDraft(null);
      setEditingId(null);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const togglePublish = useMutation({
    mutationFn: (notice: AdminNotice) =>
      adminApi.updateNotice(notice.notice_id, { published: !notice.published }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (notice: AdminNotice) => adminApi.deleteNotice(notice.notice_id),
    onSuccess: () => {
      toast.success("공지를 삭제했어요.");
      setDeleting(null);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const columns: Column<AdminNotice>[] = [
    {
      key: "title",
      header: "공지",
      render: (n) => {
        const ko = pick(n, "ko") ?? n.translations[0];
        return (
          <div>
            <div className="hgadm-cell-main">
              {n.pinned && "📌 "}
              {ko?.title ?? "(제목 없음)"}
            </div>
            <div className="hgadm-cell-sub">
              번역: {n.translations.map((t) => t.locale).join(", ")}
            </div>
          </div>
        );
      },
    },
    {
      key: "published",
      header: "게시 상태",
      render: (n) => (
        <div>
          <Badge tone={n.published ? "success" : "neutral"} dot>
            {n.published ? "게시 중" : "초안"}
          </Badge>
          {n.published_at && (
            <div className="hgadm-cell-sub">{formatDateTime(n.published_at)}</div>
          )}
        </div>
      ),
    },
    { key: "order", header: "순서", numeric: true, render: (n) => n.display_order },
    {
      key: "actions",
      header: "",
      render: (n) =>
        canWrite ? (
          <div className="hgadm-row" onClick={(e) => e.stopPropagation()}>
            <Switch
              checked={n.published}
              onChange={() => togglePublish.mutate(n)}
              label="게시 여부"
            />
            <Button
              size="sm"
              onClick={() => {
                const ko = pick(n, "ko");
                const en = pick(n, "en");
                setEditingId(n.notice_id);
                setDraft({
                  ko_title: ko?.title ?? "",
                  ko_body: ko?.body ?? "",
                  en_title: en?.title ?? "",
                  en_body: en?.body ?? "",
                  pinned: n.pinned,
                  published: n.published,
                  display_order: String(n.display_order),
                });
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

  const draftValid =
    draft !== null &&
    ((draft.ko_title.trim().length >= 2 && draft.ko_body.trim().length >= 2) ||
      (draft.en_title.trim().length >= 2 && draft.en_body.trim().length >= 2));

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>공지 관리</h1>
          <div className="hgadm-page-head__desc">
            앱 공지사항입니다. 한국어/영어 번역을 각각 작성할 수 있으며, 초안은
            사용자에게 노출되지 않습니다.
          </div>
        </div>
        {canWrite && (
          <div className="hgadm-page-head__actions">
            <Button
              variant="primary"
              onClick={() => {
                setEditingId(null);
                setDraft({ ...EMPTY });
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
          <DataTable
            columns={columns}
            rows={query.data.items}
            rowKey={(n) => n.notice_id}
            empty="공지가 없습니다."
          />
        )}
      </div>

      <Modal
        open={draft !== null}
        title={editingId ? "공지 수정" : "공지 작성"}
        size="lg"
        onClose={() => setDraft(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              취소
            </Button>
            <Button
              variant="primary"
              loading={save.isPending}
              disabled={!draftValid}
              onClick={() => draft && save.mutate(draft)}
            >
              저장
            </Button>
          </>
        }
      >
        {draft && (
          <div>
            <div className="hgadm-grid-2">
              <div>
                <Field label="제목 (한국어)" required>
                  <Input
                    value={draft.ko_title}
                    maxLength={200}
                    onChange={(e) => setDraft({ ...draft, ko_title: e.target.value })}
                  />
                </Field>
                <Field label="본문 (한국어)" required>
                  <Textarea
                    rows={7}
                    value={draft.ko_body}
                    onChange={(e) => setDraft({ ...draft, ko_body: e.target.value })}
                  />
                </Field>
              </div>
              <div>
                <Field label="Title (English)">
                  <Input
                    value={draft.en_title}
                    maxLength={200}
                    onChange={(e) => setDraft({ ...draft, en_title: e.target.value })}
                  />
                </Field>
                <Field label="Body (English)">
                  <Textarea
                    rows={7}
                    value={draft.en_body}
                    onChange={(e) => setDraft({ ...draft, en_body: e.target.value })}
                  />
                </Field>
              </div>
            </div>
            <div className="hgadm-row hgadm-row--wrap" style={{ gap: 22 }}>
              <label className="hgadm-checkbox">
                <input
                  type="checkbox"
                  checked={draft.pinned}
                  onChange={(e) => setDraft({ ...draft, pinned: e.target.checked })}
                />
                상단 고정
              </label>
              <label className="hgadm-checkbox">
                <input
                  type="checkbox"
                  checked={draft.published}
                  onChange={(e) => setDraft({ ...draft, published: e.target.checked })}
                />
                저장과 동시에 게시
              </label>
              <Field label="정렬 순서">
                <Input
                  type="number"
                  style={{ width: 90 }}
                  value={draft.display_order}
                  onChange={(e) => setDraft({ ...draft, display_order: e.target.value })}
                />
              </Field>
            </div>
          </div>
        )}
      </Modal>

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

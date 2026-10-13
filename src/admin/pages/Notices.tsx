import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pin } from "lucide-react";
import { adminApi } from "../api";
import type { AdminNotice, NoticeTranslation } from "../api";
import { errorMessage } from "../../lib/http";
import { useToast, useToastError } from "../../hooks/toast";
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
} from "../components/kit";
import {
  formatDateTime,
} from "../lib/format";
import type { Column } from "../components/kit";
import { MoveButtons, OrderNumber, useReorder } from "../components/ordering";

interface NoticeDraft {
  ko_title: string;
  ko_body: string;
  en_title: string;
  en_body: string;
  pinned: boolean;
  published: boolean;
}

const EMPTY: NoticeDraft = {
  ko_title: "",
  ko_body: "",
  en_title: "",
  en_body: "",
  pinned: false,
  published: false,
};

function pick(notice: AdminNotice, locale: string): NoticeTranslation | undefined {
  return notice.translations.find((t) => t.locale === locale);
}

/**
 * The languages the draft actually authors, trimmed.
 *
 * A language counts only when BOTH its title and body pass the API's 2-char
 * minimum: a half-filled language would be rejected by the server and fail
 * the whole save, so it is treated as not authored instead.
 */
function draftTranslations(d: NoticeDraft): NoticeTranslation[] {
  const pairs: [string, string, string][] = [
    ["ko", d.ko_title, d.ko_body],
    ["en", d.en_title, d.en_body],
  ];
  return pairs
    .map(([locale, title, body]) => ({ locale, title: title.trim(), body: body.trim() }))
    .filter((t) => t.title.length >= 2 && t.body.length >= 2);
}

export function NoticesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
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
    mutationFn: async (d: NoticeDraft) => {
      const translations = draftTranslations(d);
      // No order: a new notice goes to the end, and the order is changed
      // with ↑ / ↓ in the list.
      const body = {
        translations,
        pinned: d.pinned,
        published: d.published,
      };
      if (!editingId) return adminApi.createNotice(body);

      const saved = await adminApi.updateNotice(editingId, body);
      // PATCH only upserts, so a ko/en language the admin cleared has to be
      // removed explicitly — otherwise the old text stays live. Never the last
      // one: `translations` is non-empty to get here. Locales this editor has
      // no fields for are left alone.
      const kept = new Set(translations.map((t) => t.locale));
      const removed = saved.translations
        .map((t) => t.locale)
        .filter((locale) => (locale === "ko" || locale === "en") && !kept.has(locale));
      let latest = saved;
      for (const locale of removed) {
        latest = await adminApi.deleteNoticeTranslation(editingId, locale);
      }
      return latest;
    },
    onSuccess: () => {
      toast.success("공지를 저장했어요.");
      setDraft(null);
      setEditingId(null);
      refresh();
    },
    onError: toastError,
  });

  const togglePublish = useMutation({
    mutationFn: (notice: AdminNotice) =>
      adminApi.updateNotice(notice.notice_id, { published: !notice.published }),
    onSuccess: refresh,
    onError: toastError,
  });

  const remove = useMutation({
    mutationFn: (notice: AdminNotice) => adminApi.deleteNotice(notice.notice_id),
    onSuccess: () => {
      toast.success("공지를 삭제했어요.");
      setDeleting(null);
      refresh();
    },
    onError: toastError,
  });

  // The app lists pinned notices first, then the rest; each group keeps its
  // own order, so a notice moves within its group.
  const reorder = useReorder<AdminNotice>({
    queryKey: ["admin", "notices"],
    idOf: (n) => n.notice_id,
    save: (ids) => adminApi.reorderNotices(ids),
  });
  const groupIds = (pinned: boolean) =>
    (query.data?.items ?? []).filter((n) => n.pinned === pinned).map((n) => n.notice_id);
  const titleOf = (n: AdminNotice) => (pick(n, "ko") ?? n.translations[0])?.title ?? "공지";

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
                name={titleOf(n)}
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
      render: (n) => {
        const ko = pick(n, "ko") ?? n.translations[0];
        return (
          <div>
            <div className="hgadm-cell-main hgadm-row" style={{ gap: 6 }}>
              {n.pinned && (
                <Pin
                  size={14}
                  strokeWidth={2}
                  aria-label="고정됨"
                  style={{ color: "var(--hgadm-primary)", flexShrink: 0 }}
                />
              )}
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

  const draftValid = draft !== null && draftTranslations(draft).length > 0;

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>공지 관리</h1>
          <div className="hgadm-page-head__desc">
            앱 공지사항입니다. 한국어/영어 번역을 각각 작성할 수 있으며, 초안은
            사용자에게 노출되지 않습니다. 앱에는 상단 고정 공지가 먼저, 그다음 나머지가 아래 순서대로 보여요 —
            ↑ / ↓ 로 바꾸면 바로 저장돼요.
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
            </div>
            {!editingId && (
              <p className="hgadm-field__hint">새 공지는 목록의 맨 뒤에 놓여요. 순서는 목록에서 ↑ / ↓ 로 바꿔요.</p>
            )}
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

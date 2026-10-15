import { useState } from "react";
import { adminApi } from "../../api";
import type { AdminFaq } from "../../api";
import { errorMessage } from "../../../lib/http";
import { useAdminAuth } from "../../auth";
import { Badge, Button, ConfirmDialog, DataTable, ErrorState, LoadingState, Select, Switch } from "../../components/kit";
import type { Column } from "../../components/kit";
import { MoveButtons, OrderNumber, useReorder } from "../../components/ordering";
import { CATEGORIES, CATEGORY_LABEL, LANGUAGE_LABEL, draftFrom, emptyFaqDraft, registered, type FaqDraft } from "./draft";
import { FaqEditor } from "./FaqEditor";
import { FAQS_KEY, useFaqList, useFaqMutations } from "./useFaqs";

/** FAQ 관리: questions by category, in the order the app lists them. */
export function FaqsPage() {
  const { can } = useAdminAuth();
  const canWrite = can("ops:write");
  const [category, setCategory] = useState("");
  const [draft, setDraft] = useState<FaqDraft | null>(null);
  // The row being edited (null for a new FAQ), for working out which
  // languages were cleared.
  const [editing, setEditing] = useState<AdminFaq | null>(null);
  const [deleting, setDeleting] = useState<AdminFaq | null>(null);

  const query = useFaqList();
  const closeEditor = () => {
    setDraft(null);
    setEditing(null);
  };
  const { save, togglePublish, remove } = useFaqMutations({ onSaved: closeEditor, onDeleted: () => setDeleting(null) });

  const items = query.data?.items ?? [];
  const rows = items.filter((f) => !category || f.category === category);

  // FAQs are ordered within their category (the app lists one category at a
  // time); the list arrives grouped by category, in the app's order.
  const reorder = useReorder<AdminFaq>({
    queryKey: FAQS_KEY,
    idOf: (f) => f.faq_id,
    save: (ids) => {
      const of = items.find((f) => f.faq_id === ids[0])?.category ?? "";
      return adminApi.reorderFaqs(of, ids);
    },
  });
  const categoryIds = (cat: string) => items.filter((f) => f.category === cat).map((f) => f.faq_id);

  const columns: Column<AdminFaq>[] = [
    {
      key: "order",
      header: "앱 표시 순서",
      width: 120,
      render: (f) => {
        const scope = categoryIds(f.category);
        const index = scope.indexOf(f.faq_id);
        return (
          <div className="hgadm-row">
            <OrderNumber position={index + 1} />
            {canWrite && (
              <MoveButtons
                name={registered(f)[0]?.question ?? "FAQ"}
                index={index}
                count={scope.length}
                disabled={reorder.saving}
                onMove={(dir) => reorder.move(scope, f.faq_id, dir)}
              />
            )}
          </div>
        );
      },
    },
    {
      key: "category",
      header: "카테고리",
      width: 120,
      render: (f) => <Badge tone="info">{CATEGORY_LABEL[f.category] ?? f.category}</Badge>,
    },
    {
      key: "question",
      header: "질문",
      // One block per registered language. A language with no content simply
      // does not appear — no "미등록" placeholder to read past.
      render: (f) => (
        <div className="hgadm-faq-langs">
          {registered(f).map((t) => (
            <div key={t.locale} className="hgadm-faq-lang">
              <div className="hgadm-cell-main">
                <span className="hgadm-faq-lang__tag">{LANGUAGE_LABEL[t.locale] ?? t.locale}</span>
                {t.question}
              </div>
              <div className="hgadm-cell-sub hgadm-faq-lang__answer">{t.answer}</div>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: "published",
      header: "게시",
      render: (f) => (
        <Badge tone={f.published ? "success" : "neutral"} dot>
          {f.published ? "게시 중" : "초안"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (f) =>
        canWrite ? (
          <div className="hgadm-row" onClick={(e) => e.stopPropagation()}>
            <Switch checked={f.published} onChange={() => togglePublish.mutate(f)} label="게시 여부" />
            <Button
              size="sm"
              onClick={() => {
                setEditing(f);
                setDraft(draftFrom(f));
              }}
            >
              수정
            </Button>
            <Button size="sm" variant="danger-soft" onClick={() => setDeleting(f)}>
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
          <h1>FAQ 관리</h1>
          <div className="hgadm-page-head__desc">
            자주 묻는 질문을 카테고리별로 관리합니다. 초안은 앱에 노출되지 않습니다. 앱에는 카테고리마다 아래 순서대로 보여요 —
            ↑ / ↓ 로 바꾸면 바로 저장돼요.
          </div>
        </div>
        {canWrite && (
          <div className="hgadm-page-head__actions">
            <Button
              variant="primary"
              onClick={() => {
                setEditing(null);
                setDraft(emptyFaqDraft());
              }}
            >
              + FAQ 추가
            </Button>
          </div>
        )}
      </div>

      <div className="hgadm-card">
        <div className="hgadm-toolbar">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">카테고리: 전체</option>
            {CATEGORIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <span className="hgadm-muted hgadm-text-sm">{rows.length}개 표시 중</span>
        </div>
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          <DataTable columns={columns} rows={rows} rowKey={(f) => f.faq_id} empty="FAQ가 없습니다." />
        )}
      </div>

      <FaqEditor
        draft={draft}
        isNew={editing === null}
        saving={save.isPending}
        onChange={setDraft}
        onClose={closeEditor}
        onSave={(d) => save.mutate({ editing, draft: d })}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="FAQ 삭제"
        message="이 FAQ를 영구 삭제할까요?"
        danger
        confirmLabel="삭제"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

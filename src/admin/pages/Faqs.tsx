import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../api";
import type { AdminFaq } from "../api";
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
  Select,
  Switch,
  Textarea,
} from "../components/kit";
import type { Column } from "../components/kit";

const CATEGORIES = [
  ["getting_started", "시작하기"],
  ["learning_features", "학습 기능"],
  ["payments_subscriptions_refunds", "결제·구독·환불"],
  ["account_settings", "계정 설정"],
  ["errors_troubleshooting", "오류 해결"],
  ["other", "기타"],
] as const;

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES);

interface FaqDraft {
  category: string;
  question: string;
  answer: string;
  order: string;
  published: boolean;
}

const EMPTY: FaqDraft = {
  category: "getting_started",
  question: "",
  answer: "",
  order: "0",
  published: true,
};

export function FaqsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAdminAuth();
  const canWrite = can("ops:write");
  const [category, setCategory] = useState("");
  const [draft, setDraft] = useState<FaqDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminFaq | null>(null);

  const query = useQuery({ queryKey: ["admin", "faqs"], queryFn: adminApi.listFaqs });

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["admin", "faqs"] });
  }

  const save = useMutation({
    mutationFn: (d: FaqDraft) => {
      const body = {
        category: d.category,
        question: d.question,
        answer: d.answer,
        order: Number(d.order),
        published: d.published,
      };
      return editingId ? adminApi.updateFaq(editingId, body) : adminApi.createFaq(body);
    },
    onSuccess: () => {
      toast.success("FAQ를 저장했어요.");
      setDraft(null);
      setEditingId(null);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const togglePublish = useMutation({
    mutationFn: (faq: AdminFaq) =>
      adminApi.updateFaq(faq.faq_id, { published: !faq.published }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (faq: AdminFaq) => adminApi.deleteFaq(faq.faq_id),
    onSuccess: () => {
      toast.success("FAQ를 삭제했어요.");
      setDeleting(null);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const rows = (query.data?.items ?? []).filter(
    (f) => !category || f.category === category,
  );

  const columns: Column<AdminFaq>[] = [
    {
      key: "category",
      header: "카테고리",
      width: 120,
      render: (f) => <Badge tone="info">{CATEGORY_LABEL[f.category] ?? f.category}</Badge>,
    },
    {
      key: "question",
      header: "질문",
      render: (f) => (
        <div>
          <div className="ad-cell-main">{f.question}</div>
          <div className="ad-cell-sub" style={{ maxWidth: 480, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {f.answer}
          </div>
        </div>
      ),
    },
    { key: "order", header: "순서", numeric: true, render: (f) => f.order },
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
          <div className="ad-row" onClick={(e) => e.stopPropagation()}>
            <Switch
              checked={f.published}
              onChange={() => togglePublish.mutate(f)}
              label="게시 여부"
            />
            <Button
              size="sm"
              onClick={() => {
                setEditingId(f.faq_id);
                setDraft({
                  category: f.category,
                  question: f.question,
                  answer: f.answer,
                  order: String(f.order),
                  published: f.published,
                });
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
      <div className="ad-page-head">
        <div>
          <h1>FAQ 관리</h1>
          <div className="ad-page-head__desc">
            자주 묻는 질문을 카테고리별로 관리합니다. 초안은 앱에 노출되지 않습니다.
          </div>
        </div>
        {canWrite && (
          <div className="ad-page-head__actions">
            <Button
              variant="primary"
              onClick={() => {
                setEditingId(null);
                setDraft({ ...EMPTY });
              }}
            >
              + FAQ 추가
            </Button>
          </div>
        )}
      </div>

      <div className="ad-card">
        <div className="ad-toolbar">
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{ width: 170 }}
          >
            <option value="">카테고리: 전체</option>
            {CATEGORIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <span className="ad-muted" style={{ fontSize: 13 }}>
            {rows.length}개 표시 중
          </span>
        </div>
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(f) => f.faq_id}
            empty="FAQ가 없습니다."
          />
        )}
      </div>

      <Modal
        open={draft !== null}
        title={editingId ? "FAQ 수정" : "FAQ 추가"}
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
              disabled={
                !draft || draft.question.trim().length < 2 || draft.answer.trim().length < 2
              }
              onClick={() => draft && save.mutate(draft)}
            >
              저장
            </Button>
          </>
        }
      >
        {draft && (
          <div>
            <div className="ad-form-grid">
              <Field label="카테고리" required>
                <Select
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                >
                  {CATEGORIES.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="정렬 순서">
                <Input
                  type="number"
                  value={draft.order}
                  onChange={(e) => setDraft({ ...draft, order: e.target.value })}
                />
              </Field>
            </div>
            <Field label="질문" required hint="2~300자">
              <Input
                value={draft.question}
                maxLength={300}
                onChange={(e) => setDraft({ ...draft, question: e.target.value })}
              />
            </Field>
            <Field label="답변" required>
              <Textarea
                rows={6}
                value={draft.answer}
                onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
              />
            </Field>
            <label className="ad-checkbox">
              <input
                type="checkbox"
                checked={draft.published}
                onChange={(e) => setDraft({ ...draft, published: e.target.checked })}
              />
              저장과 동시에 게시
            </label>
          </div>
        )}
      </Modal>

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

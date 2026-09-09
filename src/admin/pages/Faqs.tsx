import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../api";
import type { AdminFaq, FaqTranslation } from "../api";
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

/** The languages a FAQ can be authored in, in the order the form shows them. */
const LOCALES = [
  ["ko", "한국어"],
  ["en", "영어"],
] as const;

type Locale = (typeof LOCALES)[number][0];

interface FaqText {
  question: string;
  answer: string;
}

interface FaqDraft {
  category: string;
  order: string;
  published: boolean;
  /** One entry per language; a language left blank is simply not submitted. */
  text: Record<Locale, FaqText>;
}

const EMPTY: FaqDraft = {
  category: "getting_started",
  order: "0",
  published: true,
  text: { ko: { question: "", answer: "" }, en: { question: "", answer: "" } },
};

/** A language counts as authored only when BOTH fields pass the API's 2-char
 *  minimum — a half-filled language would be rejected by the server. */
function isComplete(text: FaqText): boolean {
  return text.question.trim().length >= 2 && text.answer.trim().length >= 2;
}

function completedLocales(draft: FaqDraft): Locale[] {
  return LOCALES.map(([code]) => code).filter((code) => isComplete(draft.text[code]));
}

function draftFrom(faq: AdminFaq): FaqDraft {
  const byLocale = new Map(faq.translations.map((t) => [t.locale, t]));
  return {
    category: faq.category,
    order: String(faq.order),
    published: faq.published,
    text: {
      ko: {
        question: byLocale.get("ko")?.question ?? "",
        answer: byLocale.get("ko")?.answer ?? "",
      },
      en: {
        question: byLocale.get("en")?.question ?? "",
        answer: byLocale.get("en")?.answer ?? "",
      },
    },
  };
}

/** The row's headline text — Korean if authored, else whatever exists. */
function preview(faq: AdminFaq): FaqTranslation | undefined {
  return faq.translations.find((t) => t.locale === "ko") ?? faq.translations[0];
}

export function FaqsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAdminAuth();
  const canWrite = can("ops:write");
  const [category, setCategory] = useState("");
  const [draft, setDraft] = useState<FaqDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  // The row being edited, for working out which languages were cleared.
  const [editing, setEditing] = useState<AdminFaq | null>(null);
  const [deleting, setDeleting] = useState<AdminFaq | null>(null);

  const query = useQuery({ queryKey: ["admin", "faqs"], queryFn: adminApi.listFaqs });

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["admin", "faqs"] });
  }

  const save = useMutation({
    mutationFn: async (d: FaqDraft) => {
      const filled = completedLocales(d);
      const translations: FaqTranslation[] = filled.map((locale) => ({
        locale,
        question: d.text[locale].question.trim(),
        answer: d.text[locale].answer.trim(),
      }));
      const body = {
        category: d.category,
        translations,
        order: Number(d.order),
        published: d.published,
      };
      if (!editingId) return adminApi.createFaq(body);

      const saved = await adminApi.updateFaq(editingId, body);
      // PATCH only upserts, so a language the admin cleared has to be removed
      // explicitly. Never the last one — `filled` is non-empty to get here.
      const removed = (editing?.translations ?? [])
        .map((t) => t.locale)
        .filter((locale) => !filled.some((code) => code === locale));
      let latest = saved;
      for (const locale of removed) {
        latest = await adminApi.deleteFaqTranslation(editingId, locale);
      }
      return latest;
    },
    onSuccess: () => {
      toast.success("FAQ를 저장했어요.");
      setDraft(null);
      setEditingId(null);
      setEditing(null);
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
      render: (f) => {
        const shown = preview(f);
        return (
          <div>
            <div className="hgadm-cell-main">{shown?.question ?? "—"}</div>
            <div className="hgadm-cell-sub" style={{ maxWidth: 480, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {shown?.answer ?? ""}
            </div>
          </div>
        );
      },
    },
    {
      key: "languages",
      header: "언어",
      width: 130,
      // Which languages are authored. A missing one is worth flagging: readers
      // in that language fall back to the other one.
      render: (f) => (
        <div className="hgadm-row" style={{ gap: 4 }}>
          {LOCALES.map(([code, label]) =>
            f.translations.some((t) => t.locale === code) ? (
              <Badge key={code} tone="success">{label}</Badge>
            ) : (
              <Badge key={code} tone="neutral">{label} 없음</Badge>
            ),
          )}
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
          <div className="hgadm-row" onClick={(e) => e.stopPropagation()}>
            <Switch
              checked={f.published}
              onChange={() => togglePublish.mutate(f)}
              label="게시 여부"
            />
            <Button
              size="sm"
              onClick={() => {
                setEditingId(f.faq_id);
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
            자주 묻는 질문을 카테고리별로 관리합니다. 초안은 앱에 노출되지 않습니다.
          </div>
        </div>
        {canWrite && (
          <div className="hgadm-page-head__actions">
            <Button
              variant="primary"
              onClick={() => {
                setEditingId(null);
                setEditing(null);
                setDraft({ ...EMPTY, text: { ko: { question: "", answer: "" }, en: { question: "", answer: "" } } });
              }}
            >
              + FAQ 추가
            </Button>
          </div>
        )}
      </div>

      <div className="hgadm-card">
        <div className="hgadm-toolbar">
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
          <span className="hgadm-muted" style={{ fontSize: 13 }}>
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
        onClose={() => { setDraft(null); setEditing(null); }}
        footer={
          <>
            <Button variant="ghost" onClick={() => { setDraft(null); setEditing(null); }}>
              취소
            </Button>
            <Button
              variant="primary"
              loading={save.isPending}
              // At least one language must be fully filled in — the API rejects
              // a FAQ with no translations, and a half-filled language.
              disabled={!draft || completedLocales(draft).length === 0}
              onClick={() => draft && save.mutate(draft)}
            >
              저장
            </Button>
          </>
        }
      >
        {draft && (
          <div>
            <div className="hgadm-form-grid">
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
            {LOCALES.map(([code, label]) => (
              <div key={code} className="hgadm-form-section">
                <div className="hgadm-form-section__title">
                  {label}
                  {isComplete(draft.text[code]) ? (
                    <Badge tone="success">등록</Badge>
                  ) : (
                    <Badge tone="neutral">미등록</Badge>
                  )}
                </div>
                <Field label={`질문 (${label})`} hint="2~300자">
                  <Input
                    value={draft.text[code].question}
                    maxLength={300}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        text: {
                          ...draft.text,
                          [code]: { ...draft.text[code], question: e.target.value },
                        },
                      })
                    }
                  />
                </Field>
                <Field label={`답변 (${label})`}>
                  <Textarea
                    rows={5}
                    value={draft.text[code].answer}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        text: {
                          ...draft.text,
                          [code]: { ...draft.text[code], answer: e.target.value },
                        },
                      })
                    }
                  />
                </Field>
              </div>
            ))}
            <p className="hgadm-muted" style={{ fontSize: 12.5, marginTop: 0 }}>
              한 언어만 입력해도 저장됩니다. 비워 둔 언어의 사용자에게는 입력된 언어가
              대신 보여집니다.
            </p>
            <label className="hgadm-checkbox">
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

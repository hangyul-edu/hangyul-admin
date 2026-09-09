import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../api";
import type { AdminFaq, FaqTranslation } from "../api";
import { errorMessage } from "../../lib/http";
import { useToast } from "../../hooks/toast";
import { useAdminAuth } from "../auth";
import { SUPPORTED_LANGUAGES } from "../../lib/language";
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

/**
 * Languages a FAQ can be authored in.
 *
 * Taken from the app's supported-language list rather than a FAQ-specific
 * ko/en pair, so adding a language is one entry in `SUPPORTED_LANGUAGES` (plus
 * the matching `AppLanguage` value on the backend) — no schema change, no
 * migration, and no edit here. `AUTHORING_PRIORITY` only decides the order the
 * editor shows: the languages we author first today lead, and anything new
 * appears after them automatically.
 */
const AUTHORING_PRIORITY: string[] = ["ko", "en"];

const AUTHORING_LANGUAGES = [...SUPPORTED_LANGUAGES].sort((a, b) => {
  const rank = (code: string) => {
    const i = AUTHORING_PRIORITY.indexOf(code);
    return i === -1 ? AUTHORING_PRIORITY.length : i;
  };
  return rank(a.code) - rank(b.code);
});

const LANGUAGE_LABEL: Record<string, string> = Object.fromEntries(
  SUPPORTED_LANGUAGES.map((l) => [l.code, l.nativeLabel]),
);

interface FaqText {
  question: string;
  answer: string;
}

interface FaqDraft {
  category: string;
  order: string;
  published: boolean;
  /** Keyed by locale, one entry per authoring language. A language left blank
   *  is simply not submitted, so no FAQ is forced to carry every language. */
  text: Record<string, FaqText>;
}

function emptyText(): Record<string, FaqText> {
  return Object.fromEntries(
    AUTHORING_LANGUAGES.map((l) => [l.code, { question: "", answer: "" }]),
  );
}

const EMPTY: FaqDraft = {
  category: "getting_started",
  order: "0",
  published: true,
  text: emptyText(),
};

/** A language counts as authored only when BOTH fields pass the API's 2-char
 *  minimum — a half-filled language would be rejected by the server. */
function isComplete(text: FaqText | undefined): boolean {
  return (
    !!text && text.question.trim().length >= 2 && text.answer.trim().length >= 2
  );
}

/**
 * Every locale the draft carries: the editor's languages first, then any other
 * locale the FAQ already had.
 *
 * The trailing group matters. A FAQ may hold a translation in a language this
 * build has no fields for — added by a newer client, or by a language rolled
 * out backend-first. Those have to round-trip untouched, otherwise saving an
 * unrelated edit would quietly delete them.
 */
function draftLocales(draft: FaqDraft): string[] {
  const known: string[] = AUTHORING_LANGUAGES.map((l) => l.code);
  const extra = Object.keys(draft.text)
    .filter((code) => !known.includes(code))
    .sort();
  return [...known, ...extra];
}

function completedLocales(draft: FaqDraft): string[] {
  return draftLocales(draft).filter((code) => isComplete(draft.text[code]));
}

function draftFrom(faq: AdminFaq): FaqDraft {
  const byLocale = new Map(faq.translations.map((t) => [t.locale, t]));
  const text = emptyText();
  for (const [locale, t] of byLocale) {
    // Keep a locale the editor has no field for rather than dropping it, so
    // editing a FAQ never silently discards a translation.
    text[locale] = { question: t.question, answer: t.answer };
  }
  return {
    category: faq.category,
    order: String(faq.order),
    published: faq.published,
    text,
  };
}

/** Registered translations in the editor's language order. Languages with no
 *  content are absent entirely — there is nothing to say about them. */
function registered(faq: AdminFaq): FaqTranslation[] {
  const order: string[] = AUTHORING_LANGUAGES.map((l) => l.code);
  return [...faq.translations].sort((a, b) => {
    const rank = (code: string) => {
      const i = order.indexOf(code);
      return i === -1 ? order.length : i;
    };
    return rank(a.locale) - rank(b.locale);
  });
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
      // One block per registered language. A language with no content simply
      // does not appear — no "미등록" placeholder to read past.
      render: (f) => (
        <div className="hgadm-faq-langs">
          {registered(f).map((t) => (
            <div key={t.locale} className="hgadm-faq-lang">
              <div className="hgadm-cell-main">
                <span className="hgadm-faq-lang__tag">
                  {LANGUAGE_LABEL[t.locale] ?? t.locale}
                </span>
                {t.question}
              </div>
              <div className="hgadm-cell-sub hgadm-faq-lang__answer">{t.answer}</div>
            </div>
          ))}
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
                setDraft({ ...EMPTY, text: emptyText() });
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
            {AUTHORING_LANGUAGES.map(({ code, nativeLabel }) => (
              <div key={code} className="hgadm-form-section">
                <div className="hgadm-form-section__title">{nativeLabel}</div>
                <Field label={`질문 (${nativeLabel})`} hint="2~300자">
                  <Input
                    value={draft.text[code]?.question ?? ""}
                    maxLength={300}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        text: {
                          ...draft.text,
                          [code]: {
                            question: e.target.value,
                            answer: draft.text[code]?.answer ?? "",
                          },
                        },
                      })
                    }
                  />
                </Field>
                <Field label={`답변 (${nativeLabel})`}>
                  <Textarea
                    rows={5}
                    value={draft.text[code]?.answer ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        text: {
                          ...draft.text,
                          [code]: {
                            question: draft.text[code]?.question ?? "",
                            answer: e.target.value,
                          },
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

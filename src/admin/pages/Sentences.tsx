import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useUrlFilters } from "../lib/urlFilters";
import { adminApi } from "../api";
import type { AdminSentence } from "../api";
import { errorMessage } from "../../lib/http";
import { CONVERSATION_LEVELS } from "../../lib/levels";
import { useToast, useToastError } from "../../hooks/toast";
import { useAdminAuth } from "../auth";
import { BulkImportButton } from "../components/BulkImportButton";
import type { FieldDoc } from "../components/BulkImportButton";
import { ContentCleanupButton } from "../components/ContentCleanupButton";
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
  Pagination,
  SearchBox,
  Select,
  Textarea,
} from "../components/kit";
import type { Column } from "../components/kit";
import { SENTENCE_TOPICS_KEY, useTopicNames } from "../lib/topicNames";

interface SentenceDraft {
  korean: string;
  translation: string;
  romanization: string;
  topic: string;
  level: string;
  grammar_points: string;
  /** Editing a sentence with blanks: its blanks are character offsets into
   *  the Korean text, which the server does not re-anchor when the text
   *  changes, so the text is shown but not editable here. */
  blanked?: boolean;
}

const BATCH_TEMPLATE = JSON.stringify(
  [
    {
      korean: "오늘 날씨가 정말 좋아요.",
      translation: "The weather is really nice today.",
      romanization: "oneul nalssiga jeongmal joayo",
      topic: "daily",
      level: 1,
      grammar_points: ["-아요/어요"],
    },
    {
      korean: "주말에 친구를 만나요.",
      translation: "I meet a friend on the weekend.",
      topic: "daily",
      level: 1,
      grammar_points: ["-아요/어요"],
    },
  ],
  null,
  2,
);

/** The upload format, for the import dialog's field reference. */
const SENTENCE_FIELDS: FieldDoc[] = [
  { name: "korean", need: "필수", meaning: "학습할 한국어 문장 (최대 500자)", example: "오늘 날씨가 좋아요." },
  { name: "translation", need: "필수", meaning: "문장의 뜻", example: "The weather is nice today." },
  { name: "level", need: "선택", meaning: "회화 레벨 1–10, 없으면 1", example: "2" },
  { name: "topic", need: "선택", meaning: "주제 (영문 소문자 권장)", example: "daily" },
  { name: "romanization", need: "선택", meaning: "로마자 발음 표기", example: "oneul nalssiga joayo" },
  { name: "grammar_points", need: "선택", meaning: "이 문장에서 배우는 문법 목록", example: '["-아요/어요"]' },
  { name: "display_text", need: "선택", meaning: "빈칸을 표시해 학습자에게 보여 줄 문장", example: "오늘 ___가 좋아요." },
  { name: "blanks_json", need: "선택", meaning: "빈칸 위치: start(몇 번째 글자부터), length(몇 글자), answer(정답)", example: '[{"start":3,"length":2,"answer":"날씨"}]' },
  { name: "translation_language", need: "선택", meaning: "번역 언어, 없으면 en", example: "en" },
];

const EMPTY: SentenceDraft = {
  korean: "",
  translation: "",
  romanization: "",
  topic: "",
  level: "1",
  grammar_points: "",
};

export function SentencesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const { can } = useAdminAuth();
  const canWrite = can("content:write");
  const filters = useUrlFilters();
  const [draft, setDraft] = useState<SentenceDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminSentence | null>(null);

  const q = filters.value("q");
  const level = filters.value("level");
  const topic = filters.value("topic");
  const aiOnly = filters.value("is_ai_generated");
  const page = filters.number("page", 1);

  // A curriculum topic reads as its Korean name; the code stays in the tooltip.
  const { topics, topicName, isNamed } = useTopicNames();

  const query = useQuery({
    queryKey: ["admin", "sentences", { q, level, topic, aiOnly, page }],
    queryFn: () =>
      adminApi.listSentences({
        q: q || undefined,
        level: level || undefined,
        topic: topic || undefined,
        is_ai_generated: aiOnly === "" ? undefined : aiOnly === "true",
        page,
        page_size: 25,
      }),
  });

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["admin", "sentences"] });
    void qc.invalidateQueries({ queryKey: SENTENCE_TOPICS_KEY });
  }

  const save = useMutation({
    mutationFn: (d: SentenceDraft) => {
      const body = {
        korean: d.korean,
        translation: d.translation,
        romanization: d.romanization || null,
        topic: d.topic || null,
        level: Number(d.level),
        grammar_points: d.grammar_points
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };
      if (!editingId) return adminApi.createSentence(body);
      // The Korean text of a blanked sentence is not editable here; leave it
      // out rather than re-sending it.
      return adminApi.updateSentence(
        editingId,
        d.blanked ? { ...body, korean: undefined } : body,
      );
    },
    onSuccess: () => {
      toast.success("문장을 저장했어요.");
      setDraft(null);
      setEditingId(null);
      refresh();
    },
    onError: toastError,
  });

  const remove = useMutation({
    mutationFn: (s: AdminSentence) => adminApi.deleteSentence(s.sentence_id),
    onSuccess: () => {
      toast.success("문장을 삭제했어요.");
      setDeleting(null);
      refresh();
    },
    onError: toastError,
  });

  const columns: Column<AdminSentence>[] = [
    {
      key: "korean",
      header: "문장",
      render: (s) => (
        <div>
          <div className="hgadm-cell-main">{s.korean}</div>
          <div className="hgadm-cell-sub">{s.translation}</div>
        </div>
      ),
    },
    { key: "level", header: "레벨", numeric: true, render: (s) => s.level },
    {
      key: "topic",
      header: "주제",
      render: (s) =>
        s.topic ? (
          <span title={s.topic}>
            <Badge tone="info">{topicName(s.topic)}</Badge>
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "source",
      header: "출처",
      render: (s) => (
        <Badge tone={s.is_ai_generated ? "warning" : "neutral"}>
          {s.is_ai_generated ? "AI 생성" : "수동 등록"}
        </Badge>
      ),
    },
    {
      key: "audio",
      header: "오디오",
      render: (s) => (s.has_audio ? "TTS" : "—"),
    },
    {
      key: "actions",
      header: "",
      render: (s) =>
        canWrite ? (
          <div className="hgadm-row" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              onClick={() => {
                setEditingId(s.sentence_id);
                setDraft({
                  korean: s.korean,
                  translation: s.translation,
                  romanization: s.romanization ?? "",
                  topic: s.topic ?? "",
                  level: String(s.level),
                  grammar_points: s.grammar_points.join(", "),
                  blanked: Boolean(s.blanks_json?.length || s.display_text),
                });
              }}
            >
              수정
            </Button>
            <Button size="sm" variant="danger-soft" onClick={() => setDeleting(s)}>
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
          <h1>문장 관리</h1>
          <div className="hgadm-page-head__desc">
            학습 문장 목록입니다. 오디오는 TTS가 자동 생성하므로 별도 업로드가
            필요 없습니다. 삭제 시 사용자의 저장 기록도 함께 삭제되고, 학습 이력은 남지만
            이 문장과의 연결이 끊어집니다.
          </div>
        </div>
        {canWrite && (
          <div className="hgadm-page-head__actions">
            {can("admins:manage") && (
              <ContentCleanupButton
                label="문장 전체 삭제"
                preview={adminApi.previewSentenceCleanup}
                clear={adminApi.clearSentences}
                countLabels={[
                  ["sentences_archived", "문장"],
                  ["generated_sentences", "AI 생성 문장"],
                ]}
                preservedLabels={[
                  ["sentence_histories_preserved", "학습 이력"],
                  ["speech_attempts_preserved", "발음 시도"],
                  ["saved_sentences_preserved", "저장된 문장"],
                ]}
                invalidateKeys={[["admin", "sentences"], [...SENTENCE_TOPICS_KEY]]}
              />
            )}
            <BulkImportButton
              noun="문장"
              title="문장 일괄 추가"
              fields={SENTENCE_FIELDS}
              template={BATCH_TEMPLATE}
              templateFilename="문장-예시.json"
              check={adminApi.checkSentencesBatch}
              submit={adminApi.createSentencesBatch}
              invalidateKeys={[["admin", "sentences"], [...SENTENCE_TOPICS_KEY]]}
            />
            <Button
              variant="primary"
              onClick={() => {
                setEditingId(null);
                setDraft({ ...EMPTY });
              }}
            >
              + 문장 추가
            </Button>
          </div>
        )}
      </div>

      <div className="hgadm-card">
        <div className="hgadm-toolbar">
          <SearchBox
            value={q}
            placeholder="한국어·번역 검색"
            onSearch={(next) => filters.patch({ q: next, page: null })}
          />
          <Select
            value={topic}
            onChange={(e) => filters.patch({ topic: e.target.value, page: null })}
          >
            <option value="">주제: 전체</option>
            {topics.map((t) => (
              <option key={t} value={t}>
                {topicName(t)}
              </option>
            ))}
          </Select>
          <Select
            value={level}
            onChange={(e) => filters.patch({ level: e.target.value, page: null })}
          >
            <option value="">레벨: 전체</option>
            {CONVERSATION_LEVELS.map((l) => (
              <option key={l} value={l}>
                레벨 {l}
              </option>
            ))}
          </Select>
          <Select
            value={aiOnly}
            onChange={(e) => filters.patch({ is_ai_generated: e.target.value, page: null })}
          >
            <option value="">출처: 전체</option>
            <option value="true">AI 생성</option>
            <option value="false">수동 등록</option>
          </Select>
        </div>
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={query.data.items}
              rowKey={(s) => s.sentence_id}
              empty="조건에 맞는 문장이 없습니다."
            />
            <Pagination
              page={query.data.page}
              pageSize={query.data.page_size}
              total={query.data.total}
              onPageChange={(next) => filters.patch({ page: String(next) })}
            />
          </>
        )}
      </div>

      <Modal
        open={draft !== null}
        title={editingId ? "문장 수정" : "문장 추가"}
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
              disabled={!draft?.korean.trim() || !draft?.translation.trim()}
              onClick={() => draft && save.mutate(draft)}
            >
              저장
            </Button>
          </>
        }
      >
        {draft && (
          <div>
            <Field
              label="한국어 문장"
              required
              hint={
                draft.blanked
                  ? "빈칸이 있는 문장은 원문을 바꾸면 빈칸 위치가 어긋나므로 여기서 수정할 수 없습니다."
                  : undefined
              }
            >
              <Textarea
                rows={2}
                value={draft.korean}
                readOnly={draft.blanked}
                onChange={(e) => setDraft({ ...draft, korean: e.target.value })}
              />
            </Field>
            <Field label="번역 (영어)" required>
              <Textarea
                rows={2}
                value={draft.translation}
                onChange={(e) => setDraft({ ...draft, translation: e.target.value })}
              />
            </Field>
            <Field label="로마자 표기">
              <Input
                value={draft.romanization}
                onChange={(e) => setDraft({ ...draft, romanization: e.target.value })}
              />
            </Field>
            <div className="hgadm-form-grid">
              <Field
                label="주제"
                hint={
                  draft.topic.trim()
                    ? isNamed(draft.topic.trim())
                      ? topicName(draft.topic.trim())
                      : "새 주제 — 커리큘럼에 이름이 없어 코드로 표시돼요"
                    : "영문 코드 (예: cafe, travel)"
                }
              >
                <Input
                  value={draft.topic}
                  maxLength={80}
                  onChange={(e) => setDraft({ ...draft, topic: e.target.value })}
                  placeholder="cafe, travel …"
                />
              </Field>
              <Field label="레벨" required>
                <Select
                  value={draft.level}
                  onChange={(e) => setDraft({ ...draft, level: e.target.value })}
                >
                  {CONVERSATION_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      레벨 {l}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="문법 포인트" hint="쉼표로 구분">
              <Input
                value={draft.grammar_points}
                onChange={(e) => setDraft({ ...draft, grammar_points: e.target.value })}
                placeholder="-습니다, -고 싶다"
              />
            </Field>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="문장 삭제"
        message={`'${deleting?.korean ?? ""}' 문장을 영구 삭제할까요? 사용자가 저장한 문장 기록은 삭제되고, 학습 이력·발음 시도는 남지만 이 문장과의 연결이 끊어집니다.`}
        danger
        confirmLabel="삭제"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

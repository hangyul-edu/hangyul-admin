import { useState } from "react";
import { adminApi } from "../../api";
import type { AdminSentence } from "../../api";
import { errorMessage } from "../../../lib/http";
import { CONVERSATION_LEVELS } from "../../../lib/levels";
import { useAdminAuth } from "../../auth";
import { BulkImportButton } from "../../components/BulkImportButton";
import { ContentCleanupButton } from "../../components/ContentCleanupButton";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  ErrorState,
  LoadingState,
  Pagination,
  SearchBox,
  Select,
} from "../../components/kit";
import type { Column } from "../../components/kit";
import { useTopicNames } from "../../lib/topicNames";
import { useUrlFilters } from "../../lib/urlFilters";
import { BATCH_TEMPLATE, SENTENCE_FIELDS, draftFromSentence, emptySentenceDraft, type SentenceDraft } from "./draft";
import { SentenceEditor } from "./SentenceEditor";
import { SENTENCE_KEYS, useSentenceList, useSentenceMutations } from "./useSentences";

/** 문장 관리: the conversation sentences — browse, add, bulk-import, edit, delete. */
export function SentencesPage() {
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
  // A curriculum topic reads as its Korean name; the code stays in the tooltip.
  const { topics, topicName } = useTopicNames();
  const query = useSentenceList({ q, level, topic, aiOnly, page: filters.number("page", 1) });
  const { save, remove } = useSentenceMutations({
    onSaved: () => {
      setDraft(null);
      setEditingId(null);
    },
    onDeleted: () => setDeleting(null),
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
        <Badge tone={s.is_ai_generated ? "warning" : "neutral"}>{s.is_ai_generated ? "AI 생성" : "수동 등록"}</Badge>
      ),
    },
    { key: "audio", header: "오디오", render: (s) => (s.has_audio ? "TTS" : "—") },
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
                setDraft(draftFromSentence(s));
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
            학습 문장 목록입니다. 오디오는 TTS가 자동 생성하므로 별도 업로드가 필요 없습니다. 삭제 시 사용자의 저장 기록도 함께
            삭제되고, 학습 이력은 남지만 이 문장과의 연결이 끊어집니다.
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
                invalidateKeys={SENTENCE_KEYS}
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
              invalidateKeys={SENTENCE_KEYS}
            />
            <Button
              variant="primary"
              onClick={() => {
                setEditingId(null);
                setDraft(emptySentenceDraft());
              }}
            >
              + 문장 추가
            </Button>
          </div>
        )}
      </div>

      <div className="hgadm-card">
        <div className="hgadm-toolbar">
          <SearchBox value={q} placeholder="한국어·번역 검색" onSearch={(next) => filters.patch({ q: next, page: null })} />
          <Select value={topic} onChange={(e) => filters.patch({ topic: e.target.value, page: null })}>
            <option value="">주제: 전체</option>
            {topics.map((t) => (
              <option key={t} value={t}>
                {topicName(t)}
              </option>
            ))}
          </Select>
          <Select value={level} onChange={(e) => filters.patch({ level: e.target.value, page: null })}>
            <option value="">레벨: 전체</option>
            {CONVERSATION_LEVELS.map((l) => (
              <option key={l} value={l}>
                레벨 {l}
              </option>
            ))}
          </Select>
          <Select value={aiOnly} onChange={(e) => filters.patch({ is_ai_generated: e.target.value, page: null })}>
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
            <DataTable columns={columns} rows={query.data.items} rowKey={(s) => s.sentence_id} empty="조건에 맞는 문장이 없습니다." />
            <Pagination
              page={query.data.page}
              pageSize={query.data.page_size}
              total={query.data.total}
              onPageChange={(next) => filters.patch({ page: String(next) })}
            />
          </>
        )}
      </div>

      <SentenceEditor
        draft={draft}
        setDraft={setDraft}
        editing={editingId !== null}
        saving={save.isPending}
        onSave={(d) => save.mutate({ id: editingId, draft: d })}
      />

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

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { adminApi } from "../api";
import type { AdminSentence } from "../api";
import { errorMessage } from "../../lib/http";
import { CONVERSATION_LEVELS } from "../../lib/levels";
import { useToast } from "../../hooks/toast";
import { useAdminAuth } from "../auth";
import { BatchAddButton } from "../components/BatchAddButton";
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

interface SentenceDraft {
  korean: string;
  translation: string;
  romanization: string;
  topic: string;
  level: string;
  grammar_points: string;
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
  const { can } = useAdminAuth();
  const canWrite = can("content:write");
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState<SentenceDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminSentence | null>(null);

  const q = params.get("q") ?? "";
  const level = params.get("level") ?? "";
  const topic = params.get("topic") ?? "";
  const aiOnly = params.get("is_ai_generated") ?? "";
  const page = Number(params.get("page") ?? "1");

  function patchParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  }

  const topics = useQuery({
    queryKey: ["admin", "sentence-topics"],
    queryFn: adminApi.sentenceTopics,
  });

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
    void qc.invalidateQueries({ queryKey: ["admin", "sentence-topics"] });
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
      return editingId
        ? adminApi.updateSentence(editingId, body)
        : adminApi.createSentence(body);
    },
    onSuccess: () => {
      toast.success("문장을 저장했어요.");
      setDraft(null);
      setEditingId(null);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (s: AdminSentence) => adminApi.deleteSentence(s.sentence_id),
    onSuccess: () => {
      toast.success("문장을 삭제했어요.");
      setDeleting(null);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e)),
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
      render: (s) => (s.topic ? <Badge tone="info">{s.topic}</Badge> : "—"),
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
            필요 없습니다. 삭제 시 사용자 학습 이력도 함께 삭제됩니다.
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
                  ["sentences", "문장"],
                  ["sentence_histories", "학습 이력"],
                  ["saved_sentences", "저장된 문장"],
                  ["speech_attempts", "발음 시도"],
                  ["generated_sentences", "AI 생성 문장"],
                ]}
                invalidateKeys={[["admin", "sentences"], ["admin", "sentence-topics"]]}
              />
            )}
            <BatchAddButton
              title="문장 일괄 추가"
              hint="단건 등록과 같은 필드(korean·translation 필수)를 담은 JSON 배열을 붙여넣으세요."
              template={BATCH_TEMPLATE}
              submit={adminApi.createSentencesBatch}
              invalidateKeys={[["admin", "sentences"], ["admin", "sentence-topics"]]}
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
            onSearch={(next) => patchParams({ q: next, page: null })}
          />
          <Select
            value={level}
            onChange={(e) => patchParams({ level: e.target.value, page: null })}
            style={{ width: 120 }}
          >
            <option value="">레벨: 전체</option>
            {CONVERSATION_LEVELS.map((l) => (
              <option key={l} value={l}>
                레벨 {l}
              </option>
            ))}
          </Select>
          <Select
            value={topic}
            onChange={(e) => patchParams({ topic: e.target.value, page: null })}
            style={{ minWidth: 150 }}
          >
            <option value="">주제: 전체</option>
            {topics.data?.topics.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
          <Select
            value={aiOnly}
            onChange={(e) => patchParams({ is_ai_generated: e.target.value, page: null })}
            style={{ width: 140 }}
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
              onPageChange={(next) => patchParams({ page: String(next) })}
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
            <Field label="한국어 문장" required>
              <Textarea
                rows={2}
                value={draft.korean}
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
              <Field label="주제">
                <Input
                  value={draft.topic}
                  maxLength={80}
                  onChange={(e) => setDraft({ ...draft, topic: e.target.value })}
                  placeholder="daily, food, travel …"
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
        message={`'${deleting?.korean ?? ""}' 문장을 영구 삭제할까요? 이 문장에 대한 사용자 학습 이력·저장 기록도 함께 삭제됩니다.`}
        danger
        confirmLabel="삭제"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

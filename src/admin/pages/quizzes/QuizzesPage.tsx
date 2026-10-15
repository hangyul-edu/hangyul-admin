import { useState } from "react";
import { adminApi } from "../../api";
import type { AdminQuiz } from "../../api";
import { errorMessage } from "../../../lib/http";
import { TOPIK_GRADES } from "../../../lib/levels";
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
import { TOPIK_SECTIONS, topikSectionLabel, topikTypeLabel } from "../../lib/topik";
import { useUrlFilters } from "../../lib/urlFilters";
import { BATCH_TEMPLATE, QUIZ_FIELDS } from "./batchFormat";
import { draftFromQuiz, emptyDraft, FORMAT_LABEL, FORMATS, type QuizDraft } from "./draft";
import { QuizEditor } from "./QuizEditor";
import { QuizViewer } from "./QuizViewer";
import { PAGE_SIZE, QUIZZES_KEY, useQuizList, useQuizMutations } from "./useQuizzes";

/** 문제 관리: the TOPIK question bank — browse, view, add, bulk-import, edit, delete. */
export function QuizzesPage() {
  const { can } = useAdminAuth();
  const canWrite = can("content:write");
  const filters = useUrlFilters();
  const [draft, setDraft] = useState<QuizDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<AdminQuiz | null>(null);
  const [deleting, setDeleting] = useState<AdminQuiz | null>(null);

  const q = filters.value("q");
  const format = filters.value("answer_format");
  const section = filters.value("topik_section");
  const level = filters.value("level");
  const aiOnly = filters.value("is_ai_generated");
  const page = filters.number("page", 1);
  const query = useQuizList({ q, format, section, level, aiOnly, page });
  const { save, remove, refresh } = useQuizMutations({
    onSaved: () => {
      setDraft(null);
      setEditingId(null);
    },
    onDeleted: () => setDeleting(null),
  });

  const startEdit = (quiz: AdminQuiz) => {
    setEditingId(quiz.quiz_id);
    setDraft(draftFromQuiz(quiz));
  };

  const columns: Column<AdminQuiz>[] = [
    {
      key: "prompt",
      header: "문제",
      render: (quiz) => (
        <div className="hgadm-cell-text">
          <div className="hgadm-cell-main hgadm-ellipsis">{quiz.prompt}</div>
        </div>
      ),
    },
    { key: "format", header: "형식", render: (quiz) => FORMAT_LABEL[quiz.answer_format] ?? quiz.answer_format },
    {
      key: "section",
      header: "TOPIK",
      render: (quiz) =>
        quiz.topik_section ? (
          <div>
            <Badge tone="info">{topikSectionLabel(quiz.topik_section)}</Badge>
            {quiz.topik_question_type && <div className="hgadm-cell-sub">{topikTypeLabel(quiz.topik_question_type)}</div>}
          </div>
        ) : (
          "—"
        ),
    },
    { key: "level", header: "급수", numeric: true, render: (quiz) => `${quiz.level}급` },
    {
      key: "source",
      header: "출처",
      render: (quiz) => (
        <Badge tone={quiz.is_ai_generated ? "warning" : "neutral"}>{quiz.is_ai_generated ? "AI 생성" : "수동"}</Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (quiz) => (
        <div className="hgadm-row" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" onClick={() => setViewing(quiz)}>
            보기
          </Button>
          {canWrite && (
            <>
              <Button size="sm" onClick={() => startEdit(quiz)}>
                수정
              </Button>
              <Button size="sm" variant="danger-soft" onClick={() => setDeleting(quiz)}>
                삭제
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>문제 관리</h1>
          <div className="hgadm-page-head__desc">
            일일 퀴즈·TOPIK 문제 목록입니다. 저장 시 형식별 형식 검사(정답 필수, 빈칸 구성 등)이 수행되어 잘못된 문제가 등록될 수
            없습니다.
          </div>
        </div>
        {canWrite && (
          <div className="hgadm-page-head__actions">
            {can("admins:manage") && (
              <ContentCleanupButton
                label="문제 전체 삭제"
                preview={adminApi.previewTopikCleanup}
                clear={adminApi.clearTopik}
                countLabels={[
                  ["questions_archived", "문제"],
                  ["exam_sets_archived", "모의고사"],
                  ["practice_sets", "AI 연습 세트"],
                  ["generated_questions", "AI 생성 문제"],
                ]}
                preservedLabels={[
                  ["quiz_histories_preserved", "풀이 이력"],
                  ["quiz_attempts_preserved", "풀이 기록"],
                  ["exam_attempts_preserved", "모의고사 응시"],
                  ["saved_quizzes_preserved", "저장된 문제"],
                ]}
                invalidateKeys={[QUIZZES_KEY]}
              />
            )}
            <BulkImportButton
              noun="문제"
              title="TOPIK 문제 일괄 추가"
              fields={QUIZ_FIELDS}
              template={BATCH_TEMPLATE}
              templateFilename="TOPIK-문제-예시.json"
              check={adminApi.checkQuizzesBatch}
              submit={adminApi.createQuizzesBatch}
              invalidateKeys={[QUIZZES_KEY]}
            />
            <Button
              variant="primary"
              onClick={() => {
                setEditingId(null);
                setDraft(emptyDraft());
              }}
            >
              + 문제 추가
            </Button>
          </div>
        )}
      </div>

      <div className="hgadm-card">
        <div className="hgadm-toolbar">
          <SearchBox value={q} placeholder="문항·번역 검색" onSearch={(next) => filters.patch({ q: next, page: null })} />
          <Select value={format} onChange={(e) => filters.patch({ answer_format: e.target.value, page: null })}>
            <option value="">형식: 전체</option>
            {FORMATS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select value={section} onChange={(e) => filters.patch({ topik_section: e.target.value, page: null })}>
            <option value="">영역: 전체</option>
            {TOPIK_SECTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select value={level} onChange={(e) => filters.patch({ level: e.target.value, page: null })}>
            <option value="">급수: 전체</option>
            {TOPIK_GRADES.map((l) => (
              <option key={l} value={l}>
                {l}급
              </option>
            ))}
          </Select>
          {/* Creation provenance, from the quiz's own `is_ai_generated` flag —
              the same field the 출처 column badges. Labels match that badge so
              a filtered list reads consistently with its rows. */}
          <Select value={aiOnly} onChange={(e) => filters.patch({ is_ai_generated: e.target.value, page: null })}>
            <option value="">출처: 전체</option>
            <option value="true">AI 생성</option>
            <option value="false">수동</option>
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
              rowKey={(quiz) => quiz.quiz_id}
              onRowClick={setViewing}
              empty="조건에 맞는 문제가 없습니다."
            />
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={query.data.total}
              onPageChange={(next) => filters.patch({ page: String(next) })}
            />
          </>
        )}
      </div>

      <QuizViewer quiz={viewing} onClose={() => setViewing(null)} />

      <QuizEditor
        draft={draft}
        setDraft={setDraft}
        editingId={editingId}
        canWrite={canWrite}
        saving={save.isPending}
        onSave={(d) => save.mutate({ id: editingId, draft: d })}
        onAudioUploaded={refresh}
      />

      <ConfirmDialog
        open={deleting !== null}
        title="문제 삭제"
        message="문제를 영구 삭제할까요? 사용자 풀이 이력·북마크도 함께 삭제됩니다."
        danger
        confirmLabel="삭제"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

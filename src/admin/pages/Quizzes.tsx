import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useUrlFilters } from "../lib/urlFilters";
import { adminApi } from "../api";
import type { AdminQuiz } from "../api";
import { errorMessage } from "../../lib/http";
import { TOPIK_GRADES } from "../../lib/levels";
import { useToast, useToastError } from "../../hooks/toast";
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

const FORMATS = [
  ["single_choice", "객관식"],
  ["short_answer", "빈칸 채우기"],
  ["free_response", "서술형"],
] as const;
const FORMAT_LABEL = Object.fromEntries(FORMATS);
const SECTIONS = [
  ["listening", "듣기"],
  ["reading", "읽기"],
  ["writing", "쓰기"],
] as const;

const BATCH_TEMPLATE = JSON.stringify(
  [
    {
      answer_format: "single_choice",
      material_kind: "text",
      topik_section: "reading",
      topik_question_type: "reading_01",
      prompt: "빈칸에 들어갈 말로 가장 알맞은 것을 고르십시오.",
      content_html: "<p>주말에 친구를 (      ).</p>",
      level: 1,
      choices: [
        { key: "1", text: "만납니다" },
        { key: "2", text: "먹습니다" },
        { key: "3", text: "읽습니다" },
        { key: "4", text: "봅니다" },
      ],
      correct_choice: "1",
      explanation: "사람을 만나다: '친구를 만납니다'가 자연스럽습니다.",
    },
    {
      answer_format: "short_answer",
      topik_section: "writing",
      topik_question_type: "writing_51_52",
      prompt: "빈칸 ㄱ에 알맞은 말을 쓰십시오.",
      content_html: "<p>내일 시간이 ( ㄱ ) 같이 영화를 봅시다.</p>",
      level: 3,
      blanks: [{ label: "ㄱ", answer: "있으면" }],
    },
  ],
  null,
  2,
);

interface QuizDraft {
  answer_format: string;
  material_kind: string;
  topik_section: string;
  topik_question_type: string;
  prompt: string;
  prompt_translation: string;
  content_html: string;
  level: string;
  choices: { key: string; text: string }[];
  correct_choice: string;
  blanks: { label: string; answer: string }[];
  hint: string;
  explanation: string;
  audio_duration_ms: string;
  answer_max_length: string;
  scoring_criteria: string;
  max_score: string;
}

const EMPTY: QuizDraft = {
  answer_format: "single_choice",
  material_kind: "text",
  topik_section: "",
  topik_question_type: "",
  prompt: "",
  prompt_translation: "",
  content_html: "",
  level: "1",
  choices: [
    { key: "1", text: "" },
    { key: "2", text: "" },
    { key: "3", text: "" },
    { key: "4", text: "" },
  ],
  correct_choice: "1",
  blanks: [{ label: "", answer: "" }],
  hint: "",
  explanation: "",
  audio_duration_ms: "0",
  answer_max_length: "",
  scoring_criteria: "",
  max_score: "",
};

function draftFromQuiz(quiz: AdminQuiz): QuizDraft {
  return {
    answer_format: quiz.answer_format,
    material_kind: quiz.material_kind,
    topik_section: quiz.topik_section ?? "",
    topik_question_type: quiz.topik_question_type ?? "",
    prompt: quiz.prompt,
    prompt_translation: quiz.prompt_translation ?? "",
    content_html: quiz.content_html ?? "",
    level: String(quiz.level),
    choices: quiz.choices.length
      ? quiz.choices.map((c) => ({ key: c.key, text: c.text }))
      : EMPTY.choices,
    correct_choice: quiz.correct_choice ?? "1",
    blanks: quiz.blanks.length
      ? quiz.blanks.map((b) => ({ label: b.label, answer: b.answer ?? "" }))
      : EMPTY.blanks,
    hint: quiz.hint ?? "",
    explanation: quiz.explanation ?? "",
    audio_duration_ms: String(quiz.audio_duration_ms),
    answer_max_length: quiz.answer_max_length === null ? "" : String(quiz.answer_max_length),
    scoring_criteria: quiz.scoring_criteria.join("\n"),
    max_score: quiz.max_score === null ? "" : String(quiz.max_score),
  };
}

function draftToBody(d: QuizDraft): Record<string, unknown> {
  const isChoice = d.answer_format === "single_choice";
  const isShort = d.answer_format === "short_answer";
  const criteria = d.scoring_criteria
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    answer_format: d.answer_format,
    material_kind: d.material_kind,
    topik_section: d.topik_section || null,
    topik_question_type: d.topik_question_type || null,
    prompt: d.prompt,
    prompt_translation: d.prompt_translation || null,
    content_html: d.content_html || null,
    level: Number(d.level),
    choices: isChoice ? d.choices.filter((c) => c.text.trim()) : null,
    correct_choice: isChoice ? d.correct_choice : null,
    blanks: isShort
      ? d.blanks
          .filter((b) => b.label.trim() || b.answer.trim())
          .map((b) => ({ label: b.label, answer: b.answer || null }))
      : null,
    hint: d.hint || null,
    explanation: d.explanation || null,
    audio_duration_ms: Number(d.audio_duration_ms) || 0,
    answer_max_length: d.answer_max_length === "" ? null : Number(d.answer_max_length),
    scoring_criteria: criteria.length ? criteria : null,
    max_score: d.max_score === "" ? null : Number(d.max_score),
  };
}

export function QuizzesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
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
  const pageSize = 25;

  const query = useQuery({
    queryKey: ["admin", "quizzes", { q, format, section, level, aiOnly, page }],
    queryFn: () =>
      adminApi.listQuizzes({
        q: q || undefined,
        answer_format: format || undefined,
        topik_section: section || undefined,
        level: level || undefined,
        is_ai_generated: aiOnly === "" ? undefined : aiOnly === "true",
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
  });

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["admin", "quizzes"] });
  }

  const save = useMutation({
    mutationFn: (d: QuizDraft) =>
      editingId
        ? adminApi.replaceQuiz(editingId, draftToBody(d))
        : adminApi.createQuiz(draftToBody(d)),
    onSuccess: () => {
      toast.success("문제를 저장했어요.");
      setDraft(null);
      setEditingId(null);
      refresh();
    },
    onError: toastError,
  });

  const remove = useMutation({
    mutationFn: (quiz: AdminQuiz) => adminApi.deleteQuiz(quiz.quiz_id),
    onSuccess: () => {
      toast.success("문제를 삭제했어요.");
      setDeleting(null);
      refresh();
    },
    onError: toastError,
  });

  const columns: Column<AdminQuiz>[] = [
    {
      key: "prompt",
      header: "문제",
      render: (quiz) => (
        <div style={{ maxWidth: 420 }}>
          <div
            className="hgadm-cell-main"
            style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {quiz.prompt}
          </div>
          <div className="hgadm-cell-sub hgadm-cell-mono">{quiz.quiz_id}</div>
        </div>
      ),
    },
    {
      key: "format",
      header: "형식",
      render: (quiz) => FORMAT_LABEL[quiz.answer_format] ?? quiz.answer_format,
    },
    {
      key: "section",
      header: "TOPIK",
      render: (quiz) =>
        quiz.topik_section ? (
          <div>
            <Badge tone="info">{quiz.topik_section}</Badge>
            {quiz.topik_question_type && (
              <div className="hgadm-cell-sub">{quiz.topik_question_type}</div>
            )}
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
        <Badge tone={quiz.is_ai_generated ? "warning" : "neutral"}>
          {quiz.is_ai_generated ? "AI 생성" : "수동"}
        </Badge>
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
              <Button
                size="sm"
                onClick={() => {
                  setEditingId(quiz.quiz_id);
                  setDraft(draftFromQuiz(quiz));
                }}
              >
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
            일일 퀴즈·TOPIK 문제 목록입니다. 저장 시 형식별 형식 검사(정답 필수,
            빈칸 구성 등)이 수행되어 잘못된 문제가 등록될 수 없습니다.
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
                  ["questions", "문제"],
                  ["quiz_histories", "풀이 이력"],
                  ["saved_quizzes", "저장된 문제"],
                  ["quiz_attempts", "풀이 기록"],
                  ["exam_sets", "모의고사"],
                  ["exam_set_questions", "모의고사 문항"],
                  ["exam_attempts", "모의고사 응시"],
                  ["practice_sets", "AI 연습 세트"],
                  ["generated_questions", "AI 생성 문제"],
                ]}
                invalidateKeys={[["admin", "quizzes"]]}
              />
            )}
            <BatchAddButton
              title="문제 일괄 추가"
              hint="단건 생성과 같은 필드(answer_format·prompt·level 필수, 형식별 필드 포함)를 담은 JSON 배열을 붙여넣으세요."
              template={BATCH_TEMPLATE}
              submit={adminApi.createQuizzesBatch}
              invalidateKeys={[["admin", "quizzes"]]}
            />
            <Button
              variant="primary"
              onClick={() => {
                setEditingId(null);
                setDraft({ ...EMPTY, choices: EMPTY.choices.map((c) => ({ ...c })), blanks: EMPTY.blanks.map((b) => ({ ...b })) });
              }}
            >
              + 문제 추가
            </Button>
          </div>
        )}
      </div>

      <div className="hgadm-card">
        <div className="hgadm-toolbar">
          <SearchBox
            value={q}
            placeholder="문항·번역·문제 ID 검색"
            onSearch={(next) => filters.patch({ q: next, page: null })}
          />
          <Select
            value={format}
            onChange={(e) => filters.patch({ answer_format: e.target.value, page: null })}
            style={{ width: 150 }}
          >
            <option value="">형식: 전체</option>
            {FORMATS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            value={section}
            onChange={(e) => filters.patch({ topik_section: e.target.value, page: null })}
            style={{ width: 140 }}
          >
            <option value="">섹션: 전체</option>
            {SECTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            value={level}
            onChange={(e) => filters.patch({ level: e.target.value, page: null })}
            style={{ width: 120 }}
          >
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
          <Select
            value={aiOnly}
            onChange={(e) => filters.patch({ is_ai_generated: e.target.value, page: null })}
            style={{ width: 140 }}
          >
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
              pageSize={pageSize}
              total={query.data.total}
              onPageChange={(next) => filters.patch({ page: String(next) })}
            />
          </>
        )}
      </div>

      {/* Detail viewer */}
      <Modal
        open={viewing !== null}
        title="문제 상세"
        size="lg"
        onClose={() => setViewing(null)}
      >
        {viewing && (
          <div style={{ fontSize: 14 }}>
            <div className="hgadm-row hgadm-row--wrap" style={{ marginBottom: 10 }}>
              <Badge tone="info">{FORMAT_LABEL[viewing.answer_format]}</Badge>
              {viewing.topik_section && <Badge tone="brand">{viewing.topik_section}</Badge>}
              <Badge tone="neutral">{viewing.level}급</Badge>
              {viewing.is_ai_generated && <Badge tone="warning">AI 생성</Badge>}
            </div>
            <p style={{ fontWeight: 700, whiteSpace: "pre-wrap" }}>{viewing.prompt}</p>
            {viewing.content_html && (
              <div
                className="hgadm-json"
                style={{ fontFamily: "inherit" }}
                dangerouslySetInnerHTML={{ __html: viewing.content_html }}
              />
            )}
            {viewing.choices.length > 0 && (
              <ol style={{ paddingLeft: 20, lineHeight: 1.8 }}>
                {viewing.choices.map((c) => (
                  <li key={c.key}>
                    {c.text}
                    {viewing.correct_choice === c.key && (
                      <strong
                        className="hgadm-row"
                        style={{ color: "var(--success)", display: "inline-flex", gap: 4, marginLeft: 6, verticalAlign: "middle" }}
                      >
                        <Check size={15} strokeWidth={2.5} />
                        정답
                      </strong>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {viewing.blanks.length > 0 && (
              <ul style={{ paddingLeft: 20, lineHeight: 1.8 }}>
                {viewing.blanks.map((b, i) => (
                  <li key={i}>
                    {b.label || "빈칸"}: <strong>{b.answer ?? "(기준 채점)"}</strong>
                  </li>
                ))}
              </ul>
            )}
            {viewing.explanation && (
              <>
                <hr className="hgadm-divider" />
                <div className="hgadm-field__label">해설</div>
                <p style={{ whiteSpace: "pre-wrap" }}>{viewing.explanation}</p>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Editor */}
      <Modal
        open={draft !== null}
        title={editingId ? `문제 수정 — ${editingId}` : "문제 추가"}
        size="xl"
        onClose={() => setDraft(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              취소
            </Button>
            <Button
              variant="primary"
              loading={save.isPending}
              disabled={!draft?.prompt.trim()}
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
              <Field label="답안 형식" required>
                <Select
                  value={draft.answer_format}
                  onChange={(e) => setDraft({ ...draft, answer_format: e.target.value })}
                >
                  {FORMATS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="자료 유형" required>
                <Select
                  value={draft.material_kind}
                  onChange={(e) => setDraft({ ...draft, material_kind: e.target.value })}
                >
                  <option value="text">텍스트</option>
                  <option value="table">표 (HTML)</option>
                  <option value="audio">듣기</option>
                </Select>
              </Field>
              <Field label="TOPIK 섹션">
                <Select
                  value={draft.topik_section}
                  onChange={(e) => setDraft({ ...draft, topik_section: e.target.value })}
                >
                  <option value="">해당 없음</option>
                  {SECTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="TOPIK 문제 유형" hint="예: reading_03">
                <Input
                  value={draft.topik_question_type}
                  onChange={(e) =>
                    setDraft({ ...draft, topik_question_type: e.target.value })
                  }
                />
              </Field>
              <Field label="TOPIK 급수" required hint="1~6급 (회화 레벨과 다른 척도)">
                <Select
                  value={draft.level}
                  onChange={(e) => setDraft({ ...draft, level: e.target.value })}
                >
                  {TOPIK_GRADES.map((l) => (
                    <option key={l} value={l}>
                      {l}급
                    </option>
                  ))}
                </Select>
              </Field>
              {draft.material_kind === "audio" && (
                <Field label="오디오 길이 (ms)" required>
                  <Input
                    type="number"
                    min={0}
                    value={draft.audio_duration_ms}
                    onChange={(e) =>
                      setDraft({ ...draft, audio_duration_ms: e.target.value })
                    }
                  />
                </Field>
              )}
            </div>
            <Field label="문제 지문" required>
              <Textarea
                rows={3}
                value={draft.prompt}
                onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
              />
            </Field>
            <Field label="지문 번역 (영어)">
              <Textarea
                rows={2}
                value={draft.prompt_translation}
                onChange={(e) =>
                  setDraft({ ...draft, prompt_translation: e.target.value })
                }
              />
            </Field>
            {(draft.material_kind === "text" || draft.material_kind === "table") && (
              <Field
                label="본문 HTML"
                hint="AI 생성 원칙과 동일하게 이미지 대신 텍스트/표 HTML을 사용합니다."
              >
                <Textarea
                  rows={4}
                  value={draft.content_html}
                  onChange={(e) => setDraft({ ...draft, content_html: e.target.value })}
                />
              </Field>
            )}

            {draft.answer_format === "single_choice" && (
              <div>
                <div className="hgadm-field__label" style={{ marginBottom: 6 }}>
                  선택지 (정답 라디오 선택)
                </div>
                {draft.choices.map((choice, i) => (
                  <div className="hgadm-row" key={i} style={{ marginBottom: 8 }}>
                    <input
                      type="radio"
                      name="correct"
                      checked={draft.correct_choice === choice.key}
                      onChange={() => setDraft({ ...draft, correct_choice: choice.key })}
                      aria-label={`정답: 선택지 ${choice.key}`}
                    />
                    <span style={{ width: 20, fontWeight: 700 }}>{choice.key}</span>
                    <Input
                      value={choice.text}
                      onChange={(e) => {
                        const choices = [...draft.choices];
                        choices[i] = { ...choice, text: e.target.value };
                        setDraft({ ...draft, choices });
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            {draft.answer_format === "short_answer" && (
              <div>
                <div className="hgadm-field__label" style={{ marginBottom: 6 }}>
                  빈칸 (라벨 + 정답 · 정답을 비우면 기준 채점)
                </div>
                {draft.blanks.map((blank, i) => (
                  <div className="hgadm-row" key={i} style={{ marginBottom: 8 }}>
                    <Input
                      style={{ width: 90 }}
                      placeholder="라벨 (ㄱ)"
                      value={blank.label}
                      onChange={(e) => {
                        const blanks = [...draft.blanks];
                        blanks[i] = { ...blank, label: e.target.value };
                        setDraft({ ...draft, blanks });
                      }}
                    />
                    <Input
                      placeholder="정답"
                      value={blank.answer}
                      onChange={(e) => {
                        const blanks = [...draft.blanks];
                        blanks[i] = { ...blank, answer: e.target.value };
                        setDraft({ ...draft, blanks });
                      }}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          blanks: draft.blanks.filter((_, j) => j !== i),
                        })
                      }
                      aria-label="삭제"
                    >
                      <X size={16} strokeWidth={2} />
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  onClick={() =>
                    setDraft({ ...draft, blanks: [...draft.blanks, { label: "", answer: "" }] })
                  }
                >
                  + 빈칸 추가
                </Button>
              </div>
            )}

            {(draft.answer_format === "free_response" ||
              draft.scoring_criteria.trim() !== "") && (
              <div className="hgadm-form-grid" style={{ marginTop: 10 }}>
                <Field label="최대 글자 수" required={draft.answer_format === "free_response"}>
                  <Input
                    type="number"
                    min={1}
                    value={draft.answer_max_length}
                    onChange={(e) =>
                      setDraft({ ...draft, answer_max_length: e.target.value })
                    }
                  />
                </Field>
                <Field label="만점">
                  <Input
                    type="number"
                    min={1}
                    value={draft.max_score}
                    onChange={(e) => setDraft({ ...draft, max_score: e.target.value })}
                  />
                </Field>
                <div className="span-2">
                  <Field label="채점 기준" hint="한 줄에 하나씩">
                    <Textarea
                      rows={3}
                      value={draft.scoring_criteria}
                      onChange={(e) =>
                        setDraft({ ...draft, scoring_criteria: e.target.value })
                      }
                    />
                  </Field>
                </div>
              </div>
            )}

            <div className="hgadm-form-grid" style={{ marginTop: 10 }}>
              <Field label="힌트">
                <Input
                  value={draft.hint}
                  onChange={(e) => setDraft({ ...draft, hint: e.target.value })}
                />
              </Field>
              <Field label="해설">
                <Input
                  value={draft.explanation}
                  onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
                />
              </Field>
            </div>
          </div>
        )}
      </Modal>

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

import { useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../api";
import type { AdminCheckpoint, AdminCheckpointWrite, AdminLecture, CheckpointInteractionType } from "../api";
import { errorMessage } from "../../lib/http";
import { useToast, useToastError } from "../../hooks/toast";
import {
  Badge,
  Button,
  ConfirmDialog,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Modal,
  SearchBox,
} from "../components/kit";
import type { BadgeTone } from "../components/kit";

/** The two modals a lecture can pause for (COU-006 conversation, COU-011 TOPIK). */
type ContentKind = "sentence" | "quiz";

const TYPE_LABEL: Record<CheckpointInteractionType, [string, BadgeTone]> = {
  speaking_exercise: ["회화 · 따라 말하기", "info"],
  multiple_choice: ["TOPIK · 객관식", "brand"],
  short_answer: ["TOPIK · 주관식/쓰기", "warning"],
};

/** 75 → "1:15"; the editor and the list both show playback time this way. */
export function formatTimecode(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "1:15" / "75" → 75; null when it is not a time. */
export function parseTimecode(raw: string): number | null {
  const text = raw.trim();
  if (/^\d+$/.test(text)) return Number(text);
  const match = /^(\d+):([0-5]\d)$/.exec(text);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

interface Draft {
  checkpointId: string | null;
  kind: ContentKind;
  time: string;
  contentId: string;
  contentLabel: string;
}

function draftFrom(checkpoint: AdminCheckpoint): Draft {
  return {
    checkpointId: checkpoint.checkpoint_id,
    kind: checkpoint.sentence_id ? "sentence" : "quiz",
    time: formatTimecode(checkpoint.at_second),
    contentId: checkpoint.sentence_id ?? checkpoint.quiz_id ?? "",
    contentLabel: checkpoint.content_label ?? "",
  };
}

/**
 * Where a lecture pauses for a conversation (speaking) or TOPIK question
 * modal. The learner's player fires each checkpoint at its second, in order.
 *
 * Read-only without `content:write`; the server enforces it either way.
 */
export function CheckpointsModal({
  lecture,
  canWrite,
  onClose,
}: {
  lecture: AdminLecture;
  canWrite: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<AdminCheckpoint | null>(null);
  const key = ["admin", "lecture-checkpoints", lecture.lecture_id];

  const query = useQuery({
    queryKey: key,
    queryFn: () => adminApi.listCheckpoints(lecture.lecture_id),
  });

  function refresh() {
    void qc.invalidateQueries({ queryKey: key });
    // The lecture list shows each lecture's checkpoint count.
    void qc.invalidateQueries({ queryKey: ["admin", "lectures"] });
  }

  const save = useMutation({
    mutationFn: ({ draft, atSecond }: { draft: Draft; atSecond: number }) => {
      const body: AdminCheckpointWrite = {
        at_second: atSecond,
        ...(draft.kind === "sentence" ? { sentence_id: draft.contentId } : { quiz_id: draft.contentId }),
      };
      return draft.checkpointId
        ? adminApi.replaceCheckpoint(lecture.lecture_id, draft.checkpointId, body)
        : adminApi.createCheckpoint(lecture.lecture_id, body);
    },
    onSuccess: () => {
      toast.success("체크포인트를 저장했어요.");
      setDraft(null);
      refresh();
    },
    onError: toastError,
  });

  const remove = useMutation({
    mutationFn: (checkpoint: AdminCheckpoint) =>
      adminApi.deleteCheckpoint(lecture.lecture_id, checkpoint.checkpoint_id),
    onSuccess: () => {
      toast.success("체크포인트를 삭제했어요.");
      setDeleting(null);
      refresh();
    },
    onError: toastError,
  });

  const duration = query.data?.duration_seconds ?? lecture.duration_seconds;
  const atSecond = draft ? parseTimecode(draft.time) : null;
  const timeError =
    draft && draft.time.trim() !== ""
      ? atSecond === null
        ? "‘분:초’(예: 1:30) 또는 초 단위 숫자로 입력하세요."
        : duration && atSecond > duration
          ? `강의 길이(${formatTimecode(duration)})를 넘을 수 없어요.`
          : null
      : null;
  const canSave = !!draft && atSecond !== null && !timeError && !!draft.contentId;

  return (
    <Modal open title={`체크포인트 관리 — ${lecture.title}`} size="xl" onClose={onClose}>
      <p className="hgadm-cp__intro">
        영상이 지정한 시점에 도달하면 재생이 멈추고 학습자에게 회화(따라 말하기) 또는 TOPIK 문제
        모달이 열립니다. 학습자가 모달을 마치면 영상이 이어서 재생됩니다. 학습자는 플레이어의
        ‘말하기 제외’/‘문제 풀이 제외’ 스위치로 해당 모달을 건너뛸 수 있어요.
        {!duration && " 강의 길이가 0초로 되어 있어 시점 상한을 검사하지 않습니다 — 강의 정보에서 길이를 입력하세요."}
      </p>

      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <div className="hgadm-state" style={{ padding: 24 }}>
          <div className="hgadm-state__desc">아직 체크포인트가 없습니다.</div>
        </div>
      ) : (
        <div className="hgadm-table-wrap">
          <table className="hgadm-table">
            <thead>
              <tr>
                <th>시점</th>
                <th>모달</th>
                <th>콘텐츠</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((cp) => {
                const [label, tone] = TYPE_LABEL[cp.interaction_type];
                return (
                  <tr key={cp.checkpoint_id}>
                    <td className="hgadm-cell-mono">{formatTimecode(cp.at_second)}</td>
                    <td>
                      <Badge tone={tone}>{label}</Badge>
                    </td>
                    <td>
                      <div className="hgadm-cell-main">
                        {cp.content_label ?? "(삭제된 콘텐츠)"}
                        {cp.content_archived && <Badge tone="danger"> 보관됨 — 교체 필요</Badge>}
                      </div>
                      <div className="hgadm-cell-sub">
                        <span className="hgadm-cell-mono">{cp.sentence_id ?? cp.quiz_id}</span>
                        {cp.content_detail && ` · ${cp.content_detail}`}
                      </div>
                    </td>
                    <td>
                      {canWrite && (
                        <div className="hgadm-row">
                          <Button size="sm" onClick={() => setDraft(draftFrom(cp))}>
                            수정
                          </Button>
                          <Button size="sm" variant="danger-soft" onClick={() => setDeleting(cp)}>
                            삭제
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canWrite && !draft && (
        <div className="hgadm-cp__add">
          <Button
            variant="primary"
            onClick={() =>
              setDraft({ checkpointId: null, kind: "sentence", time: "", contentId: "", contentLabel: "" })
            }
          >
            + 체크포인트 추가
          </Button>
        </div>
      )}

      {draft && (
        <div className="hgadm-cp__editor" aria-label="체크포인트 편집">
          <div className="hgadm-cp__editor-title">
            {draft.checkpointId ? "체크포인트 수정" : "새 체크포인트"}
          </div>
          <div className="hgadm-form-grid">
            <FieldGroup label="모달 종류">
              <div className="hgadm-cp__kinds" role="radiogroup" aria-label="모달 종류">
                {(
                  [
                    ["sentence", "회화 (따라 말하기)"],
                    ["quiz", "TOPIK 문제"],
                  ] as const
                ).map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    role="radio"
                    aria-checked={draft.kind === kind}
                    className={`hgadm-cp__kind ${draft.kind === kind ? "is-on" : ""}`}
                    onClick={() =>
                      draft.kind !== kind &&
                      setDraft({ ...draft, kind, contentId: "", contentLabel: "" })
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            </FieldGroup>
            <Field
              label="재생 시점"
              required
              error={timeError ?? undefined}
              hint={duration ? `0:00 – ${formatTimecode(duration)}` : "분:초 또는 초"}
            >
              <Input
                value={draft.time}
                placeholder="예: 1:30"
                inputMode="numeric"
                onChange={(e) => setDraft({ ...draft, time: e.target.value })}
              />
            </Field>
            <div className="span-2">
              <FieldGroup
                label={draft.kind === "sentence" ? "따라 말할 문장" : "TOPIK 문제"}
                hint={
                  draft.kind === "quiz"
                    ? "객관식은 선택형 모달, 주관식·쓰기 문제는 답안 입력 모달로 열립니다."
                    : "문장 콘텐츠에서 등록한 문장을 고르세요."
                }
              >
                {draft.contentId ? (
                  <div className="hgadm-cp__picked">
                    <div>
                      <div className="hgadm-cell-main">{draft.contentLabel || draft.contentId}</div>
                      <div className="hgadm-cell-sub hgadm-cell-mono">{draft.contentId}</div>
                    </div>
                    <Button size="sm" onClick={() => setDraft({ ...draft, contentId: "", contentLabel: "" })}>
                      변경
                    </Button>
                  </div>
                ) : (
                  <ContentPicker
                    kind={draft.kind}
                    onPick={(id, label) => setDraft({ ...draft, contentId: id, contentLabel: label })}
                  />
                )}
              </FieldGroup>
            </div>
          </div>
          <div className="hgadm-cp__editor-actions">
            <Button variant="ghost" onClick={() => setDraft(null)}>
              취소
            </Button>
            <Button
              variant="primary"
              loading={save.isPending}
              disabled={!canSave}
              onClick={() => atSecond !== null && save.mutate({ draft, atSecond })}
            >
              저장
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="체크포인트 삭제"
        message={`${deleting ? formatTimecode(deleting.at_second) : ""} 시점의 체크포인트를 삭제할까요? 연결된 문장·문제는 삭제되지 않습니다.`}
        danger
        confirmLabel="삭제"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </Modal>
  );
}

/**
 * `Field` wraps its control in a <label>, which turns a click anywhere on it
 * into a click on the first button inside — wrong for a radio group or a
 * result list. Same look, as a plain group.
 */
function FieldGroup({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="hgadm-field" role="group" aria-label={label}>
      <span className="hgadm-field__label">
        {label}
        <span className="req">*</span>
      </span>
      {children}
      {hint && <span className="hgadm-field__hint">{hint}</span>}
    </div>
  );
}

function ContentPicker({
  kind,
  onPick,
}: {
  kind: ContentKind;
  onPick: (id: string, label: string) => void;
}) {
  const [q, setQ] = useState("");
  const sentences = useQuery({
    queryKey: ["admin", "checkpoint-picker", "sentence", q],
    queryFn: () => adminApi.listSentences({ q: q || undefined, page: 1, page_size: 10 }),
    enabled: kind === "sentence",
  });
  const quizzes = useQuery({
    queryKey: ["admin", "checkpoint-picker", "quiz", q],
    queryFn: () => adminApi.listQuizzes({ q: q || undefined, limit: 10, offset: 0 }),
    enabled: kind === "quiz",
  });
  const active = kind === "sentence" ? sentences : quizzes;
  const options =
    kind === "sentence"
      ? (sentences.data?.items ?? []).map((s) => ({
          id: s.sentence_id,
          label: s.korean,
          detail: s.translation,
        }))
      : (quizzes.data?.items ?? []).map((quiz) => ({
          id: quiz.quiz_id,
          label: quiz.prompt,
          detail: [quiz.topik_question_type, quiz.answer_format === "single_choice" ? "객관식" : "주관식/쓰기"]
            .filter(Boolean)
            .join(" · "),
        }));
  return (
    <div className="hgadm-cp__picker">
      <SearchBox
        value={q}
        placeholder={kind === "sentence" ? "한국어·번역·문장 ID 검색" : "문제 내용·문제 ID 검색"}
        onSearch={setQ}
      />
      {active.isPending ? (
        <LoadingState />
      ) : active.isError ? (
        <ErrorState message={errorMessage(active.error)} onRetry={() => void active.refetch()} />
      ) : options.length === 0 ? (
        <div className="hgadm-muted hgadm-cp__none">검색 결과가 없습니다.</div>
      ) : (
        <ul className="hgadm-cp__options">
          {options.map((o) => (
            <li key={o.id}>
              <button type="button" className="hgadm-cp__option" onClick={() => onPick(o.id, o.label)}>
                <span className="hgadm-cell-main">{o.label}</span>
                <span className="hgadm-cell-sub">
                  <span className="hgadm-cell-mono">{o.id}</span>
                  {o.detail && ` · ${o.detail}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

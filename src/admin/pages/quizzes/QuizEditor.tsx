import type { Dispatch, SetStateAction } from "react";
import { X } from "lucide-react";
import { TOPIK_GRADES } from "../../../lib/levels";
import { Button, Field, Input, Modal, Select, Textarea } from "../../components/kit";
import { TopikTypeSelect } from "../../components/TopikTypeSelect";
import { TOPIK_SECTIONS, typeForSection } from "../../lib/topik";
import { criteriaGraded, FORMATS, type QuizDraft } from "./draft";
import { ListeningAudioField } from "./ListeningAudioField";

type SetDraft = Dispatch<SetStateAction<QuizDraft | null>>;

/** Creating or replacing a question. The fields shown follow the format and material. */
export function QuizEditor({
  draft,
  setDraft,
  editingId,
  canWrite,
  saving,
  onSave,
  onAudioUploaded,
}: {
  draft: QuizDraft | null;
  setDraft: SetDraft;
  editingId: string | null;
  canWrite: boolean;
  saving: boolean;
  onSave: (draft: QuizDraft) => void;
  onAudioUploaded: () => void;
}) {
  const close = () => setDraft(null);
  return (
    <Modal
      open={draft !== null}
      title={editingId ? "문제 수정" : "문제 추가"}
      size="xl"
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            취소
          </Button>
          <Button variant="primary" loading={saving} disabled={!draft?.prompt.trim()} onClick={() => draft && onSave(draft)}>
            저장
          </Button>
        </>
      }
    >
      {draft && (
        <EditorFields draft={draft} setDraft={setDraft} editingId={editingId} canWrite={canWrite} onAudioUploaded={onAudioUploaded} />
      )}
    </Modal>
  );
}

function EditorFields({
  draft,
  setDraft,
  editingId,
  canWrite,
  onAudioUploaded,
}: {
  draft: QuizDraft;
  setDraft: SetDraft;
  editingId: string | null;
  canWrite: boolean;
  onAudioUploaded: () => void;
}) {
  const patch = (changes: Partial<QuizDraft>) => setDraft({ ...draft, ...changes });
  return (
    <div>
      <div className="hgadm-form-grid">
        <Field label="답안 형식" required>
          <Select value={draft.answer_format} onChange={(e) => patch({ answer_format: e.target.value })}>
            {FORMATS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="자료 유형" required>
          <Select value={draft.material_kind} onChange={(e) => patch({ material_kind: e.target.value })}>
            <option value="text">텍스트</option>
            <option value="table">표 (HTML)</option>
            <option value="audio">듣기</option>
            <option value="image">이미지</option>
          </Select>
        </Field>
        <Field label="TOPIK 영역">
          <Select
            value={draft.topik_section}
            onChange={(e) =>
              patch({
                topik_section: e.target.value,
                topik_question_type: typeForSection(draft.topik_question_type, e.target.value),
              })
            }
          >
            <option value="">해당 없음</option>
            {TOPIK_SECTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="TOPIK 문제 유형" hint="영역을 고르면 그 영역의 유형만 보여요.">
          <TopikTypeSelect
            value={draft.topik_question_type}
            section={draft.topik_section}
            onChange={(code) => patch({ topik_question_type: code })}
          />
        </Field>
        <Field label="TOPIK 급수" required hint="1~6급 (회화 레벨과 다른 척도)">
          <Select value={draft.level} onChange={(e) => patch({ level: e.target.value })}>
            {TOPIK_GRADES.map((l) => (
              <option key={l} value={l}>
                {l}급
              </option>
            ))}
          </Select>
        </Field>
        {draft.material_kind === "audio" && (
          <>
            <Field label="오디오 길이 (ms)" required hint="MP3를 올리면 실제 오디오 길이로 자동으로 채워져요.">
              <Input
                type="number"
                min={0}
                value={draft.audio_duration_ms}
                onChange={(e) => patch({ audio_duration_ms: e.target.value })}
              />
            </Field>
            <ListeningAudioField
              quizId={editingId}
              canWrite={canWrite}
              onUploaded={(durationMs) => {
                setDraft((d) => (d ? { ...d, audio_duration_ms: String(durationMs) } : d));
                onAudioUploaded();
              }}
            />
          </>
        )}
        {draft.material_kind === "image" && (
          <Field label="이미지 URL" required>
            <Input value={draft.image_url} maxLength={500} onChange={(e) => patch({ image_url: e.target.value })} />
          </Field>
        )}
      </div>
      <Field label="문제 지문" required>
        <Textarea rows={3} value={draft.prompt} onChange={(e) => patch({ prompt: e.target.value })} />
      </Field>
      <Field label="지문 번역 (영어)">
        <Textarea rows={2} value={draft.prompt_translation} onChange={(e) => patch({ prompt_translation: e.target.value })} />
      </Field>
      {(draft.material_kind === "text" || draft.material_kind === "table") && (
        <Field label="본문 HTML" hint="AI 생성 원칙과 동일하게 이미지 대신 텍스트/표 HTML을 사용합니다.">
          <Textarea rows={4} value={draft.content_html} onChange={(e) => patch({ content_html: e.target.value })} />
        </Field>
      )}

      {draft.answer_format === "single_choice" && <ChoicesEditor draft={draft} patch={patch} />}
      {draft.answer_format === "short_answer" && <BlanksEditor draft={draft} patch={patch} />}
      {criteriaGraded(draft) && <ScoringFields draft={draft} patch={patch} />}

      <div className="hgadm-form-grid hgadm-mt-12">
        <Field label="힌트">
          <Input value={draft.hint} onChange={(e) => patch({ hint: e.target.value })} />
        </Field>
        <Field label="해설">
          <Input value={draft.explanation} onChange={(e) => patch({ explanation: e.target.value })} />
        </Field>
      </div>
    </div>
  );
}

type SectionProps = { draft: QuizDraft; patch: (changes: Partial<QuizDraft>) => void };

/** Multiple choice: the options, and a radio for the right one. */
function ChoicesEditor({ draft, patch }: SectionProps) {
  return (
    <div>
      <div className="hgadm-field__label hgadm-mb-8">선택지 (정답 라디오 선택)</div>
      {draft.choices.map((choice, i) => (
        <div className="hgadm-row hgadm-mb-8" key={i}>
          <input
            type="radio"
            name="correct"
            checked={draft.correct_choice === choice.key}
            onChange={() => patch({ correct_choice: choice.key })}
            aria-label={`정답: 선택지 ${choice.key}`}
          />
          <span className="hgadm-choice-no">{choice.key}</span>
          <Input
            value={choice.text}
            onChange={(e) => {
              const choices = [...draft.choices];
              choices[i] = { ...choice, text: e.target.value };
              patch({ choices });
            }}
          />
        </div>
      ))}
    </div>
  );
}

/** Short answer: labelled blanks; a blank without an answer is graded on criteria. */
function BlanksEditor({ draft, patch }: SectionProps) {
  const setBlank = (i: number, changes: Partial<QuizDraft["blanks"][number]>) => {
    const blanks = [...draft.blanks];
    blanks[i] = { ...blanks[i], ...changes };
    patch({ blanks });
  };
  return (
    <div>
      <div className="hgadm-field__label hgadm-mb-8">빈칸 (라벨 + 정답 · 정답을 비우면 기준 채점)</div>
      {draft.blanks.map((blank, i) => (
        <div className="hgadm-row hgadm-mb-8" key={i}>
          <Input
            className="hgadm-w-sm"
            placeholder="라벨 (ㄱ)"
            value={blank.label}
            onChange={(e) => setBlank(i, { label: e.target.value })}
          />
          <Input placeholder="정답" value={blank.answer} onChange={(e) => setBlank(i, { answer: e.target.value })} />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => patch({ blanks: draft.blanks.filter((_, j) => j !== i) })}
            aria-label="삭제"
          >
            <X size={16} strokeWidth={2} />
          </Button>
        </div>
      ))}
      <Button size="sm" onClick={() => patch({ blanks: [...draft.blanks, { label: "", answer: "" }] })}>
        + 빈칸 추가
      </Button>
    </div>
  );
}

/** Rubric scoring: length limits, the maximum score and the criteria. */
function ScoringFields({ draft, patch }: SectionProps) {
  const freeResponse = draft.answer_format === "free_response";
  return (
    <div className="hgadm-form-grid hgadm-mt-12">
      <Field label="최대 글자 수" required={freeResponse}>
        <Input type="number" min={1} value={draft.answer_max_length} onChange={(e) => patch({ answer_max_length: e.target.value })} />
      </Field>
      {freeResponse && (
        <Field label="최소 글자 수">
          <Input
            type="number"
            min={0}
            value={draft.answer_min_length}
            onChange={(e) => patch({ answer_min_length: e.target.value })}
          />
        </Field>
      )}
      <Field label="만점">
        <Input type="number" min={1} value={draft.max_score} onChange={(e) => patch({ max_score: e.target.value })} />
      </Field>
      <div className="span-2">
        <Field label="채점 기준" hint="한 줄에 하나씩">
          <Textarea rows={3} value={draft.scoring_criteria} onChange={(e) => patch({ scoring_criteria: e.target.value })} />
        </Field>
      </div>
    </div>
  );
}

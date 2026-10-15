import { CONVERSATION_LEVELS } from "../../../lib/levels";
import { Button, Field, Input, Modal, Select, Textarea } from "../../components/kit";
import { useTopicNames } from "../../lib/topicNames";
import type { SentenceDraft } from "./draft";

/** Creating or editing a sentence. */
export function SentenceEditor({
  draft,
  setDraft,
  editing,
  saving,
  onSave,
}: {
  draft: SentenceDraft | null;
  setDraft: (draft: SentenceDraft | null) => void;
  editing: boolean;
  saving: boolean;
  onSave: (draft: SentenceDraft) => void;
}) {
  const { topicName, isNamed } = useTopicNames();
  const close = () => setDraft(null);
  const patch = (changes: Partial<SentenceDraft>) => draft && setDraft({ ...draft, ...changes });
  const topic = draft?.topic.trim() ?? "";
  return (
    <Modal
      open={draft !== null}
      title={editing ? "문장 수정" : "문장 추가"}
      size="lg"
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            취소
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!draft?.korean.trim() || !draft?.translation.trim()}
            onClick={() => draft && onSave(draft)}
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
              draft.blanked ? "빈칸이 있는 문장은 원문을 바꾸면 빈칸 위치가 어긋나므로 여기서 수정할 수 없습니다." : undefined
            }
          >
            <Textarea rows={2} value={draft.korean} readOnly={draft.blanked} onChange={(e) => patch({ korean: e.target.value })} />
          </Field>
          <Field label="번역 (영어)" required>
            <Textarea rows={2} value={draft.translation} onChange={(e) => patch({ translation: e.target.value })} />
          </Field>
          <Field label="로마자 표기">
            <Input value={draft.romanization} onChange={(e) => patch({ romanization: e.target.value })} />
          </Field>
          <div className="hgadm-form-grid">
            <Field
              label="주제"
              hint={
                topic
                  ? isNamed(topic)
                    ? topicName(topic)
                    : "새 주제 — 커리큘럼에 이름이 없어 코드로 표시돼요"
                  : "영문 코드 (예: cafe, travel)"
              }
            >
              <Input
                value={draft.topic}
                maxLength={80}
                onChange={(e) => patch({ topic: e.target.value })}
                placeholder="cafe, travel …"
              />
            </Field>
            <Field label="레벨" required>
              <Select value={draft.level} onChange={(e) => patch({ level: e.target.value })}>
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
              onChange={(e) => patch({ grammar_points: e.target.value })}
              placeholder="-습니다, -고 싶다"
            />
          </Field>
        </div>
      )}
    </Modal>
  );
}

import { Button, Field, Input, Modal, Select, Textarea } from "../../components/kit";
import { AUTHORING_LANGUAGES, CATEGORIES, completedLocales, type FaqDraft, type FaqText } from "./draft";

/** Creating or editing a FAQ, in every authoring language. */
export function FaqEditor({
  draft,
  isNew,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  draft: FaqDraft | null;
  isNew: boolean;
  saving: boolean;
  onChange: (draft: FaqDraft) => void;
  onClose: () => void;
  onSave: (draft: FaqDraft) => void;
}) {
  const setText = (code: string, changes: Partial<FaqText>) => {
    if (!draft) return;
    const current = draft.text[code] ?? { question: "", answer: "" };
    onChange({ ...draft, text: { ...draft.text, [code]: { ...current, ...changes } } });
  };
  return (
    <Modal
      open={draft !== null}
      title={isNew ? "FAQ 추가" : "FAQ 수정"}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button
            variant="primary"
            loading={saving}
            // At least one language must be fully filled in — the API rejects a
            // FAQ with no translations, and a half-filled language.
            disabled={!draft || completedLocales(draft).length === 0}
            onClick={() => draft && onSave(draft)}
          >
            저장
          </Button>
        </>
      }
    >
      {draft && (
        <div>
          <div className="hgadm-form-grid">
            <Field
              label="카테고리"
              required
              hint={isNew ? "새 FAQ는 카테고리의 맨 뒤에 놓여요. 순서는 목록에서 ↑ / ↓ 로 바꿔요." : undefined}
            >
              <Select value={draft.category} onChange={(e) => onChange({ ...draft, category: e.target.value })}>
                {CATEGORIES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {AUTHORING_LANGUAGES.map(({ code, nativeLabel }) => (
            <div key={code} className="hgadm-form-section">
              <div className="hgadm-form-section__title">{nativeLabel}</div>
              <Field label={`질문 (${nativeLabel})`} hint="2~300자">
                <Input
                  value={draft.text[code]?.question ?? ""}
                  maxLength={300}
                  onChange={(e) => setText(code, { question: e.target.value })}
                />
              </Field>
              <Field label={`답변 (${nativeLabel})`}>
                <Textarea rows={5} value={draft.text[code]?.answer ?? ""} onChange={(e) => setText(code, { answer: e.target.value })} />
              </Field>
            </div>
          ))}
          <p className="hgadm-muted hgadm-text-xs hgadm-mt-0">
            한 언어만 입력해도 저장됩니다. 비워 둔 언어의 사용자에게는 입력된 언어가 대신 보여집니다.
          </p>
          <label className="hgadm-checkbox">
            <input type="checkbox" checked={draft.published} onChange={(e) => onChange({ ...draft, published: e.target.checked })} />
            저장과 동시에 게시
          </label>
        </div>
      )}
    </Modal>
  );
}

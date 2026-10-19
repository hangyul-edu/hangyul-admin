import { Button, Field, Input, Modal, Textarea } from "../../components/kit";
import { draftTranslations, type NoticeDraft } from "./draft";

/** Writing or editing a notice in Korean and English. */
export function NoticeEditor({
  draft,
  setDraft,
  editing,
  saving,
  onSave,
}: {
  draft: NoticeDraft | null;
  setDraft: (draft: NoticeDraft | null) => void;
  editing: boolean;
  saving: boolean;
  onSave: (draft: NoticeDraft) => void;
}) {
  const close = () => setDraft(null);
  const patch = (changes: Partial<NoticeDraft>) => draft && setDraft({ ...draft, ...changes });
  // At least one language fully written; a half-filled one is not sent.
  const valid = draft !== null && draftTranslations(draft).length > 0;
  return (
    <Modal
      open={draft !== null}
      title={editing ? "공지 수정" : "공지 작성"}
      size="lg"
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            취소
          </Button>
          <Button variant="primary" loading={saving} disabled={!valid} onClick={() => draft && onSave(draft)}>
            저장
          </Button>
        </>
      }
    >
      {draft && (
        <div>
          <div className="hgadm-grid-2">
            <div>
              <Field label="제목 (한국어)" required>
                <Input value={draft.ko_title} maxLength={200} onChange={(e) => patch({ ko_title: e.target.value })} />
              </Field>
              <Field label="본문 (한국어)" required>
                <Textarea rows={7} value={draft.ko_body} onChange={(e) => patch({ ko_body: e.target.value })} />
              </Field>
            </div>
            <div>
              <Field label="제목 (영어)">
                <Input value={draft.en_title} maxLength={200} onChange={(e) => patch({ en_title: e.target.value })} />
              </Field>
              <Field label="본문 (영어)">
                <Textarea rows={7} value={draft.en_body} onChange={(e) => patch({ en_body: e.target.value })} />
              </Field>
            </div>
          </div>
          <div className="hgadm-row hgadm-row--wrap hgadm-row--spacious">
            <label className="hgadm-checkbox">
              <input type="checkbox" checked={draft.pinned} onChange={(e) => patch({ pinned: e.target.checked })} />
              상단 고정
            </label>
            <label className="hgadm-checkbox">
              <input type="checkbox" checked={draft.published} onChange={(e) => patch({ published: e.target.checked })} />
              저장과 동시에 게시
            </label>
          </div>
          {!editing && <p className="hgadm-field__hint">새 공지는 목록의 맨 뒤에 놓여요. 순서는 목록에서 ↑ / ↓ 로 바꿔요.</p>}
        </div>
      )}
    </Modal>
  );
}

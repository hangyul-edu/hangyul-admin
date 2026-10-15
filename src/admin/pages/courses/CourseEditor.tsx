import { Button, Field, Modal, Select } from "../../components/kit";
import { ImageDropzone } from "../../components/ImageDropzone";
import { LanguageFields } from "../../components/LanguageFields";
import { TRACKS } from "../../lib/tracks";
import type { CourseDraft } from "./useCourses";

/** Creating or editing a course: its track (fixed once created), text and cover. */
export function CourseEditor({
  draft,
  setDraft,
  editing,
  saving,
  onSave,
}: {
  draft: CourseDraft | null;
  setDraft: (draft: CourseDraft | null) => void;
  editing: boolean;
  saving: boolean;
  onSave: (draft: CourseDraft) => void;
}) {
  const close = () => setDraft(null);
  return (
    <Modal
      open={draft !== null}
      title={editing ? "코스 수정" : "코스 추가"}
      size="lg"
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            취소
          </Button>
          <Button variant="primary" loading={saving} disabled={!draft?.text.en.title.trim()} onClick={() => draft && onSave(draft)}>
            저장
          </Button>
        </>
      }
    >
      {draft && (
        <div>
          <div className="hgadm-form-grid">
            <Field
              label="학습 분야"
              required
              hint={editing ? "학습 분야는 변경할 수 없습니다." : "새 코스는 이 학습 분야의 맨 뒤에 놓여요. 순서는 목록에서 ↑ / ↓ 로 바꿔요."}
            >
              <Select value={draft.track_id} disabled={editing} onChange={(e) => setDraft({ ...draft, track_id: e.target.value })}>
                {TRACKS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <LanguageFields noun="코스" titleMaxLength={200} value={draft.text} onChange={(text) => setDraft({ ...draft, text })} />
          <Field label="대표 이미지" hint="JPEG/PNG/WebP, 최대 5MB">
            <div>
              {draft.cover_image_url && (
                <img src={draft.cover_image_url} alt="대표 이미지 미리보기" className="hgadm-thumb hgadm-cover-preview" />
              )}
              <ImageDropzone replacing={!!draft.cover_image_url} onUploaded={(url) => setDraft({ ...draft, cover_image_url: url })} />
            </div>
          </Field>
        </div>
      )}
    </Modal>
  );
}

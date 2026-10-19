import { Button, Field, Input, Modal, Switch } from "../../components/kit";
import { CardImageSizeHint, ImageCropField } from "../../components/ImageCropField";
import { ImageDropzone } from "../../components/ImageDropzone";
import type { BannerDraft } from "./useHomeCards";

type SetDraft = (update: (d: BannerDraft | null) => BannerDraft | null) => void;

/** Creating or editing a banner: the picture and its crop, text, link, window. */
export function BannerEditor({
  draft,
  setDraft,
  editing,
  canUploadImage,
  saving,
  onSave,
}: {
  draft: BannerDraft | null;
  setDraft: SetDraft;
  editing: boolean;
  canUploadImage: boolean;
  saving: boolean;
  onSave: (draft: BannerDraft) => void;
}) {
  const close = () => setDraft(() => null);
  const patch = (changes: Partial<BannerDraft>) => setDraft((d) => (d ? { ...d, ...changes } : d));
  return (
    <Modal
      open={draft !== null}
      title={editing ? "배너 수정" : "배너 추가"}
      size="lg"
      onClose={close}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            취소
          </Button>
          <Button variant="primary" loading={saving} disabled={!draft?.image_url} onClick={() => draft && onSave(draft)}>
            저장
          </Button>
        </>
      }
    >
      {draft && (
        <div>
          <Field label="배너 이미지" required>
            <div>
              <p className="hgadm-cell-sub hgadm-mt-0 hgadm-mb-8">
                <CardImageSizeHint />
              </p>
              {draft.image_url ? (
                <ImageCropField imageUrl={draft.image_url} value={draft.image_crop} onChange={(image_crop) => patch({ image_crop })} />
              ) : null}
              {canUploadImage ? (
                // A new picture starts from the centred default; the old crop
                // was for the old one.
                <ImageDropzone
                  replacing={!!draft.image_url}
                  successMessage="이미지를 업로드했어요."
                  onUploaded={(url) => patch({ image_url: url, image_crop: null })}
                />
              ) : (
                <p className="hgadm-cell-sub hgadm-m-0">
                  이미지 변경은 콘텐츠 편집 권한이 필요합니다. 나머지 항목은 그대로 수정할 수 있어요.
                </p>
              )}
            </div>
          </Field>
          <Field label="대체 텍스트" hint="스크린 리더가 읽는 설명">
            <Input value={draft.alt_text} maxLength={200} onChange={(e) => patch({ alt_text: e.target.value })} />
          </Field>
          <Field label="이동 링크" hint="앱 내 경로 (예: /subscription). 비우면 클릭 불가.">
            <Input value={draft.action_url} maxLength={300} onChange={(e) => patch({ action_url: e.target.value })} />
          </Field>
          <div className="hgadm-form-grid">
            <Field label="노출 시작" hint="KST 기준. 비우면 즉시">
              <Input type="datetime-local" value={draft.starts_at} onChange={(e) => patch({ starts_at: e.target.value })} />
            </Field>
            <Field label="노출 종료" hint="KST 기준. 비우면 무기한">
              <Input type="datetime-local" value={draft.ends_at} onChange={(e) => patch({ ends_at: e.target.value })} />
            </Field>
          </div>
          <Field label="활성화">
            <div className="hgadm-row">
              <Switch checked={draft.is_active} onChange={(next) => patch({ is_active: next })} label="활성화" />
              <span className="hgadm-text-sm">{draft.is_active ? "저장 즉시 노출됩니다" : "저장 후에도 숨김 상태"}</span>
            </div>
          </Field>
        </div>
      )}
    </Modal>
  );
}

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageIcon } from "lucide-react";
import { MoveButtons, OrderNumber } from "../components/ordering";
import { CardImageSizeHint, ImageCropField } from "../components/ImageCropField";
import { croppedImageStyle } from "../../lib/imageCrop";
import type { ImageCrop } from "../../lib/imageCrop";
import { adminApi } from "../api";
import type { AdminBanner } from "../api";
import { errorMessage } from "../../lib/http";
import { useToast, useToastError } from "../../hooks/toast";
import { useAdminAuth } from "../auth";
import {
  Badge,
  Button,
  ConfirmDialog,
  ErrorState,
  Field,
  Input,
  LoadingState,
  Modal,
  Switch,
  Thumb,
} from "../components/kit";
import {
  formatDateTime,
  fromAdminInputValue,
  toAdminInputValue,
} from "../lib/format";

interface BannerDraft {
  image_url: string;
  /** The part of the image the app shows; null = centred cover crop. */
  image_crop: ImageCrop | null;
  alt_text: string;
  action_url: string;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
}

const EMPTY: BannerDraft = {
  image_url: "",
  image_crop: null,
  alt_text: "",
  action_url: "",
  is_active: true,
  starts_at: "",
  ends_at: "",
};

export function BannersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const { can } = useAdminAuth();
  const canWrite = can("ops:write");
  /* The image goes through POST /admin/media, which the backend gates on
     `content:write` — a different scope from the rest of this page. A support
     agent holds ops:write and not content:write, so they could open the
     editor, click the dropzone and collect a 403; and since an image is
     required, they could never finish a banner they had been invited to
     start. Creating needs both scopes; everything that does not touch an
     image (reorder, visibility, delete, editing the text of a banner that
     already has one) still needs only ops:write. */
  const canUploadImage = can("content:write");
  const [draft, setDraft] = useState<BannerDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AdminBanner | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const query = useQuery({ queryKey: ["admin", "banners"], queryFn: adminApi.listBanners });

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["admin", "banners"] });
  }

  const save = useMutation({
    mutationFn: (d: BannerDraft) => {
      const body = {
        image_url: d.image_url,
        image_crop: d.image_crop,
        alt_text: d.alt_text,
        // null (not omitted) so emptying a field on edit clears it — either
        // end of the window can be removed on its own.
        action_url: d.action_url || null,
        is_active: d.is_active,
        starts_at: fromAdminInputValue(d.starts_at),
        ends_at: fromAdminInputValue(d.ends_at),
      };
      return editingId
        ? adminApi.updateBanner(editingId, body)
        : adminApi.createBanner(body);
    },
    onSuccess: () => {
      toast.success("배너를 저장했어요.");
      setDraft(null);
      setEditingId(null);
      refresh();
    },
    onError: toastError,
  });

  const toggleActive = useMutation({
    mutationFn: (banner: AdminBanner) =>
      adminApi.updateBanner(banner.banner_id, { is_active: !banner.is_active }),
    onSuccess: refresh,
    onError: toastError,
  });

  const move = useMutation({
    mutationFn: async ({ id, dir }: { id: string; dir: -1 | 1 }) => {
      const items = query.data?.items ?? [];
      const ids = items.map((b) => b.banner_id);
      const index = ids.indexOf(id);
      const target = index + dir;
      if (target < 0 || target >= ids.length) return null;
      [ids[index], ids[target]] = [ids[target], ids[index]];
      return adminApi.reorderBanners(ids);
    },
    onSuccess: refresh,
    onError: toastError,
  });

  const remove = useMutation({
    mutationFn: (banner: AdminBanner) => adminApi.deleteBanner(banner.banner_id),
    onSuccess: () => {
      toast.success("배너를 삭제했어요.");
      setDeleting(null);
      refresh();
    },
    onError: toastError,
  });

  async function onFileChosen(file: File | undefined) {
    if (!file || !draft) return;
    setUploading(true);
    try {
      const result = await adminApi.uploadMedia(file);
      // A new picture starts from the centred default; the old crop was for
      // the old one.
      setDraft({ ...draft, image_url: result.url, image_crop: null });
      toast.success("이미지를 업로드했어요.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>배너 관리</h1>
          <div className="hgadm-page-head__desc">
            강의 홈 상단 슬라이드 배너입니다. 앱에서 아래 순서대로 넘어가요 — ↑ / ↓ 로 바꾸면 바로 저장돼요. 노출
            기간을 지정하면 그 기간에만 표시됩니다.
          </div>
        </div>
        {canWrite && canUploadImage && (
          <div className="hgadm-page-head__actions">
            <Button
              variant="primary"
              onClick={() => {
                setEditingId(null);
                setDraft({ ...EMPTY });
              }}
            >
              + 배너 추가
            </Button>
          </div>
        )}
      </div>

      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data.items.length === 0 ? (
        <div className="hgadm-card">
          <div className="hgadm-state">
            <div className="hgadm-state__icon" aria-hidden>
              <ImageIcon size={28} strokeWidth={1.75} />
            </div>
            <div className="hgadm-state__title">등록된 배너가 없습니다</div>
            <div className="hgadm-state__desc">
              배너를 추가하면 앱의 강의 홈 상단에 노출됩니다.
            </div>
          </div>
        </div>
      ) : (
        <div className="hgadm-stack">
          {query.data.items.map((banner, index) => (
            <div
              key={banner.banner_id}
              className="hgadm-card hgadm-banner-row"
            >
              <OrderNumber position={index + 1} />
              {/* As the app shows it: the card's 15:8 with the chosen crop. */}
              <Thumb
                className="hgadm-crop-thumb"
                src={banner.image_url}
                alt={banner.alt_text}
                imgStyle={banner.image_crop ? croppedImageStyle(banner.image_crop) : undefined}
              />
              <div className="hgadm-banner-row__info">
                <div className="hgadm-row hgadm-row--wrap">
                  <Badge tone={banner.is_active ? "success" : "neutral"} dot>
                    {banner.is_active ? "노출 중" : "비활성"}
                  </Badge>
                  {banner.action_url && (
                    <span className="hgadm-cell-mono hgadm-text-xs">
                      → {banner.action_url}
                    </span>
                  )}
                </div>
                <div className="hgadm-cell-sub hgadm-mt-4">
                  {banner.alt_text || "(대체 텍스트 없음)"}
                </div>
                <div className="hgadm-cell-sub">
                  {banner.starts_at || banner.ends_at
                    ? `${formatDateTime(banner.starts_at)} ~ ${formatDateTime(banner.ends_at)}`
                    : "상시 노출"}
                </div>
              </div>
              {canWrite && (
                <div className="hgadm-row">
                  <MoveButtons
                    name={banner.alt_text || "배너"}
                    index={index}
                    count={query.data.items.length}
                    disabled={move.isPending}
                    onMove={(dir) => move.mutate({ id: banner.banner_id, dir })}
                  />
                  <Switch
                    checked={banner.is_active}
                    onChange={() => toggleActive.mutate(banner)}
                    label="노출 여부"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingId(banner.banner_id);
                      setDraft({
                        image_url: banner.image_url,
                        image_crop: banner.image_crop ?? null,
                        alt_text: banner.alt_text,
                        action_url: banner.action_url ?? "",
                        is_active: banner.is_active,
                        starts_at: toAdminInputValue(banner.starts_at),
                        ends_at: toAdminInputValue(banner.ends_at),
                      });
                    }}
                  >
                    수정
                  </Button>
                  <Button
                    size="sm"
                    variant="danger-soft"
                    onClick={() => setDeleting(banner)}
                  >
                    삭제
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={draft !== null}
        title={editingId ? "배너 수정" : "배너 추가"}
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
              disabled={!draft?.image_url}
              onClick={() => draft && save.mutate(draft)}
            >
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
                  <ImageCropField
                    imageUrl={draft.image_url}
                    value={draft.image_crop}
                    onChange={(image_crop) => setDraft((d) => (d ? { ...d, image_crop } : d))}
                  />
                ) : null}
                {canUploadImage ? (
                  <div
                    className="hgadm-dropzone"
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      void onFileChosen(e.dataTransfer.files?.[0]);
                    }}
                  >
                    {uploading ? (
                      <span>업로드 중…</span>
                    ) : (
                      <span>
                        클릭하거나 파일을 끌어다 놓아 {draft.image_url ? "교체" : "업로드"}
                      </span>
                    )}
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => void onFileChosen(e.target.files?.[0])}
                    />
                  </div>
                ) : (
                  <p className="hgadm-cell-sub hgadm-m-0">
                    이미지 변경은 콘텐츠 편집 권한이 필요합니다. 나머지 항목은 그대로
                    수정할 수 있어요.
                  </p>
                )}
              </div>
            </Field>
            <Field label="대체 텍스트" hint="스크린 리더가 읽는 설명">
              <Input
                value={draft.alt_text}
                maxLength={200}
                onChange={(e) => setDraft({ ...draft, alt_text: e.target.value })}
              />
            </Field>
            <Field label="이동 링크" hint="앱 내 경로 (예: /subscription). 비우면 클릭 불가.">
              <Input
                value={draft.action_url}
                maxLength={300}
                onChange={(e) => setDraft({ ...draft, action_url: e.target.value })}
              />
            </Field>
            <div className="hgadm-form-grid">
              <Field label="노출 시작" hint="KST 기준. 비우면 즉시">
                <Input
                  type="datetime-local"
                  value={draft.starts_at}
                  onChange={(e) => setDraft({ ...draft, starts_at: e.target.value })}
                />
              </Field>
              <Field label="노출 종료" hint="KST 기준. 비우면 무기한">
                <Input
                  type="datetime-local"
                  value={draft.ends_at}
                  onChange={(e) => setDraft({ ...draft, ends_at: e.target.value })}
                />
              </Field>
            </div>
            <Field label="활성화">
              <div className="hgadm-row">
                <Switch
                  checked={draft.is_active}
                  onChange={(next) => setDraft({ ...draft, is_active: next })}
                  label="활성화"
                />
                <span className="hgadm-text-sm">
                  {draft.is_active ? "저장 즉시 노출됩니다" : "저장 후에도 숨김 상태"}
                </span>
              </div>
            </Field>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="배너 삭제"
        message="배너를 영구 삭제할까요? 잠시 내리려면 삭제 대신 노출 스위치를 끄는 것을 권장합니다."
        danger
        confirmLabel="삭제"
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

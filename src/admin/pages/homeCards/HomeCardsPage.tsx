import { useState } from "react";
import { ImageIcon } from "lucide-react";
import type { AdminBanner } from "../../api";
import { errorMessage } from "../../../lib/http";
import { croppedImageStyle } from "../../../lib/imageCrop";
import { useAdminAuth } from "../../auth";
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, LoadingState, Switch, Thumb } from "../../components/kit";
import { MoveButtons, OrderNumber } from "../../components/ordering";
import { formatDateTime } from "../../lib/format";
import { BannerEditor } from "./HomeCardEditor";
import { draftFromBanner, emptyBannerDraft, useBannerList, useBannerMutations, type BannerDraft } from "./useHomeCards";

/** 배너 관리: the lecture home's slides, in the order the app shows them. */
export function BannersPage() {
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

  const query = useBannerList();
  const { save, toggleActive, reorder, remove } = useBannerMutations({
    onSaved: () => {
      setDraft(null);
      setEditingId(null);
    },
    onDeleted: () => setDeleting(null),
  });

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>배너 관리</h1>
          <div className="hgadm-page-head__desc">
            강의 홈 상단 슬라이드 배너입니다. 앱에서 아래 순서대로 넘어가요 — ↑ / ↓ 로 바꾸면 바로 저장돼요. 노출 기간을
            지정하면 그 기간에만 표시됩니다.
          </div>
        </div>
        {canWrite && canUploadImage && (
          <div className="hgadm-page-head__actions">
            <Button
              variant="primary"
              onClick={() => {
                setEditingId(null);
                setDraft(emptyBannerDraft());
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
          <EmptyState
            icon={<ImageIcon size={28} strokeWidth={1.75} />}
            title="등록된 배너가 없습니다"
            desc="배너를 추가하면 앱의 강의 홈 상단에 노출됩니다."
          />
        </div>
      ) : (
        <div className="hgadm-stack">
          {query.data.items.map((banner, index, all) => (
            <div key={banner.banner_id} className="hgadm-card hgadm-slide-row">
              <OrderNumber position={index + 1} />
              {/* As the app shows it: the card's 15:8 with the chosen crop. */}
              <Thumb
                className="hgadm-crop-thumb"
                src={banner.image_url}
                alt={banner.alt_text}
                imgStyle={banner.image_crop ? croppedImageStyle(banner.image_crop) : undefined}
              />
              <div className="hgadm-slide-row__info">
                <div className="hgadm-row hgadm-row--wrap">
                  <Badge tone={banner.is_active ? "success" : "neutral"} dot>
                    {banner.is_active ? "노출 중" : "비활성"}
                  </Badge>
                  {banner.action_url && <span className="hgadm-cell-mono hgadm-text-xs">→ {banner.action_url}</span>}
                </div>
                <div className="hgadm-cell-sub hgadm-mt-4">{banner.alt_text || "(대체 텍스트 없음)"}</div>
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
                    count={all.length}
                    disabled={reorder.saving}
                    onMove={(dir) => reorder.move(all.map((b) => b.banner_id), banner.banner_id, dir)}
                  />
                  <Switch checked={banner.is_active} onChange={() => toggleActive.mutate(banner)} label="노출 여부" />
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingId(banner.banner_id);
                      setDraft(draftFromBanner(banner));
                    }}
                  >
                    수정
                  </Button>
                  <Button size="sm" variant="danger-soft" onClick={() => setDeleting(banner)}>
                    삭제
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <BannerEditor
        draft={draft}
        setDraft={setDraft}
        editing={editingId !== null}
        canUploadImage={canUploadImage}
        saving={save.isPending}
        onSave={(d) => save.mutate({ id: editingId, draft: d })}
      />

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

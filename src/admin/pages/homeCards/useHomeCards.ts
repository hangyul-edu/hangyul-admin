import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../api";
import type { AdminBanner } from "../../api";
import { useToast, useToastError } from "../../../hooks/toast";
import type { ImageCrop } from "../../../lib/imageCrop";
import { useReorder } from "../../components/ordering";
import { fromAdminInputValue, toAdminInputValue } from "../../lib/format";

const BANNERS_KEY =["admin", "banners"];

/** The editor's working copy of a banner; the window is in datetime-local form. */
export interface BannerDraft {
  image_url: string;
  /** The part of the image the app shows; null = centred cover crop. */
  image_crop: ImageCrop | null;
  alt_text: string;
  action_url: string;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
}

export function emptyBannerDraft(): BannerDraft {
  return { image_url: "", image_crop: null, alt_text: "", action_url: "", is_active: true, starts_at: "", ends_at: "" };
}

export function draftFromBanner(banner: AdminBanner): BannerDraft {
  return {
    image_url: banner.image_url,
    image_crop: banner.image_crop ?? null,
    alt_text: banner.alt_text,
    action_url: banner.action_url ?? "",
    is_active: banner.is_active,
    starts_at: toAdminInputValue(banner.starts_at),
    ends_at: toAdminInputValue(banner.ends_at),
  };
}

function bannerBody(d: BannerDraft) {
  return {
    image_url: d.image_url,
    image_crop: d.image_crop,
    alt_text: d.alt_text,
    // null (not omitted) so emptying a field on edit clears it — either end of
    // the window can be removed on its own.
    action_url: d.action_url || null,
    is_active: d.is_active,
    starts_at: fromAdminInputValue(d.starts_at),
    ends_at: fromAdminInputValue(d.ends_at),
  };
}

export function useBannerList() {
  return useQuery({ queryKey: BANNERS_KEY, queryFn: adminApi.listBanners });
}

/** Saving, showing/hiding, reordering and deleting banners. */
export function useBannerMutations({ onSaved, onDeleted }: { onSaved: () => void; onDeleted: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const refresh = () => void qc.invalidateQueries({ queryKey: BANNERS_KEY });

  const save = useMutation({
    mutationFn: ({ id, draft }: { id: string | null; draft: BannerDraft }) =>
      id ? adminApi.updateBanner(id, bannerBody(draft)) : adminApi.createBanner(bannerBody(draft)),
    onSuccess: () => {
      toast.success("배너를 저장했어요.");
      onSaved();
      refresh();
    },
    onError: toastError,
  });

  const toggleActive = useMutation({
    mutationFn: (banner: AdminBanner) => adminApi.updateBanner(banner.banner_id, { is_active: !banner.is_active }),
    onSuccess: refresh,
    onError: toastError,
  });

  // The app shows banners in this order; a move is applied at once and rolled
  // back if the server refuses it, as on the other ordered lists.
  const reorder = useReorder<AdminBanner>({
    queryKey: BANNERS_KEY,
    idOf: (b) => b.banner_id,
    save: (ids) => adminApi.reorderBanners(ids),
  });

  const remove = useMutation({
    mutationFn: (banner: AdminBanner) => adminApi.deleteBanner(banner.banner_id),
    onSuccess: () => {
      toast.success("배너를 삭제했어요.");
      onDeleted();
      refresh();
    },
    onError: toastError,
  });

  return { save, toggleActive, reorder, remove };
}

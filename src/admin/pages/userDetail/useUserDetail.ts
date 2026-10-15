import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "../../api";
import type { AdminTier } from "../../api";
import { useToast, useToastError } from "../../../hooks/toast";
import { ADMIN_TIER_LABEL } from "../../lib/adminTiers";

export type UserUpdate = { role?: string; status?: string; nickname?: string; reason?: string };

const userKey = (userId: string) => ["admin", "user", userId];

export function useUserDetail(userId: string) {
  return useQuery({ queryKey: userKey(userId), queryFn: () => adminApi.userDetail(userId), enabled: Boolean(userId) });
}

/** Changing a member's role, status or nickname; the detail and the directory both refresh. */
export function useUpdateUser(userId: string, onDone: () => void) {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  return useMutation({
    mutationFn: (body: UserUpdate) => adminApi.updateUser(userId, body),
    onSuccess: () => {
      toast.success("변경 사항이 저장되었어요.");
      onDone();
      void qc.invalidateQueries({ queryKey: userKey(userId) });
      void qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: toastError,
  });
}

/**
 * Promotion goes through /admin/admins, the same endpoint the admin-accounts
 * page uses — it is the only path that carries the `admins:manage` check and
 * writes the tier row, so the user directory never becomes a second way to
 * hand out privileges. The action on this page is a shortcut to it, not a
 * bypass.
 */
export function usePromoteToAdmin(userId: string, { onDone, onRefused }: { onDone: () => void; onRefused: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  return useMutation({
    mutationFn: (grant: { email: string; tier: AdminTier; note: string }) =>
      adminApi.grantAdmin({ email: grant.email, admin_role: grant.tier, note: grant.note.trim() || undefined }),
    onSuccess: (account) => {
      toast.success(`관리자 권한을 부여했어요. (${ADMIN_TIER_LABEL[account.admin_role] ?? account.admin_role})`);
      onDone();
      void qc.invalidateQueries({ queryKey: userKey(userId) });
      void qc.invalidateQueries({ queryKey: ["admin", "users"] });
      void qc.invalidateQueries({ queryKey: ["admin", "admins"] });
    },
    onError: (error) => {
      onRefused();
      toastError(error);
    },
  });
}

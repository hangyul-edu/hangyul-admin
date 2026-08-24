import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { errorMessage } from "../../lib/http";
import { useToast } from "../../hooks/toast";
import { Button, ConfirmDialog } from "./kit";

/**
 * Super-admin "danger zone" action: preview then permanently clear a whole
 * content dataset (all sentences or the whole TOPIK question bank). Shows the
 * live preview counts inside the shared destructive confirm dialog before the
 * irreversible delete — never a bare browser confirm(). Render only for
 * super-admins (gate on `can("admins:manage")` at the call site).
 */
export function ContentCleanupButton<T>({
  label,
  preview,
  clear,
  countLabels,
  invalidateKeys,
}: {
  label: string;
  preview: () => Promise<T>;
  clear: () => Promise<{ deleted: T }>;
  /** [key, Korean label] pairs, headline count first. */
  countLabels: [keyof T & string, string][];
  /** React-Query keys to invalidate after a successful purge. */
  invalidateKeys: unknown[][];
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);

  const previewQuery = useQuery({
    queryKey: ["content-cleanup-preview", label],
    queryFn: preview,
    enabled: open,
    staleTime: 0,
    gcTime: 0,
  });

  const mutation = useMutation({
    mutationFn: clear,
    onSuccess: (res) => {
      const [headKey, headLabel] = countLabels[0];
      toast.success(`${headLabel} ${Number(res.deleted[headKey]).toLocaleString()}건을 삭제했어요.`);
      for (const key of invalidateKeys) void qc.invalidateQueries({ queryKey: key });
      setOpen(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <Button variant="danger-soft" size="sm" onClick={() => setOpen(true)}>
        <Trash2 size={15} strokeWidth={2} />
        {label}
      </Button>
      <ConfirmDialog
        open={open}
        title={label}
        danger
        icon={<Trash2 size={24} strokeWidth={2} />}
        confirmLabel="영구 삭제"
        loading={mutation.isPending}
        onConfirm={() => mutation.mutate()}
        onCancel={() => setOpen(false)}
        message={
          <div style={{ textAlign: "left" }}>
            <p style={{ marginBottom: 10 }}>
              아래 데이터가 <strong>영구 삭제</strong>됩니다. 이 작업은 되돌릴 수 없습니다.
            </p>
            <dl className="hgadm-dl" style={{ gridTemplateColumns: "1fr auto", rowGap: 6 }}>
              {countLabels.map(([key, lbl]) => (
                <FragmentRow
                  key={key}
                  label={lbl}
                  value={previewQuery.isPending ? "…" : `${Number(previewQuery.data?.[key] ?? 0).toLocaleString()}건`}
                />
              ))}
            </dl>
            {previewQuery.isError && (
              <p className="hgadm-field__error" style={{ marginTop: 8 }}>
                미리보기를 불러오지 못했어요: {errorMessage(previewQuery.error)}
              </p>
            )}
          </div>
        }
      />
    </>
  );
}

function FragmentRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{value}</dd>
    </>
  );
}

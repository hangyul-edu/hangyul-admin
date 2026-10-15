import { useState } from "react";
import { ArrowLeft, Upload } from "lucide-react";
import type { BulkCheckResult } from "../api";
import { Button, Modal } from "./kit";
import type { FieldDoc, Item } from "./bulkImport/files";
import { PickStep } from "./bulkImport/PickStep";
import { ReviewStep } from "./bulkImport/ReviewStep";
import { useBulkImport } from "./bulkImport/useBulkImport";

export { MAX_ITEMS, parseItems } from "./bulkImport/files";
export type { FieldDoc } from "./bulkImport/files";

/**
 * Bulk import for content catalogues (sentences, TOPIK questions) from a JSON
 * file — or pasted JSON — in three steps:
 *
 * 1. pick a file (or drop it, or paste), with a downloadable example file and
 *    the field reference one click away;
 * 2. the server checks every row on its own (`…/batch/check`, nothing saved):
 *    ready, wrong (in Korean, naming the field), or a duplicate of an earlier
 *    row or of existing content;
 * 3. add the rows that are ready — duplicates skipped unless the admin keeps
 *    them — through the existing all-or-nothing `…/batch` endpoint. Rows with
 *    errors can be downloaded as a file to fix and upload again.
 */
export function BulkImportButton({
  noun,
  title,
  fields,
  template,
  templateFilename,
  check,
  submit,
  invalidateKeys,
}: {
  /** What one row is, e.g. "문장" or "문제". */
  noun: string;
  /** Modal title, e.g. "문장 일괄 추가". */
  title: string;
  fields: FieldDoc[];
  /** Pretty-printed example JSON, offered as a download and for pasting. */
  template: string;
  templateFilename: string;
  check: (items: Item[]) => Promise<BulkCheckResult>;
  submit: (items: Item[]) => Promise<{ created: number }>;
  /** React-Query keys to invalidate after a successful import. */
  invalidateKeys: unknown[][];
}) {
  const [open, setOpen] = useState(false);
  const state = useBulkImport({ check, submit, invalidateKeys, onImported: () => close() });
  const close = () => {
    setOpen(false);
    state.reset();
  };
  const { report, importing, toImport } = state;

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Upload size={15} strokeWidth={2} />
        JSON으로 일괄 추가
      </Button>
      <Modal
        open={open}
        title={title}
        size="xl"
        onClose={importing.isPending ? () => {} : close}
        footer={
          report ? (
            <>
              <Button variant="ghost" onClick={state.reset} disabled={importing.isPending}>
                <ArrowLeft size={15} strokeWidth={2} aria-hidden />
                다른 파일 고르기
              </Button>
              <Button
                variant="primary"
                loading={importing.isPending}
                disabled={toImport.length === 0}
                onClick={() => importing.mutate(toImport)}
              >
                {toImport.length ? `${toImport.length.toLocaleString()}건 추가` : "추가할 항목 없음"}
              </Button>
            </>
          ) : (
            <Button variant="ghost" onClick={close}>
              닫기
            </Button>
          )
        }
      >
        {report ? (
          <ReviewStep state={state} report={report} noun={noun} templateFilename={templateFilename} />
        ) : (
          <PickStep state={state} noun={noun} fields={fields} template={template} templateFilename={templateFilename} />
        )}
      </Modal>
    </>
  );
}

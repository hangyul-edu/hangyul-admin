import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { BulkCheckResult, BulkCheckRow } from "../../api";
import { useToast, useToastError } from "../../../hooks/toast";
import { parseItems, readText, type Item } from "./files";

export type Filter = "all" | "errors" | "duplicates";

/**
 * The import's state: what was loaded and from where, the server's row-by-row
 * check of it, and which rows will be added. Loading checks at once; importing
 * adds the rows that are ready (duplicates skipped unless kept).
 */
export function useBulkImport({
  check,
  submit,
  invalidateKeys,
  onImported,
}: {
  check: (items: Item[]) => Promise<BulkCheckResult>;
  submit: (items: Item[]) => Promise<{ created: number }>;
  invalidateKeys: unknown[][];
  onImported: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const [source, setSource] = useState<string | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [report, setReport] = useState<BulkCheckResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  const reset = () => {
    setSource(null);
    setItems(null);
    setReport(null);
    setParseError(null);
    setFilter("all");
    setSkipDuplicates(true);
  };

  const checking = useMutation({ mutationFn: check, onSuccess: setReport, onError: toastError });

  const importing = useMutation({
    mutationFn: submit,
    onSuccess: (res) => {
      toast.success(`${res.created.toLocaleString()}건을 추가했어요.`);
      for (const key of invalidateKeys) void qc.invalidateQueries({ queryKey: key });
      onImported();
    },
    onError: toastError,
  });

  /** Parse text from a file or the paste box, and have the server check it. */
  const load = (text: string, from: string) => {
    const parsed = parseItems(text);
    setParseError(parsed.error);
    if (!parsed.items) return;
    setSource(from);
    setItems(parsed.items);
    checking.mutate(parsed.items);
  };

  const readFile = async (file: File) => {
    if (!/\.json$/i.test(file.name) && file.type !== "application/json") {
      setParseError("JSON 파일(.json)만 올릴 수 있어요.");
      return;
    }
    try {
      load(await readText(file), file.name);
    } catch {
      setParseError("파일을 읽지 못했어요. 다시 골라 주세요.");
    }
  };

  const keep = (r: BulkCheckRow) => r.ok && !(skipDuplicates && r.duplicate);
  const toImport = report && items ? report.rows.filter(keep).map((r) => items[r.index]) : [];
  const failed = report && items ? report.rows.filter((r) => !r.ok).map((r) => items[r.index]) : [];
  const shown =
    report?.rows.filter((r) =>
      filter === "errors" ? !r.ok || r.warnings.length > 0 : filter === "duplicates" ? r.duplicate !== null : true,
    ) ?? [];

  return {
    source,
    report: report && items ? report : null,
    parseError,
    checking: checking.isPending,
    importing,
    skipDuplicates,
    setSkipDuplicates,
    filter,
    setFilter,
    toImport,
    failed,
    shown,
    load,
    readFile,
    reset,
  };
}

export type BulkImportState = ReturnType<typeof useBulkImport>;

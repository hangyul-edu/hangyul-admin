import { useRef, useState } from "react";
import type { DragEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, FileJson, Upload } from "lucide-react";
import type { BulkCheckResult, BulkCheckRow } from "../api";
import { useToast, useToastError } from "../../hooks/toast";
import { Badge, Button, Modal, Textarea } from "./kit";

export const MAX_ITEMS = 1000;

/** One documented field of the upload format. */
export interface FieldDoc {
  name: string;
  /** "필수", "선택", or a condition such as "객관식 필수". */
  need: string;
  meaning: string;
  example?: string;
}

type Item = Record<string, unknown>;
type Filter = "all" | "errors" | "duplicates";

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
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<string | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [report, setReport] = useState<BulkCheckResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [dragging, setDragging] = useState(false);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  const reset = () => {
    setSource(null);
    setItems(null);
    setReport(null);
    setParseError(null);
    setPasted("");
    setFilter("all");
    setSkipDuplicates(true);
  };
  const close = () => {
    setOpen(false);
    reset();
  };

  const checking = useMutation({
    mutationFn: check,
    onSuccess: setReport,
    onError: toastError,
  });

  const importing = useMutation({
    mutationFn: submit,
    onSuccess: (res) => {
      toast.success(`${res.created.toLocaleString()}건을 추가했어요.`);
      for (const key of invalidateKeys) void qc.invalidateQueries({ queryKey: key });
      close();
    },
    onError: toastError,
  });

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

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void readFile(file);
  };

  const keep = (r: BulkCheckRow) => r.ok && !(skipDuplicates && r.duplicate);
  const toImport = report && items ? report.rows.filter(keep).map((r) => items[r.index]) : [];
  const failed = report && items ? report.rows.filter((r) => !r.ok).map((r) => items[r.index]) : [];
  const shown =
    report?.rows.filter((r) =>
      filter === "errors" ? !r.ok || r.warnings.length > 0 : filter === "duplicates" ? r.duplicate !== null : true,
    ) ?? [];

  const reviewing = Boolean(report && items);

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
          reviewing ? (
            <>
              <Button variant="ghost" onClick={reset} disabled={importing.isPending}>
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
        {!reviewing ? (
          <div className="hgbulk">
            <label
              className={`hgbulk-drop${dragging ? " is-over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                aria-label="JSON 파일 선택"
                className="hgins-sr"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void readFile(file);
                  e.target.value = "";
                }}
              />
              <span className="hgbulk-drop__icon" aria-hidden>
                <FileJson size={26} strokeWidth={1.8} />
              </span>
              <span className="hgbulk-drop__title">
                {checking.isPending ? "파일을 확인하는 중…" : "JSON 파일을 여기에 끌어다 놓거나, 눌러서 고르세요"}
              </span>
              <span className="hgbulk-drop__hint">
                {noun} 목록이 담긴 .json 파일 · 한 번에 최대 {MAX_ITEMS.toLocaleString()}건 · 올리면 저장 전에 한 줄씩 확인해요
              </span>
            </label>
            {parseError && (
              <p className="hgadm-field__error" role="alert" style={{ marginTop: 10 }}>
                {parseError}
              </p>
            )}

            <div className="hgbulk-help">
              <Button size="sm" variant="secondary" onClick={() => downloadJson(template, templateFilename)}>
                <Download size={15} strokeWidth={2} aria-hidden />
                예시 파일 받기
              </Button>
              <span className="hgins-cta__hint">예시 파일을 열어 같은 모양으로 채운 뒤 올리면 돼요. 각 항목의 뜻은 아래 설명에 있어요.</span>
            </div>

            <details className="hgins-more">
              <summary>항목 설명 보기 ({fields.length}개)</summary>
              <div className="hgins-more__body">
                <table className="hgadm-table hgbulk-fields">
                  <thead>
                    <tr>
                      <th>항목</th>
                      <th>필요</th>
                      <th>뜻</th>
                      <th>예시</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((fd) => (
                      <tr key={fd.name}>
                        <td className="hgadm-cell-mono">{fd.name}</td>
                        <td>
                          <Badge tone={fd.need === "필수" ? "danger" : fd.need === "선택" ? "neutral" : "info"}>{fd.need}</Badge>
                        </td>
                        <td>{fd.meaning}</td>
                        <td className="hgadm-cell-mono">{fd.example ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            <details className="hgins-more">
              <summary>파일 대신 직접 붙여넣기</summary>
              <div className="hgins-more__body">
                <Textarea
                  rows={10}
                  value={pasted}
                  aria-label="JSON 붙여넣기"
                  style={{ fontFamily: "var(--font-mono, monospace)", fontSize: 13 }}
                  spellCheck={false}
                  placeholder={template}
                  onChange={(e) => setPasted(e.target.value)}
                />
                <div className="hgadm-row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!pasted.trim()}
                    loading={checking.isPending}
                    onClick={() => load(pasted, "붙여넣은 내용")}
                  >
                    확인하기
                  </Button>
                </div>
              </div>
            </details>
          </div>
        ) : (
          report && (
            <div className="hgbulk">
              <div className="hgins-cta__hint" style={{ marginBottom: 10 }}>
                <FileJson size={14} strokeWidth={2} aria-hidden style={{ verticalAlign: -2 }} /> {source} · 아직 저장하지 않았어요
              </div>
              <div className="hgins-facts" style={{ marginBottom: 14 }}>
                <Fact label={`전체 ${noun}`} value={report.total} />
                <Fact label="추가할 수 있음" value={report.ready} tone={report.ready ? "good" : undefined} />
                <Fact label="오류" value={report.invalid} tone={report.invalid ? "bad" : undefined} hint={report.invalid ? "고쳐야 추가돼요" : "없음"} />
                <Fact label="중복" value={report.duplicates} hint={report.duplicates ? "파일 안이나 이미 등록된 것과 같아요" : "없음"} />
              </div>

              <div className="hgbulk-bar">
                <div className="hgins-seg" role="radiogroup" aria-label="보기">
                  {(
                    [
                      ["all", `전체 ${report.total}`],
                      ["errors", `오류·주의 ${report.rows.filter((r) => !r.ok || r.warnings.length).length}`],
                      ["duplicates", `중복 ${report.rows.filter((r) => r.duplicate).length}`],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={filter === value}
                      className={`hgins-seg__btn${filter === value ? " is-on" : ""}`}
                      onClick={() => setFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {report.duplicates > 0 && (
                  <label className="hgadm-checkbox">
                    <input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} /> 중복은 건너뛰기
                  </label>
                )}
                {failed.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => downloadJson(JSON.stringify(failed, null, 2), `${templateFilename.replace(/\.json$/, "")}-오류.json`)}
                  >
                    <Download size={15} strokeWidth={2} aria-hidden />
                    오류 {failed.length}건 내려받기
                  </Button>
                )}
              </div>

              <div className="hgbulk-rows">
                <table className="hgadm-table">
                  <thead>
                    <tr>
                      <th style={{ width: 56 }}>#</th>
                      <th>내용</th>
                      <th style={{ width: 150 }}>상태</th>
                      <th>확인할 점</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.length === 0 && (
                      <tr>
                        <td colSpan={4}>
                          <div className="hgadm-table__empty">해당하는 항목이 없어요.</div>
                        </td>
                      </tr>
                    )}
                    {shown.map((r) => (
                      <tr key={r.index}>
                        <td className="hgadm-cell-mono">{r.index + 1}</td>
                        <td>{r.summary || <span className="hgadm-cell-sub">(내용 없음)</span>}</td>
                        <td>
                          <RowStatus row={r} skipDuplicates={skipDuplicates} />
                        </td>
                        <td>
                          {r.errors.length + r.warnings.length === 0 ? (
                            <span className="hgadm-cell-sub">—</span>
                          ) : (
                            <ul className="hgbulk-issues">
                              {r.errors.map((e) => (
                                <li key={e} className="is-error">
                                  {e}
                                </li>
                              ))}
                              {r.warnings.map((w) => (
                                <li key={w}>{w}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {report.invalid > 0 && (
                <p className="hgins-cta__hint" style={{ marginTop: 10 }}>
                  오류가 있는 {report.invalid.toLocaleString()}건은 추가되지 않아요. "오류 내려받기"로 그 줄만 받아 고친 뒤 다시 올리면 돼요.
                </p>
              )}
            </div>
          )
        )}
      </Modal>
    </>
  );
}

function RowStatus({ row, skipDuplicates }: { row: BulkCheckRow; skipDuplicates: boolean }) {
  if (!row.ok) return <Badge tone="danger">오류</Badge>;
  if (row.duplicate === "in_file")
    return (
      <div>
        <Badge tone="warning">파일 안 중복</Badge>
        <div className="hgadm-cell-sub">
          {(row.duplicate_of ?? 0) + 1}번과 같음{skipDuplicates ? " · 건너뜀" : ""}
        </div>
      </div>
    );
  if (row.duplicate === "existing")
    return (
      <div>
        <Badge tone="warning">이미 등록됨</Badge>
        {skipDuplicates && <div className="hgadm-cell-sub">건너뜀</div>}
      </div>
    );
  return <Badge tone="success">추가 가능</Badge>;
}

function Fact({ label, value, tone, hint }: { label: string; value: number; tone?: "good" | "bad"; hint?: string }) {
  return (
    <div className={`hgins-fact${tone ? ` hgins-fact--${tone}` : ""}`}>
      <div className="hgins-fact__label">{label}</div>
      <div className="hgins-fact__value">{value.toLocaleString()}</div>
      {hint && <div className="hgins-fact__hint">{hint}</div>}
    </div>
  );
}

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, "utf-8");
  });
}

function downloadJson(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Parse an upload: a JSON array of objects, or `{ items: [...] }`. */
export function parseItems(text: string): { items: Item[] | null; error: string | null } {
  if (!text.trim()) return { items: null, error: "내용이 비어 있어요." };
  let data: unknown;
  try {
    // A BOM from Excel / Windows editors is not JSON.
    data = JSON.parse(text.replace(/^﻿/, ""));
  } catch (e) {
    return { items: null, error: `JSON 형식이 올바르지 않아요: ${(e as Error).message}` };
  }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    data = (data as { items?: unknown }).items;
  }
  if (!Array.isArray(data)) return { items: null, error: "목록([ ... ]) 또는 { \"items\": [ ... ] } 모양이어야 해요." };
  if (data.length === 0) return { items: null, error: "항목이 하나도 없어요." };
  if (data.length > MAX_ITEMS)
    return {
      items: null,
      error: `한 번에 최대 ${MAX_ITEMS.toLocaleString()}건까지 올릴 수 있어요 (이 파일은 ${data.length.toLocaleString()}건). 파일을 나눠서 올려 주세요.`,
    };
  const bad = data.findIndex((it) => !it || typeof it !== "object" || Array.isArray(it));
  if (bad >= 0) return { items: null, error: `${bad + 1}번째 항목이 { ... } 모양이 아니에요.` };
  return { items: data as Item[], error: null };
}

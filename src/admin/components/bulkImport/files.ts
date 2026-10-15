export const MAX_ITEMS = 1000;

/** One documented field of the upload format. */
export interface FieldDoc {
  name: string;
  /** "필수", "선택", or a condition such as "객관식 필수". */
  need: string;
  meaning: string;
  example?: string;
}

export type Item = Record<string, unknown>;

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

export function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, "utf-8");
  });
}

export function downloadJson(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

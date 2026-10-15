import type { AiModelsData, IntegrationSettings, SettingChange, SettingField } from "../../api";
import { ApiError } from "../../../lib/http";

/** The settings page's cache; the AI model summary sits under it on purpose. */
export const QUERY_KEY = ["admin", "system-settings"];
export const MODELS_KEY = ["admin", "system-settings", "ai-models"];

export type ModelsState = { data: AiModelsData | undefined; loading: boolean };

/** A pending change to one field, before it is saved. */
export type Edit =
  | { kind: "value"; value: string | boolean }
  | { kind: "secret"; value: string }
  | { kind: "clear" }
  | { kind: "reset" };

export type Edits = Record<string, Edit>;

export type Status = IntegrationSettings["status"];

export const STATUS_TEXT: Record<Status, string> = {
  active: "사용 중",
  incomplete: "설정 필요",
  off: "꺼짐",
  not_configured: "미설정",
  settings: "",
};

/** The request a set of edits turns into. Secrets go under `secret` (redacted in the audit log). */
export function toChanges(fields: SettingField[], edits: Edits): SettingChange[] {
  const out: SettingChange[] = [];
  for (const field of fields) {
    const edit = edits[field.key];
    if (!edit) continue;
    if (edit.kind === "clear" || edit.kind === "reset") out.push({ key: field.key, action: edit.kind });
    else if (edit.kind === "secret") out.push({ key: field.key, action: "set", secret: edit.value });
    else out.push({ key: field.key, action: "set", value: edit.value });
  }
  return out;
}

/** The same edits as unsaved values for a connection test. */
export function toTrial(fields: SettingField[], edits: Edits) {
  const values: Record<string, unknown> = {};
  const secrets: Record<string, string> = {};
  for (const field of fields) {
    const edit = edits[field.key];
    if (edit?.kind === "secret") secrets[field.key] = edit.value;
    else if (edit?.kind === "value") values[field.key] = edit.value;
  }
  return { values, secrets };
}

/** Per-field messages from a refused save or test. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  return (error.details as { fields?: Record<string, string> } | undefined)?.fields ?? {};
}

/** An empty secret input means "keep the saved one", so it is not a change. */
export function effectiveEdits(edits: Edits): Edits {
  return Object.fromEntries(Object.entries(edits).filter(([, e]) => !(e.kind === "secret" && e.value.trim() === "")));
}

/** A field's saved value as text. */
export function savedValue(fields: SettingField[], key: string): string {
  return String(fields.find((f) => f.key === key)?.value ?? "");
}

/**
 * The portal's wording for a server error.
 *
 * The server's problem `detail` is English for developers and logs; operators
 * see the sentence the catalogs keep for the problem's `details.reason` (when
 * the server gives one) or else its `code`. `{name}` slots are filled from
 * `details` (a list is joined with commas); a sentence whose slots `details`
 * cannot fill is skipped rather than shown with a bare `{name}`.
 *
 * The portal (Korean only) looks in its own catalog first, then in the Korean
 * member catalog: reasons before codes in both.
 */
import { interpolate } from "./messages";
import { apiErrorsKo } from "./locales/apiErrors.ko";
import { apiErrorsAdminKo } from "./locales/apiErrors.admin.ko";

export interface ServerProblem {
  code: string;
  details?: Record<string, unknown>;
}

interface Catalog {
  codes: Record<string, string>;
  reasons: Record<string, string>;
}

const CATALOGS: Catalog[] = [apiErrorsAdminKo, apiErrorsKo];

function fill(message: string | undefined, details: Record<string, unknown> | undefined): string | null {
  if (!message) return null;
  const vars: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(details ?? {})) {
    if (typeof v === "string" || typeof v === "number") vars[k] = v;
    else if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string" || typeof x === "number")) {
      vars[k] = v.join(", ");
    }
  }
  const text = interpolate(message, vars);
  return /\{\w+\}/.test(text) ? null : text;
}

/** The catalogs' sentence for this problem, or null when none has one. */
export function apiErrorText(problem: ServerProblem): string | null {
  const reason = problem.details?.reason;
  const candidates = [
    ...(typeof reason === "string" ? CATALOGS.map((c) => c.reasons[reason]) : []),
    ...CATALOGS.map((c) => c.codes[problem.code]),
  ];
  for (const message of candidates) {
    const text = fill(message, problem.details);
    if (text) return text;
  }
  return null;
}

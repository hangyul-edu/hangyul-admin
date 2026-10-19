/**
 * The portal's own fallback messages, for a failure the server's error
 * catalogs (apiErrors.ts) cannot word: no connection, an unknown error, or a
 * status the catalogs have no sentence for. The portal is Korean-only.
 *
 * `lib/http.ts` carries these as keys (`httpError.network`) inside the errors
 * it throws, and `resolveMessage` turns a key into its sentence.
 */
const MESSAGES: Readonly<Record<string, string>> = {
  "httpError.forbidden": "권한이 없어요.",
  "httpError.network": "네트워크에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.",
  "httpError.unknown": "알 수 없는 오류가 발생했어요.",
  "httpError.badRequest": "요청을 처리하지 못했어요.",
  "httpError.notFound": "요청한 정보를 찾을 수 없어요.",
  "httpError.server": "일시적인 서버 오류예요. 잠시 후 다시 시도해 주세요.",
};

/** Pass display text through untouched; resolve anything that is a message key. */
export function resolveMessage(value: string): string {
  return Object.prototype.hasOwnProperty.call(MESSAGES, value) ? MESSAGES[value] : value;
}

/** Substitute `{placeholder}` slots. Unknown placeholders are left untouched. */
export function interpolate(message: string, vars?: Record<string, string | number>): string {
  if (!vars) return message;
  return message.replace(/\{(\w+)\}/g, (full, name: string) =>
    name in vars ? String(vars[name]) : full,
  );
}

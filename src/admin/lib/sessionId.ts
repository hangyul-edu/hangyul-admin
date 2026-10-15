/**
 * The server session id (`sid` claim) a token belongs to, or null when the
 * token is not a readable JWT. Rotation keeps the sid, so two refresh tokens
 * with the same sid are successive pairs of one sign-in. Read without
 * verification — it only decides which of our own stored pairs is newer.
 */
export function sessionIdOf(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const sid = (JSON.parse(json) as { sid?: unknown }).sid;
    return typeof sid === "string" ? sid : null;
  } catch {
    return null;
  }
}

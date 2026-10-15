import { describe, expect, it } from "vitest";
import { sessionIdOf } from "./sessionId";

/** An unsigned JWT-shaped token carrying just the claims the client reads. */
function jwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${b64({ alg: "HS256" })}.${b64(claims)}.sig`;
}

describe("sessionIdOf", () => {
  it("reads the sid claim of a JWT", () => {
    expect(sessionIdOf(jwt({ sid: "sess_1", jti: "x" }))).toBe("sess_1");
  });
  it("returns null for anything that is not a readable JWT", () => {
    expect(sessionIdOf("opaque-token")).toBeNull();
    expect(sessionIdOf("a.@@@.c")).toBeNull();
    expect(sessionIdOf(jwt({ jti: "x" }))).toBeNull();
  });
});

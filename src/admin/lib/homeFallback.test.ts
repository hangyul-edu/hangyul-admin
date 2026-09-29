import { describe, expect, it } from "vitest";
import { homeFallback } from "./homeFallback";

// Scope sets of the tiers without users:read, as ADMIN_ROLE_SCOPES in
// src/common/security/permissions.py grants them.
const canWith = (...scopes: string[]) => (scope: string) => scopes.includes(scope);

describe("homeFallback", () => {
  it("sends analysts and educators to the learning overview", () => {
    expect(homeFallback(canWith("analytics:read", "exports:create", "content:read", "ops:read", "ai:read"))).toBe("/learning");
    expect(homeFallback(canWith("content:read", "content:review", "analytics:read", "learners:read"))).toBe("/learning");
  });

  it("sends a content-only tier to the content pages", () => {
    expect(homeFallback(canWith("content:read", "content:write"))).toBe("/courses");
  });

  it("returns null when the tier reaches none of the areas", () => {
    expect(homeFallback(canWith())).toBeNull();
  });
});

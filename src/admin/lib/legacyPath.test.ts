import { afterEach, describe, expect, it } from "vitest";
import { currentPath, normalizeLegacyAddress } from "./legacyPath";

describe("addresses from before the portal moved to the domain root", () => {
  it.each([
    ["/admin", "/"],
    ["/admin/", "/"],
    ["/admin/users", "/users"],
    ["/admin/users/u_1", "/users/u_1"],
    ["/admin/learning/proficiency/u_1", "/learning/proficiency/u_1"],
    ["/admin/admins", "/admins"],
    ["/admin/login", "/login"],
  ])("%s → %s", (from, to) => {
    expect(currentPath(from)).toBe(to);
  });

  it.each(["/", "/users", "/admins", "/administrator", "/login", "/operations"])(
    "leaves the current address %s alone",
    (path) => {
      expect(currentPath(path)).toBeNull();
    },
  );

  it("never maps an address to another legacy one: one rewrite and done", () => {
    for (const path of ["/admin", "/admin/", "/admin/users", "/admin/admins"]) {
      expect(currentPath(currentPath(path)!)).toBeNull();
    }
  });
});

describe("normalizeLegacyAddress", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("keeps the query and the fragment", () => {
    window.history.replaceState(null, "", "/admin/operations?tab=scoring&page=2#row-7");
    normalizeLegacyAddress();
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(
      "/operations?tab=scoring&page=2#row-7",
    );
  });

  it("does not touch a current address", () => {
    window.history.replaceState(null, "", "/users?q=kim#top");
    normalizeLegacyAddress();
    expect(window.location.pathname + window.location.search + window.location.hash).toBe("/users?q=kim#top");
  });
});

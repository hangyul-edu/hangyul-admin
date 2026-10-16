/**
 * The portal used to live under /admin; it now sits at the root of its own
 * domain. An address from before the move (a bookmark, a shared link) maps
 * to the same page without the prefix: /admin → /, /admin/users/u1 →
 * /users/u1. Anything else — including /admins, a page of its own — is
 * already current, so this returns null and nothing is rewritten twice.
 */
export function currentPath(legacyPathname: string): string | null {
  if (legacyPathname === "/admin" || legacyPathname === "/admin/") return "/";
  if (legacyPathname.startsWith("/admin/")) return legacyPathname.slice("/admin".length);
  return null;
}

/** Rewrite the address bar from an old /admin/… address to its page, keeping
 * the query and fragment. Runs before the router reads the location. */
export function normalizeLegacyAddress(location: Location = window.location): void {
  const moved = currentPath(location.pathname);
  if (moved !== null) window.history.replaceState(window.history.state, "", moved + location.search + location.hash);
}

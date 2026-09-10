/**
 * Carrying where you came from across a navigation.
 *
 * A detail page is reachable from more than one place. The user detail page is
 * opened from the user directory, and now also from a league's member list —
 * but its back link was hard-coded to the directory, so an admin who arrived
 * from a league was dropped into user management and had to find their way
 * back through it.
 *
 * The origin travels in React Router's own location state rather than in the
 * URL or in a store: it is the mechanism the router already has for "how this
 * navigation happened", it survives the forward and back trip, and a direct
 * visit or a pasted link simply carries none — which is exactly when the
 * fallback is the right answer. Nothing here is specific to leagues; any page
 * that links to a detail view can hand over its own origin the same way.
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export interface BackTarget {
  /** Path *including* the query string, so filters survive the round trip. */
  to: string;
  /** What the back link says — the place, not the word "back". */
  label: string;
  /** Scroll offset when the page was left, restored on return. */
  scrollY?: number;
}

/** The location state a navigation carries. */
export interface NavigationState {
  from?: BackTarget;
  /** Set by a back link, consumed by `useRestoreScroll`. */
  restoreScrollY?: number;
}

/**
 * The state to pass when opening a detail page from here.
 *
 * Captures the current path with its query and how far the page is scrolled,
 * so returning lands on the same rows rather than at the top of the list.
 */
export function originFrom(label: string, pathWithQuery: string): NavigationState {
  return {
    from: {
      to: pathWithQuery,
      label,
      scrollY: typeof window === "undefined" ? 0 : window.scrollY,
    },
  };
}

/** Where this page should send someone back to, or `fallback` if it was reached directly. */
export function useBackTarget(fallback: BackTarget): BackTarget {
  const state = useLocation().state as NavigationState | null;
  const from = state?.from;
  // A state object can arrive from anywhere the router was told to put one, so
  // treat it as untrusted shape and only accept a usable internal path.
  if (!from || typeof from.to !== "string" || !from.to.startsWith("/")) return fallback;
  return { to: from.to, label: from.label || fallback.label, scrollY: from.scrollY };
}

/** The state a back link navigates with, so the origin restores its scroll. */
export function backNavigationState(target: BackTarget): NavigationState {
  return { restoreScrollY: target.scrollY ?? 0 };
}

/**
 * Restore the scroll offset a back-navigation asked for.
 *
 * Only when one was asked for: an ordinary visit to the page must still start
 * at the top, and a fresh load has nothing to restore to.
 */
export function useRestoreScroll(ready: boolean = true): void {
  const state = useLocation().state as NavigationState | null;
  const target = state?.restoreScrollY;
  useEffect(() => {
    if (!ready || typeof target !== "number" || target <= 0) return;
    window.scrollTo(0, target);
  }, [ready, target]);
}

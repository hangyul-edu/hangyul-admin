/**
 * Carrying an origin across a navigation.
 *
 * The pure half of the mechanism: what goes into the router's location state,
 * and what a page makes of what it finds there. The round trip through real
 * components is exercised in `pages/Leagues.navigation.test.tsx`.
 */
import { describe, expect, it } from "vitest";
import { backNavigationState, originFrom } from "./navigation";

describe("originFrom", () => {
  it("keeps the query string, so filters survive the round trip", () => {
    const state = originFrom("Yellow 리그 1그룹", "/leagues/2026-W37/grp-a?q=김하늘");
    expect(state.from?.to).toBe("/leagues/2026-W37/grp-a?q=김하늘");
    expect(state.from?.label).toBe("Yellow 리그 1그룹");
  });

  it("records where the page was scrolled to", () => {
    window.scrollY = 640;
    expect(originFrom("어디", "/leagues").from?.scrollY).toBe(640);
    window.scrollY = 0;
  });
});

describe("backNavigationState", () => {
  it("asks the origin to restore the offset it was left at", () => {
    expect(backNavigationState({ to: "/x", label: "x", scrollY: 320 })).toEqual({
      restoreScrollY: 320,
    });
  });

  it("asks for the top when there was nothing to remember", () => {
    expect(backNavigationState({ to: "/x", label: "x" })).toEqual({ restoreScrollY: 0 });
  });
});

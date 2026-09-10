/**
 * League naming and tier colours, against the member app's own source.
 *
 * The point of these is not that the strings are right in isolation — it is
 * that they still agree with `src/lib/league.ts`. A portal whose Golden was a
 * slightly different yellow, or which called a tier something the app does
 * not, is worse than one with no colour at all: it looks deliberate.
 */
import { describe, expect, it } from "vitest";
import { LEAGUE_TIERS, TIER_META } from "../../lib/league";
import { leagueName, tierColor, tierLabel, tierName } from "./leagueNames";

describe("tier identity comes from the member app", () => {
  it("uses the app's name for every tier on the ladder", () => {
    for (const tier of LEAGUE_TIERS) {
      expect(tierName(tier)).toBe(TIER_META[tier].name);
    }
  });

  it("uses the app's colour for every tier on the ladder", () => {
    for (const tier of LEAGUE_TIERS) {
      expect(tierColor(tier)).toBe(TIER_META[tier].color);
    }
    // Spot-check the actual values, so a change to them is a deliberate edit
    // in one place rather than a silent drift in two.
    expect(tierColor("golden")).toBe("#e6ad1f");
    expect(tierColor("green")).toBe("#57b65a");
  });

  it("composes the label the way the app's catalog does", () => {
    // ko.ts: `league.tierLabel` is "{tier} 리그".
    expect(tierLabel("golden")).toBe("Golden 리그");
    expect(tierLabel("yellow")).toBe("Yellow 리그");
  });

  it("degrades to the raw code for a tier it does not know", () => {
    expect(tierName("bronze")).toBe("bronze");
    expect(tierColor("bronze")).toBeUndefined();
  });
});

describe("leagueName", () => {
  it("always numbers the group", () => {
    // Including where a tier runs only one: a name that appeared and vanished
    // with the group count would read as two different schemes.
    expect(leagueName("golden", 1)).toBe("Golden 리그 1그룹");
    expect(leagueName("green", 4)).toBe("Green 리그 4그룹");
  });

  it("is the only thing separating two groups of one tier", () => {
    expect(leagueName("lime", 1)).not.toBe(leagueName("lime", 2));
  });
});

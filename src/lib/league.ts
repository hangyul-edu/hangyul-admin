/**
 * The league tier ladder, in the backend's order (green → golden), with each
 * tier's name and colour as the member app shows them.
 */
export type LeagueTier = "green" | "lime" | "yellow" | "orange" | "golden";

export const LEAGUE_TIERS: LeagueTier[] = ["green", "lime", "yellow", "orange", "golden"];

/**
 * Tier identity. The tier *name* is a proper noun and identical in both
 * languages; only the surrounding word differs ("Green 리그" / "Green League",
 * Figma LEG-002 1423:22087), so callers add the suffix.
 */
export const TIER_META: Record<LeagueTier, { name: string; color: string }> = {
  green: { name: "Green", color: "#57b65a" },
  lime: { name: "Lime", color: "#9ad13f" },
  yellow: { name: "Yellow", color: "#ffc41f" },
  orange: { name: "Orange", color: "#ff8f2c" },
  golden: { name: "Golden", color: "#e6ad1f" },
};

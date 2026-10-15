/**
 * The catalog's learning tracks, by the ids courses and lectures carry.
 * (Learning analytics names tracks differently — conversation / topik — and
 * keeps its own labels in components/learning.)
 */
export const TRACKS = [
  ["track_conversation", "회화"],
  ["track_topik", "TOPIK"],
] as const;

export const TRACK_LABEL: Record<string, string> = Object.fromEntries(TRACKS);

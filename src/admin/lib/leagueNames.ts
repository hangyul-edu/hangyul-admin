/**
 * League naming and tier identity, taken from the member app.
 *
 * The tier ladder — its names *and* its colours — already has a single source
 * of truth in `src/lib/league.ts`, which the member app's carousel, history
 * screen and tier icons all read. The admin imports it rather than keeping a
 * second copy: a portal whose Golden was a different yellow from the app's
 * would be worse than one with no colour at all, because it would look
 * deliberate. (`league.ts` imports only a *type* from the i18n catalogs, so
 * nothing of the member bundle is pulled in behind it.)
 *
 * What is composed here is the wording the app composes in its own catalogs:
 * `league.tierLabel` is `"{tier} 리그"`, so a tier reads "Golden 리그" and a
 * group within it "Golden 리그 1그룹".
 */
import { LEAGUE_TIERS, TIER_META } from "../../lib/league";
import type { LeagueTier } from "../../lib/league";

export { LEAGUE_TIERS, TIER_META };
export type { LeagueTier };

/** `"golden"` → `"Golden"`. The proper noun, identical in both languages. */
export function tierName(tier: string): string {
  return TIER_META[tier as LeagueTier]?.name ?? tier;
}

/** `"golden"` → the app's own colour for that tier. */
export function tierColor(tier: string): string | undefined {
  return TIER_META[tier as LeagueTier]?.color;
}

/** `"golden"` → `"Golden 리그"`, exactly as the member app renders it. */
export function tierLabel(tier: string): string {
  return `${tierName(tier)} 리그`;
}

/**
 * `"golden", 1` → `"Golden 리그 1그룹"`.
 *
 * Always numbered, even where a tier is running only one group. A name that
 * appeared and disappeared depending on how many groups happened to exist
 * would read as two different naming schemes; and the number is the only thing
 * that distinguishes two groups now that their ids are not on screen.
 */
export function leagueName(tier: string, ordinal: number): string {
  return `${tierLabel(tier)} ${ordinal}그룹`;
}

/** `"2026-09-07T00:00:00Z"` → `"2026.09.07"`, in the league's own timezone. */
export function leagueDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  // The league runs on US Eastern time; a week that opens at 00:00 there is
  // still the previous day in UTC, so formatting anywhere else would name the
  // wrong start date.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return parts.replace(/-/g, ".");
}

/** `"2026.09.07 ~ 2026.09.13"` — the period as the header shows it. */
export function leaguePeriod(startsAt: string, endsAt: string): string {
  return `${leagueDate(startsAt)} ~ ${leagueDate(endsAt)}`;
}

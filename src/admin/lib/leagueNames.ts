/**
 * League naming, matching the member app.
 *
 * The app never shows a member `2026-W37` or a group id. It names a tier
 * `"Yellow 리그"` (`league.tierLabel` = `"{tier} 리그"` over the tier names in
 * `src/lib/league.ts`), and it names a period by its calendar quarter —
 * `"2026 가을 시즌"` — with the week identified by its dates. The portal uses
 * the same words so an admin and a member are talking about the same thing.
 *
 * The tier names are duplicated here rather than imported because the admin is
 * a separate entry point that does not load the member app's bundle; the test
 * beside this file pins the two lists together so they cannot drift.
 */

/** Tier names, in ladder order. The member app's `TIER_META` names. */
export const TIER_NAMES: Record<string, string> = {
  green: "Green",
  lime: "Lime",
  yellow: "Yellow",
  orange: "Orange",
  golden: "Golden",
};

/** `"yellow"` → `"Yellow 리그"`, exactly as the member app renders it. */
export function tierLabel(tier: string): string {
  return `${TIER_NAMES[tier] ?? tier} 리그`;
}

/**
 * `"yellow", 2` → `"Yellow 리그 2그룹"`.
 *
 * A tier can be running several groups at once and they are otherwise
 * indistinguishable without their random ids, so the group carries its number
 * within the tier. A tier with a single group needs no number.
 */
export function leagueName(tier: string, ordinal: number, groupsInTier = 2): string {
  return groupsInTier > 1 ? `${tierLabel(tier)} ${ordinal}그룹` : tierLabel(tier);
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

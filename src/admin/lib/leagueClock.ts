/**
 * When a league opens and closes, in the two timezones that matter.
 *
 * The league is operated on **US Eastern time** — a week runs Monday 00:00 to
 * Sunday 21:00 there, and the settlement job fires against those instants — so
 * ET is the authoritative clock and the portal says so. The team reads Korean
 * time, so both are shown rather than making anyone convert.
 *
 * Everything here converts through `Intl.DateTimeFormat` with a named zone, so
 * the offset comes from the runtime's IANA database. That is not a nicety:
 * Eastern time is UTC-5 in winter and UTC-4 in summer, and Korea has no DST at
 * all, so the gap between the two is 14 hours for part of the year and 13 for
 * the rest. A hard-coded offset would be wrong for roughly half the calendar
 * and would drift again whenever a government changes the rules.
 */

export const LEAGUE_ZONE = "America/New_York";
export const KST_ZONE = "Asia/Seoul";

/** `"2026.09.07 (월) 00:00"` — a moment as one of the two clocks reads it. */
export function formatInZone(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  // 24:00 is how ko-KR renders midnight under hour12:false; the league's weeks
  // open exactly then, and "24:00" on the start line reads as the wrong day.
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}.${get("month")}.${get("day")} (${get("weekday")}) ${hour}:${get("minute")}`;
}

/**
 * The zone's abbreviation at that instant — `EDT` in summer, `EST` in winter.
 *
 * Read from the formatter rather than derived from a date range, so it is
 * right on both sides of a transition without this file knowing when they are.
 */
export function zoneAbbreviation(value: string, timeZone: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "short",
  }).formatToParts(date);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
}

/** A period on one clock: `"2026.09.07 (월) 00:00 ~ 2026.09.13 (일) 21:00"`. */
export function periodInZone(startsAt: string, endsAt: string, timeZone: string): string {
  return `${formatInZone(startsAt, timeZone)} ~ ${formatInZone(endsAt, timeZone)}`;
}

export interface Remaining {
  days: number;
  hours: number;
  minutes: number;
  /** The deadline has passed. */
  ended: boolean;
}

/** How long until `endsAt`, broken into days, hours and minutes. */
export function timeRemaining(endsAt: string, now: Date = new Date()): Remaining {
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) return { days: 0, hours: 0, minutes: 0, ended: true };
  const ms = end.getTime() - now.getTime();
  if (ms <= 0) return { days: 0, hours: 0, minutes: 0, ended: true };
  const minutes = Math.floor(ms / 60_000);
  return {
    days: Math.floor(minutes / 1440),
    hours: Math.floor((minutes % 1440) / 60),
    minutes: minutes % 60,
    ended: false,
  };
}

/**
 * `"2일 6시간 남음"`.
 *
 * Coarse on purpose: the largest two units only, because "2일 6시간 12분" reads
 * as a countdown when the useful question is just "is this closing today". The
 * minutes do appear once they are all that is left.
 */
export function formatRemaining(remaining: Remaining): string {
  if (remaining.ended) return "종료됨";
  const { days, hours, minutes } = remaining;
  if (days > 0) return `${days}일 ${hours}시간 남음`;
  if (hours > 0) return `${hours}시간 ${minutes}분 남음`;
  return `${minutes}분 남음`;
}

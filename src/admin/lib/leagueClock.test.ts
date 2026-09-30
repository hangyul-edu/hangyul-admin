/**
 * The league clock, across the daylight-saving boundary.
 *
 * The league is run on US Eastern time and read in Korea. Eastern is UTC-5 in
 * winter and UTC-4 in summer while Korea never shifts, so the gap between the
 * two is 14 hours for part of the year and 13 for the rest. Any fixed offset
 * would be wrong for about half the calendar — which is what these are for:
 * the same wall-clock league week is checked in March and in December, and the
 * two must come out differently.
 */
import { describe, expect, it } from "vitest";
import {
  KST_ZONE,
  LEAGUE_ZONE,
  formatInZone,
  formatRemaining,
  timeRemaining,
  zoneAbbreviation,
} from "./leagueClock";

/* A summer week: Mon 2026-07-06 00:00 EDT (UTC-4) → Sun 2026-07-12 21:00 EDT. */
const SUMMER_START = "2026-07-06T04:00:00Z";
const SUMMER_END = "2026-07-13T01:00:00Z";
/* A winter week: Mon 2026-01-05 00:00 EST (UTC-5) → Sun 2026-01-11 21:00 EST. */
const WINTER_START = "2026-01-05T05:00:00Z";
const WINTER_END = "2026-01-12T02:00:00Z";

describe("reading an instant on each clock", () => {
  it("shows the league's own midnight as 00:00, not 24:00", () => {
    // A week opens exactly at midnight, and ko-KR renders that as 24:00 under
    // hour12:false — which would name the wrong day on the start line.
    expect(formatInZone(SUMMER_START, LEAGUE_ZONE)).toBe("2026.07.06 (월) 00:00");
    expect(formatInZone(WINTER_START, LEAGUE_ZONE)).toBe("2026.01.05 (월) 00:00");
  });

  it("shows the Sunday close at 21:00 Eastern in both seasons", () => {
    expect(formatInZone(SUMMER_END, LEAGUE_ZONE)).toBe("2026.07.12 (일) 21:00");
    expect(formatInZone(WINTER_END, LEAGUE_ZONE)).toBe("2026.01.11 (일) 21:00");
  });

  it("converts the same instant to Korean time", () => {
    // Summer: ET is UTC-4, Korea UTC+9 — 13 hours ahead, so Monday 00:00 in
    // New York is Monday 13:00 in Seoul.
    expect(formatInZone(SUMMER_START, KST_ZONE)).toBe("2026.07.06 (월) 13:00");
    // Winter: ET is UTC-5 — 14 hours, so the same wall clock lands at 14:00.
    expect(formatInZone(WINTER_START, KST_ZONE)).toBe("2026.01.05 (월) 14:00");
  });

  it("rolls the Korean date over when the close is late Eastern evening", () => {
    // 21:00 Sunday in New York is already Monday in Seoul.
    expect(formatInZone(SUMMER_END, KST_ZONE)).toBe("2026.07.13 (월) 10:00");
    expect(formatInZone(WINTER_END, KST_ZONE)).toBe("2026.01.12 (월) 11:00");
  });
});

describe("the offset is read, not assumed", () => {
  it("names the zone as it actually stood at that instant", () => {
    expect(zoneAbbreviation(SUMMER_START, LEAGUE_ZONE)).toBe("EDT");
    expect(zoneAbbreviation(WINTER_START, LEAGUE_ZONE)).toBe("EST");
  });
});

describe("time remaining", () => {
  const at = (iso: string) => new Date(iso);

  it("breaks the gap into days and hours", () => {
    expect(timeRemaining(SUMMER_END, at("2026-07-10T19:00:00Z"))).toMatchObject({
      days: 2,
      hours: 6,
      ended: false,
    });
  });

  it("reads as a sentence", () => {
    expect(formatRemaining(timeRemaining(SUMMER_END, at("2026-07-10T19:00:00Z")))).toBe(
      "2일 6시간 남음",
    );
  });

  it("drops to hours and minutes on the last day", () => {
    expect(formatRemaining(timeRemaining(SUMMER_END, at("2026-07-12T20:15:00Z")))).toBe(
      "4시간 45분 남음",
    );
  });

  it("counts minutes when that is all there is", () => {
    expect(formatRemaining(timeRemaining(SUMMER_END, at("2026-07-13T00:23:00Z")))).toBe(
      "37분 남음",
    );
  });

  it("says so once the week is over rather than counting backwards", () => {
    const past = timeRemaining(SUMMER_END, at("2026-07-14T00:00:00Z"));
    expect(past.ended).toBe(true);
    expect(formatRemaining(past)).toBe("종료됨");
  });

  it("treats the closing instant itself as over", () => {
    expect(timeRemaining(SUMMER_END, at(SUMMER_END)).ended).toBe(true);
  });

  it("measures real elapsed time across a DST transition", () => {
    // 2026-03-08 is a 23-hour day in New York. Counting calendar days would
    // report 2; the answer is the actual gap between the two instants.
    const remaining = timeRemaining("2026-03-09T04:00:00Z", at("2026-03-07T04:00:00Z"));
    expect(remaining).toMatchObject({ days: 2, hours: 0, ended: false });
  });
});

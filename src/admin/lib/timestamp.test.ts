/**
 * The two-line timestamp used by the activity screens.
 *
 * `formatDateTime` renders one line and stops at the minute, which is right for
 * a plan's renewal date but not for an audit trail: two admin actions a few
 * seconds apart have to be distinguishable and orderable by eye. This helper is
 * the second form — same instant, same zone, same locale, split into a date
 * line and a time line carried down to the second.
 *
 * The point of it being one helper is that Activity History and the dashboard's
 * Recent Admin Activity cannot drift into two formats; the page tests pin that
 * both call it, and these pin what it produces.
 */
import { describe, expect, it } from "vitest";
import { ADMIN_LOCALE, ADMIN_TIME_ZONE, formatDateTime, formatDateTimeParts } from "./format";

/** 2026-09-10 13:05:42 KST. */
const AT = "2026-09-10T04:05:42Z";

describe("formatDateTimeParts", () => {
  it("splits the instant into a date line and a time line", () => {
    expect(formatDateTimeParts(AT)).toEqual({ date: "2026. 09. 10.", time: "오후 01:05:42" });
  });

  it("keeps the seconds, which is the whole reason it exists", () => {
    // One minute holds a lot of admin actions; without seconds the audit trail
    // cannot be read in order.
    const a = formatDateTimeParts("2026-09-10T04:05:01Z")!;
    const b = formatDateTimeParts("2026-09-10T04:05:59Z")!;
    expect(a.time).toBe("오후 01:05:01");
    expect(b.time).toBe("오후 01:05:59");
    expect(a.time).not.toBe(b.time);
  });

  it("pads every field, so the two lines are the same width every row", () => {
    // A row of ragged-width timestamps is what makes a column unscannable.
    const { date, time } = formatDateTimeParts("2026-01-02T00:03:04Z")!;
    expect(date).toBe("2026. 01. 02.");
    expect(time).toBe("오전 09:03:04");
  });

  it("reads midnight and noon as the locale writes them, not as 00 and 12 mixed up", () => {
    expect(formatDateTimeParts("2026-09-09T15:00:00Z")!.time).toBe("오전 12:00:00");
    expect(formatDateTimeParts("2026-09-10T03:00:00Z")!.time).toBe("오후 12:00:00");
  });

  it("renders in the portal's zone, not the viewer's", () => {
    // 23:30 UTC is already the next day in Seoul; the date line has to say so.
    expect(formatDateTimeParts("2026-09-09T23:30:00Z")).toEqual({
      date: "2026. 09. 10.",
      time: "오전 08:30:00",
    });
  });

  it("describes the same instant as the one-line formatter", () => {
    // A display-format change only: the two must never disagree about when.
    // The two lines joined are the one-line form plus the seconds — every other
    // screen keeps that shorter form, so this pins that they agree rather than
    // that one replaced the other.
    const parts = formatDateTimeParts(AT)!;
    expect(formatDateTime(AT)).toBe(`${parts.date} ${parts.time.slice(0, -3)}`);
    expect(formatDateTime(AT)).toBe("2026. 09. 10. 오후 01:05");
  });

  it("returns null for a missing or unreadable value instead of a fake date", () => {
    // The callers render an em dash; "Invalid Date" in an audit log would be
    // worse than an admitted blank.
    expect(formatDateTimeParts(null)).toBeNull();
    expect(formatDateTimeParts(undefined)).toBeNull();
    expect(formatDateTimeParts("")).toBeNull();
    expect(formatDateTimeParts("not a date")).toBeNull();
  });

  it("formats in the constants the rest of the portal shares", () => {
    expect(ADMIN_LOCALE).toBe("ko-KR");
    expect(ADMIN_TIME_ZONE).toBe("Asia/Seoul");
  });
});

describe("in English", () => {
  /*
   * The portal has no i18n layer yet — every string in it is written in Korean,
   * so ADMIN_LOCALE is ko-KR and that is what renders. What these pin is that
   * the shape survives the switch when that layer arrives: both lines come from
   * Intl option sets, not from a hand-written pattern, so English is a locale
   * away rather than a rewrite. A pattern like "yyyy. MM. dd." would pass every
   * Korean test above and produce nonsense here.
   */
  it("still splits into a full date and a time with seconds", () => {
    expect(formatDateTimeParts(AT, "en-US")).toEqual({ date: "09/10/2026", time: "01:05:42 PM" });
  });

  it("still renders the portal's zone rather than the viewer's", () => {
    expect(formatDateTimeParts("2026-09-09T23:30:00Z", "en-US")!.date).toBe("09/10/2026");
  });

  it("stays two lines, so neither has to wrap in a narrow column", () => {
    // English is the longer of the two here; if the split were cosmetic this is
    // where a single joined string would start folding.
    const { date, time } = formatDateTimeParts(AT, "en-US")!;
    expect(date).not.toContain(" ");
    expect(time.split(" ")).toHaveLength(2);
  });
});

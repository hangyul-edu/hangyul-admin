// The admin portal renders and accepts every time on Seoul's clock, whatever
// timezone the viewer's machine is in. Proving that needs the test process to
// be somewhere OTHER than Seoul — on a Korean developer's laptop (and this
// repo's own machine is on Asia/Seoul) a "renders in KST" assertion passes for
// the wrong reason. New York is UTC-4/-5, so it lands on a different calendar
// day from Seoul for a large part of every day, which is what makes these
// assertions bite.
// Declared locally rather than pulling in @types/node for one assignment; the
// runner is Node, so the global is really there. Safe above the imports even
// though ESM hoists them: kit.tsx formats nothing at import time, and the
// beforeAll below fails loudly if this ever stops taking effect.
declare const process: { env: Record<string, string | undefined> };
process.env.TZ = "America/New_York";

import { beforeAll, describe, expect, it } from "vitest";
import {
  ADMIN_TIME_ZONE,
  formatDate,
  formatDateTime,
  fromAdminInputValue,
  toAdminInputValue,
} from "../lib/format";

/** 2026-09-08 15:00Z — midnight on the 9th in Seoul, 11:00 on the 8th in NY. */
const SEAM = "2026-09-08T15:00:00Z";

beforeAll(() => {
  // Guard the guard: if the runner ever ignores TZ, these tests silently stop
  // proving anything, so fail loudly instead.
  const host = Intl.DateTimeFormat().resolvedOptions().timeZone;
  expect(host).not.toBe("Asia/Seoul");
});

describe("the portal clock", () => {
  it("is Seoul", () => {
    expect(ADMIN_TIME_ZONE).toBe("Asia/Seoul");
  });
});

describe("formatDateTime", () => {
  it("renders in Seoul time, not the viewer's", () => {
    // In New York this instant is still the 8th; in Seoul it is the 9th.
    expect(formatDateTime(SEAM)).toBe("2026. 09. 09. 오전 12:00");
    expect(formatDateTime(SEAM)).not.toBe(
      new Date(SEAM).toLocaleString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
  });

  it("keeps a UTC morning on the same Korean day", () => {
    expect(formatDateTime("2026-09-08T00:30:00Z")).toBe("2026. 09. 08. 오전 09:30");
  });

  it("rolls the year over on Seoul's clock", () => {
    expect(formatDateTime("2025-12-31T15:00:00Z")).toBe("2026. 01. 01. 오전 12:00");
    expect(formatDateTime("2025-12-31T14:59:00Z")).toBe("2025. 12. 31. 오후 11:59");
  });

  it("renders a missing or unusable value without throwing", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
    expect(formatDateTime("")).toBe("—");
    expect(formatDateTime("not-a-date")).toBe("not-a-date");
  });
});

describe("formatDate", () => {
  it("uses the Seoul calendar day", () => {
    expect(formatDate(SEAM)).toBe("2026. 9. 9.");
    expect(formatDate("2026-09-08T14:59:00Z")).toBe("2026. 9. 8.");
  });

  it("renders a missing value without throwing", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("nope")).toBe("nope");
  });
});

describe("datetime-local round trip", () => {
  it("shows a stored instant as its Seoul wall clock", () => {
    expect(toAdminInputValue(SEAM)).toBe("2026-09-09T00:00");
    expect(toAdminInputValue("2026-09-08T00:30:00Z")).toBe("2026-09-08T09:30");
  });

  it("reads a typed value as Seoul time", () => {
    expect(fromAdminInputValue("2026-09-09T00:00")).toBe("2026-09-08T15:00:00.000Z");
    expect(fromAdminInputValue("2026-09-08T09:30")).toBe("2026-09-08T00:30:00.000Z");
  });

  it("round-trips without moving the instant", () => {
    // The bug this prevents: an admin abroad types a time, saves, and the row
    // renders back hours away from what they entered.
    for (const iso of [
      SEAM,
      "2026-01-01T00:00:00Z",
      "2025-12-31T15:00:00Z",
      "2026-06-30T23:59:00Z",
      "2026-02-28T15:00:00Z",
    ]) {
      const typed = toAdminInputValue(iso);
      expect(fromAdminInputValue(typed)).toBe(new Date(iso).toISOString());
    }
  });

  it("agrees with what the table will display", () => {
    const typed = "2026-09-09T00:00";
    const stored = fromAdminInputValue(typed);
    expect(formatDateTime(stored)).toBe("2026. 09. 09. 오전 12:00");
  });

  it("treats midnight as 00:00, never 24:00", () => {
    // Some engines format midnight as "24:00", which the input control rejects.
    expect(toAdminInputValue("2026-09-08T15:00:00Z")).toMatch(/T00:00$/);
  });

  it("maps empty and unusable values to nothing rather than an epoch", () => {
    expect(toAdminInputValue(null)).toBe("");
    expect(toAdminInputValue(undefined)).toBe("");
    expect(toAdminInputValue("garbage")).toBe("");
    expect(fromAdminInputValue("")).toBeNull();
    expect(fromAdminInputValue(null)).toBeNull();
    expect(fromAdminInputValue("garbage")).toBeNull();
  });
});

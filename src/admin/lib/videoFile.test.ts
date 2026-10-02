import { describe, expect, it } from "vitest";
import { formatPrecise, parseTime } from "./videoFile";

describe("checkpoint times", () => {
  it("reads what an admin types", () => {
    expect(parseTime("1:23.45")).toBe(83.45);
    expect(parseTime("83.45")).toBe(83.45);
    expect(parseTime(" 83.45초 ")).toBe(83.45);
    expect(parseTime("0:05")).toBe(5);
    expect(parseTime("1:02:03.5")).toBe(3723.5);
    expect(parseTime("2:03.456")).toBe(123.46);
  });

  it("refuses what is not a time", () => {
    for (const text of ["", "abc", "1:", ":30", "1:75", "1.5:30", "-3", "1:2:3:4", "1:23.4.5"]) {
      expect(parseTime(text), text).toBeNull();
    }
  });

  it("reads back what it shows", () => {
    for (const seconds of [0, 0.05, 59.99, 83.6, 3723.5]) {
      expect(parseTime(formatPrecise(seconds))).toBe(seconds);
    }
  });
});

/**
 * The Y-axis, at every size the dashboard actually sees.
 *
 * The bug these exist for was not cosmetic: the axis took four fixed fractions
 * of the peak and rounded each to an integer, so a chart peaking at 1 printed
 * `0 1 1 1` and one peaking at 2 printed `1 1 2 2`. The labels were duplicates
 * because the *values behind them* were, which is why the invariant asserted
 * throughout here is on the tick values, not on the rendered strings.
 */
import { describe, expect, it } from "vitest";
import { formatTick, niceScale } from "./chartScale";

/** What must hold for every axis, whatever the data. */
function expectWellFormed(scale: ReturnType<typeof niceScale>, peak: number) {
  expect(scale.step).toBeGreaterThan(0);
  expect(scale.max).toBeGreaterThan(0);
  expect(scale.max).toBeGreaterThanOrEqual(peak);
  expect(scale.ticks[0]).toBe(0);
  expect(scale.ticks[scale.ticks.length - 1]).toBe(scale.max);
  // Strictly ascending — so no two ticks can render the same label.
  for (let i = 1; i < scale.ticks.length; i++) {
    expect(scale.ticks[i]).toBeGreaterThan(scale.ticks[i - 1]);
  }
  // And distinct once printed at the precision the axis chose.
  const labels = scale.ticks.map((t) => formatTick(t, { decimals: scale.decimals }));
  expect(new Set(labels).size).toBe(labels.length);
}

describe("counts (integer axis)", () => {
  it("never offers a fraction of a countable thing", () => {
    for (let peak = 1; peak <= 200; peak++) {
      const scale = niceScale(peak, { integer: true });
      expectWellFormed(scale, peak);
      expect(Number.isInteger(scale.step)).toBe(true);
      for (const tick of scale.ticks) expect(Number.isInteger(tick)).toBe(true);
      expect(scale.decimals).toBe(0);
    }
  });

  it("gives a peak of 1 the two ticks that mean something", () => {
    // The reported `0 1 1 1`. One signup is one signup: the axis stops there.
    expect(niceScale(1, { integer: true })).toMatchObject({ max: 1, step: 1, ticks: [0, 1] });
  });

  it("counts 0..2 one at a time", () => {
    // The reported `0 0 0 0` / `1 1 2 2`.
    expect(niceScale(2, { integer: true }).ticks).toEqual([0, 1, 2]);
    expect(niceScale(3, { integer: true }).ticks).toEqual([0, 1, 2, 3]);
    expect(niceScale(4, { integer: true }).ticks).toEqual([0, 1, 2, 3, 4]);
  });

  it("steps up once one-at-a-time would crowd the axis", () => {
    expect(niceScale(5, { integer: true }).ticks).toEqual([0, 2, 4, 6]);
    expect(niceScale(10, { integer: true }).ticks).toEqual([0, 5, 10]);
    expect(niceScale(12, { integer: true }).ticks).toEqual([0, 5, 10, 15]);
  });

  it("keeps the tick count at or under the target", () => {
    for (let peak = 1; peak <= 5000; peak++) {
      const scale = niceScale(peak, { integer: true });
      expect(scale.ticks.length).toBeLessThanOrEqual(5); // 4 above zero, plus zero
    }
  });

  it("does not overshoot a peak that is already a whole step", () => {
    // 100 should top out at 100, not 125 — an axis with dead space above the
    // tallest bar makes every bar shorter for no reason.
    expect(niceScale(100, { integer: true }).max).toBe(100);
    expect(niceScale(20, { integer: true }).max).toBe(20);
    expect(niceScale(8, { integer: true }).max).toBe(8);
  });

  it("scales into the thousands without losing its niceness", () => {
    expect(niceScale(1234, { integer: true }).ticks).toEqual([0, 500, 1000, 1500]);
    expect(niceScale(87_500, { integer: true }).ticks).toEqual([0, 25_000, 50_000, 75_000, 100_000]);
    expect(niceScale(2_400_000, { integer: true }).max).toBe(3_000_000);
  });
});

describe("an empty chart", () => {
  it("shows a real scale rather than collapsing", () => {
    // Dividing by a zero domain is how a bar chart draws NaN; and an axis of
    // four zeroes tells the admin nothing about what the chart would show.
    const scale = niceScale(0, { integer: true });
    expect(scale).toMatchObject({ max: 4, step: 1, ticks: [0, 1, 2, 3, 4] });
    expectWellFormed(scale, 0);
  });

  it("treats a missing or nonsense peak the same way", () => {
    for (const peak of [0, -5, NaN, Infinity]) {
      expectWellFormed(niceScale(peak, { integer: true }), 0);
    }
  });
});

describe("money (fractional axis)", () => {
  it("reads in cents when the whole chart is worth a few dollars", () => {
    // $0.75 peak: whole-dollar ticks would be `0 1 1 1` all over again.
    const scale = niceScale(0.75);
    expectWellFormed(scale, 0.75);
    expect(scale.ticks).toEqual([0, 0.25, 0.5, 0.75]);
    expect(scale.decimals).toBe(2);
    expect(scale.ticks.map((t) => formatTick(t, { decimals: scale.decimals, symbol: "$" }))).toEqual(
      ["$0.00", "$0.25", "$0.50", "$0.75"],
    );
  });

  it("has no drift in a tick built from 2.5 × 0.1", () => {
    // The arithmetic that would otherwise print $0.30000000000000004.
    for (const tick of niceScale(0.9).ticks) {
      expect(tick).toBe(Number(tick.toFixed(2)));
    }
  });

  it("switches to whole dollars once they are the readable unit", () => {
    expect(niceScale(12.99).ticks).toEqual([0, 5, 10, 15]);
    expect(niceScale(12.99).decimals).toBe(0);
    expect(niceScale(1558.8).ticks).toEqual([0, 500, 1000, 1500, 2000]);
  });

  it("formats a large amount with grouping and a symbol", () => {
    const scale = niceScale(43_210);
    expect(formatTick(scale.max, { decimals: scale.decimals, symbol: "$" })).toBe("$50,000");
  });

  it("stays distinct at every peak from a cent to a million dollars", () => {
    for (const peak of [0.01, 0.02, 0.05, 0.09, 0.5, 1, 1.5, 7, 99.99, 100, 12_345, 999_999]) {
      expectWellFormed(niceScale(peak), peak);
    }
  });
});

describe("formatTick", () => {
  it("states exactly as many decimals as the step needs", () => {
    expect(formatTick(1.5, { decimals: 2 })).toBe("1.50");
    expect(formatTick(1, { decimals: 0 })).toBe("1");
    expect(formatTick(2500, { decimals: 0 })).toBe("2,500");
  });

  it("puts the symbol inside the sign, the way money is written", () => {
    expect(formatTick(-12, { decimals: 0, symbol: "$" })).toBe("-$12");
  });
});

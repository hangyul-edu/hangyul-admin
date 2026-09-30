/**
 * Y-axis domains and ticks for the dashboard charts.
 *
 * Four fixed fractions of the peak (25%, 50%, 75%, 100%) rounded to integers
 * read correctly at a few hundred and fall apart underneath it: a peak of 1
 * prints `0 1 1 1`, and a peak of 2 prints `1 1 2 2`. Rounding invents the
 * duplicates, so de-duplicating labels afterwards cannot fix it — the *scale*
 * has to land on values worth printing.
 *
 * So ticks are chosen first and the axis top follows from them. Every candidate
 * step of the form 1/2/2.5/5 × 10ⁿ is costed, and the cheapest wins:
 *
 *   1. no more than `targetTicks` intervals — past that the axis is a ladder;
 *   2. at least two, so a chart is never labelled only at its ends;
 *   3. the lowest axis top, so the tallest bar reaches as near the ceiling as
 *      a round number allows and small differences are not flattened;
 *   4. on a tie, the most ticks — same domain, more to read off.
 *
 * Because every tick is a distinct multiple of a non-zero step, duplicate
 * labels are impossible rather than merely unlikely.
 *
 * `integer` is the other half of it. A chart counting signups cannot offer 2.5
 * of one, so its step is constrained to whole numbers — and where even a step
 * of 1 overshoots the target, the axis is simply shorter. That is the `0 1`
 * case: two ticks, both meaningful.
 */

/** Step mantissas an axis may use. Anything else is not a round number. */
const STEP_MANTISSAS = [1, 2, 2.5, 5, 10] as const;

/** Relative slack, so a peak that IS the axis top is not pushed up a step. */
const EPSILON = 1e-9;

export interface AxisScale {
  /** Axis top, in the data's own unit. Always ≥ the peak, and never 0. */
  max: number;
  /** Distance between neighbouring ticks. Always > 0. */
  step: number;
  /** Tick values, ascending, from 0 to `max` inclusive. */
  ticks: number[];
  /** Decimal places a label needs to state its tick exactly. */
  decimals: number;
}

export interface ScaleOptions {
  /** Restrict the step to whole numbers — for anything counted, not measured. */
  integer?: boolean;
  /** Intervals to aim for. The result never exceeds this. */
  targetTicks?: number;
}

/** One step under consideration, with everything the comparison needs. */
interface Candidate {
  step: number;
  decimals: number;
  count: number;
  max: number;
}

/**
 * An axis for data whose largest value is `peak`.
 *
 * `peak` is the maximum of the series in whatever unit the chart plots — for
 * money, pass major units (dollars, not cents), so ticks land on amounts a
 * person would say out loud.
 */
export function niceScale(
  peak: number,
  { integer = false, targetTicks = 4 }: ScaleOptions = {},
): AxisScale {
  const top = Number.isFinite(peak) && peak > 0 ? peak : 0;

  if (top === 0) {
    // Every value is zero, or there is no data. Collapsing the domain to 0..0
    // divides by zero and draws a flat line with nothing to read off it, so the
    // axis shows the smallest honest scale instead: an empty chart that still
    // says what one unit looks like.
    return wholeUnits(targetTicks);
  }

  const candidates = candidateSteps(top, integer, targetTicks);
  if (candidates.length === 0) {
    // An integer axis whose peak is under one interval — nothing to choose.
    return wholeUnits(Math.max(1, Math.ceil(top - EPSILON)));
  }

  // Rule 2 is a preference, not a requirement: a peak of 1 on an integer axis
  // has only the single-interval option, and two ticks there is correct.
  const roomy = candidates.filter((c) => c.count >= 2);
  const best = pickTightest(roomy.length > 0 ? roomy : candidates);

  const ticks = Array.from({ length: best.count + 1 }, (_, i) =>
    round(i * best.step, best.decimals),
  );
  return { max: ticks[best.count], step: best.step, ticks, decimals: best.decimals };
}

/** Every round step that fits the peak in `targetTicks` intervals or fewer. */
function candidateSteps(top: number, integer: boolean, targetTicks: number): Candidate[] {
  const base = Math.floor(Math.log10(top / targetTicks));
  const out: Candidate[] = [];
  const seen = new Set<number>();

  // One decade either side of the obvious one: the ideal step can sit just
  // below the boundary, and the largest candidates are the fallback for a peak
  // that no smaller step can reach in `targetTicks` intervals.
  for (let exponent = base - 1; exponent <= base + 2; exponent++) {
    const magnitude = 10 ** exponent;
    for (const mantissa of STEP_MANTISSAS) {
      // Rounded at the precision the pair implies, which is what turns
      // `2.5 * 0.1` back into 0.25 before anything is derived from it.
      const step = round(mantissa * magnitude, Math.max(0, -exponent + 1));
      if (step <= 0 || seen.has(step)) continue;
      if (integer && !Number.isInteger(step)) continue;
      seen.add(step);
      // From the step, not from the pair that produced it: 10 × 0.1 and 1 × 1
      // are the same step, and it needs no decimal place either way.
      const decimals = decimalsFor(step);

      const count = Math.ceil(top / step - EPSILON);
      if (count < 1 || count > targetTicks) continue;
      out.push({ step, decimals, count, max: round(count * step, decimals) });
    }
  }
  return out;
}

/** Lowest axis top wins; on a tie, the one with more ticks. */
function pickTightest(candidates: Candidate[]): Candidate {
  return candidates.reduce((best, c) =>
    c.max < best.max || (c.max === best.max && c.count > best.count) ? c : best,
  );
}

/** An axis of whole units from 0 to `max`. */
function wholeUnits(max: number): AxisScale {
  return {
    max,
    step: 1,
    ticks: Array.from({ length: max + 1 }, (_, i) => i),
    decimals: 0,
  };
}

/** Undoes the drift in `2.5 * 0.1`, which a tick label would otherwise show. */
function round(value: number, decimals: number): number {
  return Number(value.toFixed(Math.min(15, Math.max(0, decimals))));
}

/** Decimal places needed to write `value` exactly. */
function decimalsFor(value: number): number {
  if (Number.isInteger(value)) return 0;
  const text = String(value);
  const point = text.indexOf(".");
  // Exponential notation (below 1e-6) has no point to measure from; such a step
  // is far outside anything the dashboard plots, so derive it from the decade.
  if (point < 0) return Math.min(15, Math.max(0, -Math.floor(Math.log10(Math.abs(value))) + 1));
  return text.length - point - 1;
}

/**
 * A tick as the axis should print it.
 *
 * `decimals` comes from the step, so a $0.25 axis reads `$0.25` while a $2,000
 * one reads `$2,000` — precision follows the scale instead of being fixed at
 * either end.
 */
export function formatTick(
  value: number,
  { decimals, symbol = "" }: { decimals: number; symbol?: string },
): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}${symbol}${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

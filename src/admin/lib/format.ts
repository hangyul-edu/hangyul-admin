/**
 * How the admin portal renders instants, money and durations.
 *
 * Formatting, not presentation: no component imports this to *be* a component,
 * they import it to turn an API value into the string they display. Kept out
 * of the component kit for that reason.
 */

/**
 * The clock the whole admin portal reads and writes on.
 *
 * The API sends instants (UTC), and rendering them in whatever timezone the
 * viewer's laptop happens to be set to means two admins looking at the same
 * row see different times, and neither matches the KST figures on the
 * dashboard. Pinning the portal to Seoul makes every timestamp mean one
 * thing. Mirrors the backend's reporting clock — see
 * src/modules/admin/application/reporting.py.
 */
export const ADMIN_TIME_ZONE = "Asia/Seoul";

/**
 * The locale every date in the portal is formatted in.
 *
 * The portal has no i18n layer, so this is Korean today. It exists as a
 * constant rather than a literal repeated at each call so that adding English
 * later is one edit — and so the date helpers cannot drift apart in the
 * meantime.
 */
export const ADMIN_LOCALE = "ko-KR";

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(ADMIN_LOCALE, {
    timeZone: ADMIN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(ADMIN_LOCALE, { timeZone: ADMIN_TIME_ZONE });
}

/**
 * ISO instant → the `YYYY-MM-DDTHH:mm` a `<input type="datetime-local">` wants,
 * with the wall-clock reading taken in Seoul.
 *
 * `<input type="datetime-local">` has no timezone: it holds a wall-clock
 * reading and the surrounding code decides what that means. Since the portal
 * *displays* KST, its inputs have to read and write KST too — otherwise an
 * admin abroad types 19:00, saves, and the table renders their entry back at
 * a different time.
 */
export function toAdminInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // en-CA gives ISO-ordered date parts, so the pieces need no reshuffling.
  const [date, time] = d
    .toLocaleString("en-CA", {
      timeZone: ADMIN_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .split(", ");
  // Some engines render midnight as "24:00"; the input control rejects it.
  return `${date}T${time.replace(/^24:/, "00:")}`;
}

/**
 * The inverse: a `datetime-local` value read as KST → an ISO instant for the API.
 *
 * Returns `null` for an empty or unparseable value so callers can pass it
 * straight through to a nullable field.
 */
export function fromAdminInputValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match;
  // Seoul is a fixed +09:00 (no DST since 1988), so the offset can be written
  // into the string and Date parses an unambiguous instant. A named zone would
  // need a lookup here to know which offset applied on that date.
  const iso = `${y}-${mo}-${d}T${h}:${mi}:00+09:00`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * An instant split into the two lines a timestamp is shown on.
 *
 * The audit screens read a column of times looking for *when*, so the seconds
 * matter and the date should not push the time off the edge. Returning the
 * parts rather than a joined string lets the caller put each on its own line
 * and keep both unbreakable, which a single string with a separator cannot do.
 *
 * Same locale and same clock as `formatDateTime` — this changes the shape of
 * the display, not what instant it names. Returns `null` for a missing or
 * unparseable value so the caller decides what to show instead.
 *
 * Both lines are built from Intl option sets rather than a written-out pattern,
 * so `locale` is all that has to change for the portal to read in English.
 */
export function formatDateTimeParts(
  value: string | null | undefined,
  locale: string = ADMIN_LOCALE,
): { date: string; time: string } | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return {
    date: d.toLocaleDateString(locale, {
      timeZone: ADMIN_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }),
    time: d.toLocaleTimeString(locale, {
      timeZone: ADMIN_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}

/** Currencies whose smallest unit IS the unit — no cents to divide out. */
const ZERO_DECIMAL = new Set(["KRW", "JPY"]);

/**
 * Minor units → the number a person reads, without a symbol.
 *
 * For chart axes, where the currency is named once on the axis rather than
 * repeated on every tick. Same rule as `formatMoney` so the two cannot
 * disagree about whether a currency has cents.
 */
export function toMajorUnits(cents: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toUpperCase()) ? cents : cents / 100;
}

/**
 * Minor units → a currency string, formatted the way the money is priced.
 *
 * Everything is billed in USD: the plan catalogue is USD, an invoice copies its
 * plan's currency and a payment copies its invoice's, so amounts arrive here as
 * cents and read back as dollars. Nothing is converted — the number is already
 * in the currency it says it is.
 *
 * The locale is `en-US`, not the portal's Korean, because `ko-KR` renders USD
 * as `US$12.99`; the dollar sign belongs on its own. The currency still comes
 * from the row rather than being assumed, so a legacy amount in anything else
 * is labelled honestly instead of being silently relabelled as dollars —
 * including the zero-decimal currencies, where treating the stored integer as
 * cents would divide the amount by a hundred.
 */
export function formatMoney(cents: number, currency: string): string {
  const code = currency.toUpperCase();
  const zeroDecimal = ZERO_DECIMAL.has(code);
  const amount = zeroDecimal ? cents : cents / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: zeroDecimal ? 0 : 2,
      maximumFractionDigits: zeroDecimal ? 0 : 2,
    }).format(amount);
  } catch {
    return `${amount.toLocaleString("en-US")} ${code}`;
  }
}

/** Currencies whose smallest unit IS the unit — for a chart axis to know. */
export function isZeroDecimal(currency: string): boolean {
  return ZERO_DECIMAL.has(currency.toUpperCase());
}

/**
 * Just the symbol — `$`, `₩` — for a chart axis.
 *
 * An axis names its currency once per tick and has no room for `US$12.99`, so
 * it takes the symbol from the same `en-US` formatting `formatMoney` uses and
 * puts it in front of a plain number. An unknown code has no symbol to show,
 * and returning the code would collide with the digits; the empty string keeps
 * the axis readable and the tooltip still spells the amount out in full.
 */
export function currencySymbol(currency: string): string {
  const code = currency.toUpperCase();
  try {
    const parts = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).formatToParts(0);
    const symbol = parts.find((p) => p.type === "currency")?.value ?? "";
    return symbol === code ? "" : symbol;
  } catch {
    return "";
  }
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h) return `${h}시간 ${m}분`;
  if (m) return `${m}분 ${s}초`;
  return `${s}초`;
}

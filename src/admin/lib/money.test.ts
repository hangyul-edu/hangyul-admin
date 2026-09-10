/**
 * How the portal renders money.
 *
 * Billing is USD end to end — the plan catalogue is priced in USD, an invoice
 * copies its plan's currency and a payment copies its invoice's — so amounts
 * arrive as cents and have to read back as dollars with a plain `$`.
 *
 * Nothing here converts between currencies. The currency still travels with the
 * amount, so these tests also pin the honest handling of a row that is not USD:
 * it is labelled as what it is rather than relabelled, and a zero-decimal
 * amount is not quietly divided by a hundred.
 */
import { describe, expect, it } from "vitest";
import { formatMoney, toMajorUnits } from "./format";

describe("formatMoney in USD", () => {
  it("reads cents back as dollars behind a plain $", () => {
    expect(formatMoney(1299, "USD")).toBe("$12.99");
    expect(formatMoney(15588, "USD")).toBe("$155.88");
  });

  it("never prefixes the symbol with the country", () => {
    // ko-KR renders USD as "US$12.99"; the portal formats in en-US to avoid it.
    expect(formatMoney(1299, "USD")).not.toContain("US$");
    expect(formatMoney(1299, "USD").startsWith("$")).toBe(true);
  });

  it("always shows two decimal places", () => {
    expect(formatMoney(500, "USD")).toBe("$5.00");
    expect(formatMoney(0, "USD")).toBe("$0.00");
    expect(formatMoney(1250, "USD")).toBe("$12.50");
  });

  it("groups thousands", () => {
    expect(formatMoney(123456789, "USD")).toBe("$1,234,567.89");
  });

  it("keeps a refund readable as a negative amount", () => {
    expect(formatMoney(-1299, "USD")).toBe("-$12.99");
  });

  it("accepts a lowercase code", () => {
    expect(formatMoney(1299, "usd")).toBe("$12.99");
  });
});

describe("a row that is not USD", () => {
  it("is labelled as what it is, not relabelled as dollars", () => {
    // No conversion happens anywhere; the amount is already in its currency.
    expect(formatMoney(12900, "KRW")).toContain("12,900");
    expect(formatMoney(12900, "KRW")).not.toContain("$12,900");
  });

  it("does not divide a zero-decimal amount by a hundred", () => {
    // ₩12,900 is 12900, not 129.
    expect(formatMoney(12900, "KRW")).not.toContain("129.00");
    expect(toMajorUnits(12900, "KRW")).toBe(12900);
    expect(toMajorUnits(12900, "USD")).toBe(129);
  });

  it("falls back to a readable string for an unknown code", () => {
    expect(formatMoney(1299, "ZZZ")).toContain("ZZZ");
  });
});

describe("toMajorUnits", () => {
  it("agrees with formatMoney about which currencies have cents", () => {
    expect(toMajorUnits(1299, "USD")).toBe(12.99);
    expect(toMajorUnits(1299, "usd")).toBe(12.99);
    expect(toMajorUnits(1299, "JPY")).toBe(1299);
  });
});

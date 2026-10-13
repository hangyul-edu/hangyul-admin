/**
 * How the portal renders money.
 *
 * Plans are priced in KRW and USD, an invoice is in its subscription's
 * currency and a payment in its invoice's, so the currency travels with every
 * amount. USD always reads "US$" — never a bare "$" — and KRW "₩".
 *
 * Nothing here converts between currencies. These tests also pin the honest
 * handling of any other code: it is labelled as what it is rather than
 * relabelled, and a zero-decimal amount is not quietly divided by a hundred.
 */
import { describe, expect, it } from "vitest";
import { formatMoney, toMajorUnits } from "./format";

describe("formatMoney in USD", () => {
  it("reads cents back as dollars behind US$", () => {
    expect(formatMoney(1299, "USD")).toBe("US$12.99");
    expect(formatMoney(15588, "USD")).toBe("US$155.88");
  });

  it("always shows two decimal places", () => {
    expect(formatMoney(500, "USD")).toBe("US$5.00");
    expect(formatMoney(0, "USD")).toBe("US$0.00");
    expect(formatMoney(1250, "USD")).toBe("US$12.50");
  });

  it("groups thousands", () => {
    expect(formatMoney(123456789, "USD")).toBe("US$1,234,567.89");
  });

  it("keeps a refund readable as a negative amount", () => {
    expect(formatMoney(-1299, "USD")).toBe("-US$12.99");
  });

  it("accepts a lowercase code", () => {
    expect(formatMoney(1299, "usd")).toBe("US$12.99");
  });
});

describe("formatMoney in KRW", () => {
  it("shows whole won behind ₩", () => {
    expect(formatMoney(12900, "KRW")).toBe("₩12,900");
    expect(formatMoney(-9900, "krw")).toBe("-₩9,900");
  });

  it("does not divide a zero-decimal amount by a hundred", () => {
    // ₩12,900 is 12900, not 129.
    expect(formatMoney(12900, "KRW")).not.toContain("129.00");
    expect(toMajorUnits(12900, "KRW")).toBe(12900);
    expect(toMajorUnits(12900, "USD")).toBe(129);
  });
});

describe("any other code", () => {
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

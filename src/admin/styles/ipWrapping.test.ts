/**
 * An IP address must never be split across lines.
 *
 * Broken, "192.168.0.1" reads as two plausible fragments, and an IPv6 is worse
 * — its colon groups look exactly like a wrap point, so you cannot tell the
 * address from the layout. The portal renders IPs with `.hgadm-cell-mono`,
 * whose whole purpose is the opposite: it sets `word-break: break-all` so IDs
 * and tokens break rather than widen a table. `.hgadm-ip` is the opt-out.
 *
 * jsdom resolves the cascade for these properties (the same basis
 * styles/wrapping.test.ts works on), so this asserts the computed values a
 * browser would use, not just the presence of a declaration.
 */
// @ts-expect-error - @types/node is not a dependency of this project; the test
// runner is Node, so the module is really there.
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

const CSS: string = readFileSync("src/admin/styles/admin.css", "utf8");

beforeAll(() => {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
});

function styleOf(html: string, id: string): CSSStyleDeclaration {
  document.body.innerHTML = html;
  return getComputedStyle(document.getElementById(id)!);
}

/** Exactly how the Activity History renders an IP, in both of its places. */
const AS_RENDERED = [
  ["table cell", '<span id="t" class="hgadm-cell-mono hgadm-ip">203.0.113.42</span>'],
  ["detail drawer", '<dd id="t" class="hgadm-cell-mono hgadm-ip">203.0.113.42</dd>'],
] as const;

describe("IP addresses stay on one line", () => {
  it.each(AS_RENDERED)("does not wrap in the %s", (_where, html) => {
    expect(styleOf(html, "t").whiteSpace).toBe("nowrap");
  });

  it("is the mono class that would otherwise break it apart", () => {
    // Guards the premise: if .hgadm-cell-mono ever stopped breaking, .hgadm-ip
    // would be pointless and this test would be reassuring about nothing.
    expect(styleOf('<span id="t" class="hgadm-cell-mono">usr_1</span>', "t").wordBreak).toBe(
      "break-all",
    );
  });

  it("still renders an IP in the monospace face", () => {
    // The opt-out must not cost the alignment that makes a column of addresses
    // scannable.
    const font = styleOf(AS_RENDERED[0][1], "t").fontFamily;
    expect(font).toContain("monospace");
  });

  it("handles a full-length IPv6 the same way", () => {
    // 45 characters, the widest the column can store (ip_address is String(45)).
    const ipv6 = "2001:0db8:85a3:0000:0000:8a2e:0370:7334";
    const style = styleOf(`<span id="t" class="hgadm-cell-mono hgadm-ip">${ipv6}</span>`, "t");
    expect(style.whiteSpace).toBe("nowrap");
  });

  it("overflows rather than pushing its container wider", () => {
    // The escape valve that keeps nowrap from breaking the layout: the table
    // wrapper scrolls, and in a block context the value scrolls on its own.
    const style = styleOf(AS_RENDERED[1][1], "t");
    expect(style.overflowX).toBe("auto");
    expect(style.maxWidth).toBe("100%");
  });

  it("leaves the surrounding table free to scroll", () => {
    expect(styleOf('<div id="t" class="hgadm-table-wrap"></div>', "t").overflowX).toBe("auto");
  });
});

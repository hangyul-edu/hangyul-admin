/**
 * The status legend lines its explanations up.
 *
 * A badge is only as wide as its own word — 활성 is narrower than 인증 대기 —
 * so rows laid out independently start their prose at three different places
 * and the block reads as a list of unrelated sentences. Sharing one term
 * column is what makes it a legend.
 *
 * jsdom does no layout but resolves the declarations, so this asserts the
 * computed values a browser would use — the same basis as
 * timestampWrapping.test.ts, whose header explains the technique.
 */
// @ts-expect-error - @types/node is not a dependency of this project; the test
// runner is Node, so the module is really there.
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

const CSS: string = readFileSync("src/admin/styles/admin.css", "utf8");

const MARKUP = `
  <dl id="legend" class="hgadm-legend">
    <div id="row" class="hgadm-legend__row">
      <dt id="term"><span class="hgadm-badge">활성</span></dt>
      <dd id="desc">정상적으로 로그인하고 서비스를 이용할 수 있는 상태입니다.</dd>
    </div>
  </dl>`;

beforeAll(() => {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  document.body.innerHTML = MARKUP;
});

const styleOf = (id: string) => getComputedStyle(document.getElementById(id)!);

describe("the legend grid", () => {
  it("puts the badge and its explanation in two columns", () => {
    expect(styleOf("legend").display).toBe("grid");
    expect(styleOf("legend").gridTemplateColumns).toBe("auto 1fr");
  });

  it("has each row share the list's own columns, not invent its own", () => {
    // Without subgrid every row sizes its term box to its own badge, and the
    // explanations start at a different x on each line.
    expect(styleOf("row").gridTemplateColumns).toBe("subgrid");
    expect(styleOf("row").gridColumn).toBe("1 / -1");
  });

  it("keeps the badge at its natural width", () => {
    // `justify-self: start` — a stretched badge would draw a pill the width of
    // the widest label with its text adrift inside.
    expect(styleOf("term").justifySelf).toBe("start");
  });

  it("gives the explanation room to breathe", () => {
    expect(styleOf("desc").margin).toBe("0px");
    expect(Number(styleOf("desc").lineHeight)).toBeGreaterThan(1.5);
  });
});

describe("fallbacks", () => {
  it("aligns on a fixed term column where subgrid is unsupported", () => {
    // Safari shipped subgrid late; without this the rows still line up.
    expect(CSS).toMatch(
      /@supports not \(grid-template-columns: subgrid\)[\s\S]*?grid-template-columns:\s*92px 1fr/,
    );
  });

  it("stacks the badge above its text on a narrow screen", () => {
    // Two columns leave the prose a thin ribbon once the viewport is small.
    expect(CSS).toMatch(
      /@media \(max-width: 720px\)[\s\S]*?\.hgadm-legend__row\s*\{[\s\S]*?grid-template-columns:\s*1fr/,
    );
  });
});

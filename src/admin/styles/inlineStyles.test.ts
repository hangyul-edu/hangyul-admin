/**
 * Styling lives in the stylesheets, not in `style={{…}}`.
 *
 * A literal inline style cannot be reused, themed or overridden at a
 * breakpoint, and copies of it drift apart (seven spellings of "a little space
 * above" had accumulated). Utilities and pattern classes in admin.css replace
 * them; inline styles remain only where the value is computed at runtime — a
 * progress bar's width, a marker's position on a timeline, a floating menu's
 * coordinates. The allowance below names those, so a new literal one fails
 * here, and so does a class name no stylesheet defines.
 */
// @ts-expect-error - @types/node is not a dependency of this project; the test
// runner is Node, so the module is really there.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Files allowed inline styles, and how many — each one a runtime value. */
const DYNAMIC_STYLES: Record<string, number> = {
  "components/kit.tsx": 1, // dropdown menu coordinates
  "components/learning.tsx": 1, // bar width
  "pages/Dashboard.tsx": 1, // chart tooltip position
  "pages/leagues/LeaguesPage.tsx": 1, // capacity fill ratio
  "pages/lectures/CheckpointEditor.tsx": 4, // playhead and marker positions
  "pages/lectures/LectureVideoPanel.tsx": 1, // upload progress
};

/** Structural hooks: named for tests and selectors, styled through their children. */
const HOOK_CLASSES = new Set([
  "hgadm-cfg__detail",
  "hgadm-cfg__form",
  "hgadm-cpe",
  "hgadm-cpe__stage",
  "hgadm-faq-lang",
  "hgadm-lw",
  "hgadm-lw__video",
  "hgadm-offer",
]);

const ROOT = "src/admin";

function sources(): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) {
        out.push({ path: path.slice(ROOT.length + 1), text: readFileSync(path, "utf8") });
      }
    }
  };
  walk(ROOT);
  return out;
}

function stylesheets(): string {
  return readdirSync(`${ROOT}/styles`)
    .filter((name: string) => name.endsWith(".css"))
    .map((name: string) => readFileSync(`${ROOT}/styles/${name}`, "utf8"))
    .join("\n");
}

describe("admin styling", () => {
  it("keeps inline styles to runtime values", () => {
    const counts: Record<string, number> = {};
    for (const { path, text } of sources()) {
      const n = (text.match(/style=\{\{/g) ?? []).length;
      if (n) counts[path] = n;
    }
    expect(counts).toEqual(DYNAMIC_STYLES);
  });

  it("uses only classes a stylesheet defines", () => {
    const css = stylesheets();
    const defined = new Set([...css.matchAll(/\.((?:hgadm|hgins|hgbulk)-[\w-]+)/g)].map((m) => m[1]));
    const undefinedClasses = new Set<string>();
    for (const { text } of sources()) {
      for (const m of text.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        for (const name of (m[1] ?? m[2] ?? "").match(/\b(?:hgadm|hgins|hgbulk)-[\w-]+/g) ?? []) {
          // A name ending in "-" is a template prefix (`hgadm-alert-row--${tone}`).
          if (!name.endsWith("-") && !defined.has(name) && !HOOK_CLASSES.has(name)) undefinedClasses.add(name);
        }
      }
    }
    expect([...undefinedClasses].sort()).toEqual([]);
  });
});

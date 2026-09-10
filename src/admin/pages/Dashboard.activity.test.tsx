/**
 * The dashboard's recent-activity row: what it says, and why it stays put.
 *
 * Content comes from the same `describeAuditAction` the Activity History page
 * uses, so the two screens cannot describe one row two different ways — the
 * tests below pin that the dashboard gets the *refined* label, which it can
 * only do because the row now carries the before/after snapshots.
 *
 * The layout half is checked against the stylesheet rather than a browser.
 * jsdom does no layout, so asserting a rendered width would prove nothing;
 * what can be pinned is the handful of declarations that make the row immune
 * to text length. Each is the fix for a specific way this list used to go
 * crooked, and each would be easy to undo by accident.
 */
// @ts-expect-error - @types/node is not a dependency; the runner is Node, so
// the module is really there. Same escape hatch as styles/wrapping.test.ts.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdminActivityRow } from "./Dashboard";
import type { RecentAdminActionRow } from "../api";

function entry(overrides: Partial<RecentAdminActionRow> = {}): RecentAdminActionRow {
  return {
    id: 1,
    actor_id: "usr_a",
    actor_name: "김하늘",
    actor_email: "haneul@talkhangyul.co.kr",
    action: "POST /admin/admins",
    object_type: "admin",
    object_id: "usr_target",
    before: null,
    after: null,
    occurred_at: "2026-09-10T04:05:00Z",
    ...overrides,
  };
}

describe("what the row says", () => {
  it("leads with the action, not the endpoint", () => {
    const { container } = render(<AdminActivityRow entry={entry()} />);
    expect(container.querySelector(".hgadm-recent__primary")?.textContent).toBe(
      "관리자 권한 부여",
    );
  });

  it("keeps the endpoint, demoted to its own line", () => {
    const { container } = render(<AdminActivityRow entry={entry()} />);
    expect(container.querySelector(".hgadm-recent__tertiary")?.textContent).toBe(
      "POST /admin/admins",
    );
  });

  it("uses the same refined label as the history page", () => {
    // Only possible because the dashboard row carries before/after now; without
    // them this would read the coarser "회원 정보 변경".
    const { container } = render(
      <AdminActivityRow
        entry={entry({
          action: "PATCH /admin/users/{user_id}",
          before: { state: { role: "member", status: "active" } } as never,
          after: { state: { role: "member", status: "suspended" } } as never,
        })}
      />,
    );
    expect(container.querySelector(".hgadm-recent__primary")?.textContent).toBe(
      "회원 계정 정지",
    );
    expect(container.querySelector(".hgadm-recent__rest")?.textContent).toBe(
      "상태 활성 → 정지",
    );
  });

  it("names the admin by name", () => {
    const { container } = render(<AdminActivityRow entry={entry()} />);
    expect(container.querySelector(".hgadm-recent__lead")?.textContent).toBe("김하늘");
  });

  it("falls back to the email when an admin has no name", () => {
    const { container } = render(<AdminActivityRow entry={entry({ actor_name: null })} />);
    expect(container.querySelector(".hgadm-recent__lead")?.textContent).toBe(
      "haneul@talkhangyul.co.kr",
    );
  });

  it("says 시스템 for an action with no admin behind it", () => {
    const { container } = render(
      <AdminActivityRow entry={entry({ actor_id: null, actor_name: null, actor_email: null })} />,
    );
    expect(container.querySelector(".hgadm-recent__lead")?.textContent).toBe("시스템");
  });

  it("shows the object when the row records no richer context", () => {
    const { container } = render(
      <AdminActivityRow entry={entry({ action: "POST /admin/banners", object_type: "banners", object_id: "bnr_1" })} />,
    );
    expect(container.querySelector(".hgadm-recent__rest")?.textContent).toBe("banners · bnr_1");
  });

  it("drops the endpoint line for an action it cannot name, since that IS the label", () => {
    const { container } = render(<AdminActivityRow entry={entry({ action: "POST /admin/new" })} />);
    expect(container.querySelector(".hgadm-recent__primary")?.textContent).toBe("POST /admin/new");
    expect(container.querySelector(".hgadm-recent__tertiary")).toBeNull();
  });

  it("renders the timestamp as a machine-readable time", () => {
    render(<AdminActivityRow entry={entry()} />);
    const time = screen.getByText(/2026/);
    expect(time.tagName).toBe("TIME");
    expect(time.getAttribute("datetime")).toBe("2026-09-10T04:05:00Z");
  });
});

describe("why the row stays aligned", () => {
  const css: string = readFileSync("src/admin/styles/admin.css", "utf8");
  const block = css.slice(css.indexOf(".hgadm-recent {"), css.indexOf(".hgadm-json"));

  it("lets the text column shrink instead of shoving the timestamp", () => {
    // A grid track's default `auto` minimum refuses to go below its content,
    // which is exactly how a long action used to push the time off the row.
    expect(block).toContain("grid-template-columns: minmax(0, 1fr) auto");
  });

  it("gives the text column a zero minimum so its children can ellipsis", () => {
    expect(block).toMatch(/\.hgadm-recent__body\s*{[^}]*min-width:\s*0/);
  });

  it("keeps the trailing column on one line so it is the same width every row", () => {
    expect(block).toMatch(/\.hgadm-recent__trailing\s*{[^}]*white-space:\s*nowrap/);
  });

  it("pins the timestamp to the first line when the action wraps", () => {
    expect(block).toContain("align-items: start");
  });

  it("truncates both halves of the meta line rather than letting one win", () => {
    for (const part of ["lead", "rest"]) {
      expect(block).toMatch(
        new RegExp(`\\.hgadm-recent__${part}\\s*{[^}]*min-width:\\s*0[^}]*text-overflow:\\s*ellipsis`, "s"),
      );
    }
  });

  it("bounds the action at two lines so one row cannot dominate the card", () => {
    expect(block).toMatch(/\.hgadm-recent__primary\s*{[^}]*-webkit-line-clamp:\s*2/);
  });

  it("stacks instead of squeezing on a narrow viewport", () => {
    expect(css).toMatch(/@media \(max-width: 560px\)\s*{\s*\.hgadm-recent\s*{/);
  });

  it("sizes no column with a hard-coded width", () => {
    // A fixed width is the trap this layout exists to avoid: it looks tidy
    // until a longer timestamp format or a translation clips.
    expect(block).not.toMatch(/\.hgadm-recent__time\s*{[^}]*[^-]width:\s*\d/);
  });
});

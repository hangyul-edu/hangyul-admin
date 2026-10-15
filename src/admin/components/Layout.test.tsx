import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AdminLayout, activeNavTarget } from "./Layout";

/** Scopes the signed-in admin lacks (everything else is allowed). */
let denied: string[] = [];
vi.mock("../auth", () => ({
  useAdminAuth: () => ({
    status: "signed-in",
    me: { user_id: "u", email: "a@b.co", name: "관리자", nickname: "adm",
          admin_role: "super_admin", scopes: ["users:read", "ops:read", "audit:read"] },
    login: vi.fn(),
    logout: vi.fn(),
    can: (scope: string) => !denied.includes(scope),
  }),
}));

function renderLayout(at = "/users") {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route element={<AdminLayout />}>
          <Route path="/" element={<div>DASHBOARD PAGE</div>} />
          <Route path="/users" element={<div>USERS PAGE</div>} />
          <Route path="/users/:userId" element={<div>USER DETAIL</div>} />
          <Route path="/leagues" element={<div>LEAGUES PAGE</div>} />
          <Route path="/leagues/unassigned" element={<div>UNASSIGNED PAGE</div>} />
          <Route path="/leagues/:seasonId/:groupId" element={<div>LEAGUE DETAIL</div>} />
          <Route path="/learning/proficiency/:userId" element={<div>PROFICIENCY DETAIL</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const sidebar = () => document.querySelector("aside.hgadm-sidebar") as HTMLElement;
const toggle = () => screen.getByRole("button", { name: /사이드바 (접기|펼치기)/ });

describe("admin sidebar", () => {
  beforeEach(() => localStorage.clear());

  it("starts expanded, with labels visible", () => {
    renderLayout();
    expect(sidebar().className).not.toContain("is-collapsed");
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    // The nav label is real text when expanded, not just a tooltip.
    expect(within(sidebar()).getByText("사용자 관리")).toBeInTheDocument();
  });

  it("collapses and expands on the control", async () => {
    const user = userEvent.setup();
    renderLayout();

    await user.click(toggle());
    expect(sidebar().className).toContain("is-collapsed");
    expect(toggle()).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle());
    expect(sidebar().className).not.toContain("is-collapsed");
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
  });

  it("names the control for what a click will do", async () => {
    const user = userEvent.setup();
    renderLayout();
    expect(screen.getByRole("button", { name: "사이드바 접기" })).toBeInTheDocument();
    await user.click(toggle());
    expect(screen.getByRole("button", { name: "사이드바 펼치기" })).toBeInTheDocument();
  });

  it("keeps every menu item reachable and named while collapsed", async () => {
    const user = userEvent.setup();
    renderLayout();
    await user.click(toggle());

    // The visible label is hidden by CSS when collapsed, which also drops it
    // from the accessibility tree — so each link carries its own name and
    // tooltip. Without this the collapsed rail is a row of unlabelled icons.
    const link = within(sidebar()).getByRole("link", { name: "사용자 관리" });
    expect(link).toHaveAttribute("title", "사용자 관리");
    expect(link).toHaveAttribute("href", "/users");
  });

  it("still marks the active item while collapsed", async () => {
    const user = userEvent.setup();
    renderLayout();
    const active = within(sidebar()).getByRole("link", { name: "사용자 관리" });
    expect(active.className).toContain("active");

    await user.click(toggle());
    // The active class drives both the background and the left bar, so the
    // current page stays identifiable with no text on screen.
    expect(within(sidebar()).getByRole("link", { name: "사용자 관리" }).className)
      .toContain("active");
  });

  it("lights one item only, when a menu item sits under another", () => {
    /* 리그 미배정 회원 (/leagues/unassigned) lives under 진행 중인 리그
       (/leagues). Prefix matching lit both — the sidebar claimed two current
       pages at once, and so did the accessibility tree. */
    renderLayout("/leagues/unassigned");
    const nav = within(sidebar());

    expect(nav.getByRole("link", { name: "리그 미배정 회원" }).className).toContain("active");
    expect(nav.getByRole("link", { name: "진행 중인 리그" }).className).not.toContain("active");
    expect(nav.getAllByRole("link").filter((l) => l.getAttribute("aria-current") === "page"))
      .toHaveLength(1);
  });

  it("keeps a section lit for its own sub-pages", () => {
    /* Why `end` on every link is not the fix: a league's detail page belongs
       to 진행 중인 리그 and has no menu item of its own. */
    renderLayout("/leagues/2026-W37/grp_1");
    const nav = within(sidebar());

    expect(nav.getByRole("link", { name: "진행 중인 리그" }).className).toContain("active");
    expect(nav.getByRole("link", { name: "리그 미배정 회원" }).className).not.toContain("active");
  });

  it("marks the section itself when it is the page", () => {
    renderLayout("/leagues");
    const nav = within(sidebar());

    expect(nav.getByRole("link", { name: "진행 중인 리그" }).className).toContain("active");
    expect(nav.getByRole("link", { name: "리그 미배정 회원" }).className).not.toContain("active");
  });

  it("keeps one 학습 인사이트 item lit across the pages it joins as tabs", () => {
    /* 학습 현황 and 레벨 판정 are one menu item (학습자); the second page is
       not under the first's path, so plain prefix matching would light
       nothing on it. */
    renderLayout("/learning/proficiency/usr_1");
    const nav = within(sidebar());

    expect(nav.getByRole("link", { name: "학습자" }).className).toContain("active");
    expect(nav.getByRole("link", { name: "한눈에 보기" }).className).not.toContain("active");
    expect(nav.queryByRole("link", { name: "레벨 판정" })).not.toBeInTheDocument();
  });

  it("links a joined item to the first of its pages the admin can open", () => {
    // An AI operator without analytics:read cannot open 맞춤 학습, only AI 기능·비용.
    denied = ["analytics:read"];
    try {
      renderLayout("/");
      expect(within(sidebar()).getByRole("link", { name: "맞춤 학습·AI" })).toHaveAttribute("href", "/learning/ai");
    } finally {
      denied = [];
    }
  });

  it("names the content package import for what it does", () => {
    renderLayout("/");
    const link = within(sidebar()).getByRole("link", { name: "콘텐츠 업데이트" });
    expect(link).toHaveAttribute("href", "/content-updates");
    expect(within(sidebar()).queryByText("카탈로그 가져오기")).not.toBeInTheDocument();
  });

  it("does not let the dashboard claim every page", () => {
    renderLayout("/users/usr_1");
    const nav = within(sidebar());

    expect(nav.getByRole("link", { name: "사용자 관리" }).className).toContain("active");
    expect(nav.getByRole("link", { name: "대시보드" }).className).not.toContain("active");
  });

  it("does not disturb the page content", async () => {
    const user = userEvent.setup();
    renderLayout();
    expect(screen.getByText("USERS PAGE")).toBeInTheDocument();
    await user.click(toggle());
    // Collapsing is a sidebar concern; the outlet must not remount or vanish.
    expect(screen.getByText("USERS PAGE")).toBeInTheDocument();
  });

  it("remembers the preference across a remount", async () => {
    const user = userEvent.setup();
    const { unmount } = renderLayout();
    await user.click(toggle());
    expect(localStorage.getItem("hangyul.admin.sidebar.v1")).toBe("collapsed");
    unmount();

    renderLayout();
    expect(sidebar().className).toContain("is-collapsed");
  });

  it("survives storage being unavailable", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    // Private-browsing mode throws on access; the sidebar must still render,
    // just at its default width.
    expect(() => renderLayout()).not.toThrow();
    expect(sidebar().className).not.toContain("is-collapsed");
    getItem.mockRestore();
  });
});

describe("admin sidebar groups", () => {
  beforeEach(() => localStorage.clear());
  const group = (label: string) => within(sidebar()).getByRole("button", { name: label });

  it("folds a group away and opens it again", async () => {
    const user = userEvent.setup();
    renderLayout("/users");
    expect(group("운영")).toHaveAttribute("aria-expanded", "true");
    await user.click(group("운영"));
    expect(group("운영")).toHaveAttribute("aria-expanded", "false");
    expect(within(sidebar()).queryByRole("link", { name: "공지" })).not.toBeInTheDocument();
    await user.click(group("운영"));
    expect(within(sidebar()).getByRole("link", { name: "공지" })).toBeInTheDocument();
  });

  it("remembers folded groups across a remount", async () => {
    const user = userEvent.setup();
    const { unmount } = renderLayout("/users");
    await user.click(group("시스템"));
    unmount();
    renderLayout("/users");
    expect(group("시스템")).toHaveAttribute("aria-expanded", "false");
    expect(within(sidebar()).queryByRole("link", { name: "관리자 계정" })).not.toBeInTheDocument();
  });

  it("never folds the group holding the current page", async () => {
    localStorage.setItem("hangyul.admin.navgroups.v1", JSON.stringify(["사용자"]));
    renderLayout("/users");
    expect(group("사용자")).toBeDisabled();
    expect(group("사용자")).toHaveAttribute("aria-expanded", "true");
    expect(within(sidebar()).getByRole("link", { name: "사용자 관리" })).toBeInTheDocument();
  });

  it("shows every item in the icon rail, folded or not", async () => {
    const user = userEvent.setup();
    localStorage.setItem("hangyul.admin.navgroups.v1", JSON.stringify(["운영"]));
    renderLayout("/users");
    await user.click(toggle());
    expect(within(sidebar()).getByRole("link", { name: "공지" })).toBeInTheDocument();
  });
});

describe("admin brand", () => {
  beforeEach(() => localStorage.clear());

  it("navigates to the dashboard when clicked", async () => {
    const user = userEvent.setup();
    renderLayout();
    expect(screen.getByText("USERS PAGE")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: /한귤 관리자/ }));
    expect(screen.getByText("DASHBOARD PAGE")).toBeInTheDocument();
  });

  it("makes the whole label one target, both lines included", () => {
    renderLayout();
    const link = screen.getByRole("link", { name: /한귤 관리자/ });
    // Korean and English are inside the same anchor, so clicking either — or
    // the padding around them — goes to the dashboard.
    expect(link.textContent).toContain("한귤 관리자");
    expect(link.textContent).toContain("Hangyul Admin");
    expect(link).toHaveAttribute("href", "/");
    // A real anchor, so keyboard focus and Enter work without extra handlers.
    expect(link.tagName).toBe("A");
  });

  it("is reachable by keyboard", async () => {
    const user = userEvent.setup();
    renderLayout();
    const link = screen.getByRole("link", { name: /한귤 관리자/ });
    link.focus();
    expect(link).toHaveFocus();

    await user.keyboard("{Enter}");
    expect(screen.getByText("DASHBOARD PAGE")).toBeInTheDocument();
  });

  it("does not swallow the collapse control", async () => {
    const user = userEvent.setup();
    renderLayout();
    // The control sits beside the link, not inside it — nesting a button in an
    // anchor would be invalid and would make one of them unclickable.
    const link = screen.getByRole("link", { name: /한귤 관리자/ });
    expect(link.querySelector("button")).toBeNull();

    await user.click(toggle());
    expect(sidebar().className).toContain("is-collapsed");
    // Collapsing must not have navigated.
    expect(screen.getByText("USERS PAGE")).toBeInTheDocument();
  });
});

describe("content nav labels", () => {
  it("names the two content types by their learning track", () => {
    renderLayout();
    // The pair has to disambiguate together: a bare "문장" beside "문제(TOPIK)"
    // left the conversation track unnamed, which is what these two labels fix.
    const nav = sidebar();
    expect(within(nav).getByRole("link", { name: "문장(회화)" })).toHaveAttribute(
      "href", "/sentences",
    );
    expect(within(nav).getByRole("link", { name: "문제(TOPIK)" })).toHaveAttribute(
      "href", "/quizzes",
    );
    expect(within(nav).queryByRole("link", { name: "문장" })).toBeNull();
  });

  it("carries the qualified name into the tooltip and the collapsed rail", async () => {
    const user = userEvent.setup();
    renderLayout();
    const link = within(sidebar()).getByRole("link", { name: "문장(회화)" });
    // Collapsed, this is the ONLY description of the item, so the qualifier
    // has to travel with it rather than living in the visible text alone.
    expect(link).toHaveAttribute("title", "문장(회화)");

    await user.click(toggle());
    expect(within(sidebar()).getByRole("link", { name: "문장(회화)" })).toBeInTheDocument();
  });
});

describe("activeNavTarget", () => {
  const TARGETS = ["/", "/users", "/leagues", "/leagues/unassigned"];

  it("prefers the most specific match", () => {
    expect(activeNavTarget("/leagues/unassigned", TARGETS)).toBe("/leagues/unassigned");
  });

  it("falls back to the section for a sub-page with no item of its own", () => {
    expect(activeNavTarget("/leagues/2026-W37/grp_1", TARGETS)).toBe("/leagues");
    expect(activeNavTarget("/users/usr_1", TARGETS)).toBe("/users");
  });

  it("matches the root only exactly", () => {
    expect(activeNavTarget("/", TARGETS)).toBe("/");
    expect(activeNavTarget("/anything", TARGETS)).toBeNull();
  });

  it("does not treat a shared prefix as containment", () => {
    // `/leagues-archive` is not inside `/leagues`, however it sorts.
    expect(activeNavTarget("/leagues-archive", TARGETS)).toBeNull();
  });
});

import { useMemo, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import {
  Bell,
  BookOpen,
  Bot,
  Clapperboard,
  Clock,
  CreditCard,
  HelpCircle,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Megaphone,
  PanelLeftClose,
  PanelLeftOpen,
  MessagesSquare,
  PenLine,
  Receipt,
  Repeat,
  ScrollText,
  ShieldCheck,
  Ticket,
  Trophy,
  UserRound,
  UserRoundX,
  Users as UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { useAdminAuth } from "../auth";
import { loadSidebarCollapsed, saveSidebarCollapsed } from "../lib/storage";
import { Button, ConfirmDialog } from "./kit";

interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
  /** Any of these scopes shows the item. */
  scopes: string[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Which nav item the current URL belongs to: the most specific one that matches.
 *
 * `/leagues` and `/leagues/unassigned` are both menu items, and the second
 * lives under the first. Plain prefix matching — what `NavLink` does without
 * `end` — lit both of them on the unassigned page. `end` everywhere is not the
 * answer either: `/leagues/:seasonId/:groupId` is a league's detail page and
 * *should* keep 진행 중인 리그 selected, as `/users/:id` keeps 사용자 관리.
 *
 * So: collect every item the path matches and take the longest. A section
 * stays lit for its own sub-pages, and loses to a sibling that owns the URL
 * more specifically. Adding a nested item later needs no change here.
 */
function matchesPath(to: string, pathname: string): boolean {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function activeNavTarget(pathname: string, targets: string[]): string | null {
  let best: string | null = null;
  for (const to of targets) {
    if (!matchesPath(to, pathname)) continue;
    if (best === null || to.length > best.length) best = to;
  }
  return best;
}

const NAV: NavGroup[] = [
  {
    label: "개요",
    items: [
      { to: "/", icon: LayoutDashboard, label: "대시보드", scopes: ["users:read"] },
    ],
  },
  {
    label: "사용자",
    items: [
      { to: "/users", icon: UsersIcon, label: "사용자 관리", scopes: ["users:read"] },
      { to: "/leagues", icon: Trophy, label: "진행 중인 리그", scopes: ["users:read"] },
      { to: "/leagues/unassigned", icon: UserRoundX, label: "리그 미배정 회원", scopes: ["users:read"] },
    ],
  },
  {
    label: "콘텐츠",
    items: [
      { to: "/courses", icon: BookOpen, label: "코스", scopes: ["content:read"] },
      { to: "/lectures", icon: Clapperboard, label: "강의·영상", scopes: ["content:read"] },
      { to: "/sentences", icon: PenLine, label: "문장(회화)", scopes: ["content:read"] },
      { to: "/quizzes", icon: HelpCircle, label: "문제(TOPIK)", scopes: ["content:read"] },
      { to: "/ai-content", icon: Bot, label: "AI 생성 검수", scopes: ["content:read"] },
    ],
  },
  {
    label: "결제·구독",
    items: [
      { to: "/plans", icon: CreditCard, label: "요금제", scopes: ["commerce:read"] },
      { to: "/coupons", icon: Ticket, label: "쿠폰", scopes: ["commerce:read"] },
      { to: "/subscriptions", icon: Repeat, label: "구독", scopes: ["commerce:read"] },
      { to: "/payments", icon: Receipt, label: "결제·청구서", scopes: ["commerce:read"] },
    ],
  },
  {
    label: "운영",
    items: [
      { to: "/banners", icon: ImageIcon, label: "배너", scopes: ["ops:read"] },
      { to: "/notices", icon: Megaphone, label: "공지", scopes: ["ops:read"] },
      { to: "/faqs", icon: MessagesSquare, label: "FAQ", scopes: ["ops:read"] },
      { to: "/notifications", icon: Bell, label: "알림 발송", scopes: ["ops:write"] },
      { to: "/notification-settings", icon: Clock, label: "알림 설정", scopes: ["ops:read"] },
    ],
  },
  {
    label: "시스템",
    items: [
      { to: "/audit-logs", icon: ScrollText, label: "관리자 활동 내역", scopes: ["audit:read"] },
      { to: "/admins", icon: ShieldCheck, label: "관리자 계정", scopes: ["admins:manage"] },
    ],
  },
];

const TIER_LABELS: Record<string, string> = {
  super_admin: "최고 관리자",
  operator: "운영자",
  content_manager: "콘텐츠 관리자",
  support_agent: "고객지원",
  viewer: "조회 전용",
};

export function AdminLayout() {
  const { me, can, logout } = useAdminAuth();
  // Lazy initialiser so the stored preference is read once, before first
  // paint — the sidebar never renders wide and then snaps narrow.
  const [collapsed, setCollapsed] = useState(loadSidebarCollapsed);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const { pathname } = useLocation();
  // Resolved once against every target, not per link: "most specific wins"
  // is a decision about the whole menu, and a link cannot make it alone.
  const activeTo = useMemo(
    () => activeNavTarget(pathname, NAV.flatMap((group) => group.items.map((i) => i.to))),
    [pathname],
  );

  return (
    <div className="hgadm-frame">
      <aside className={`hgadm-sidebar ${collapsed ? "is-collapsed" : ""}`}>
        <div className="hgadm-sidebar__brand">
          {/* The whole two-line label is one link to the dashboard, the way a
              product logo usually is. It is the LINK that carries the padding,
              so the clickable area covers the block rather than just the
              glyphs. Hidden when collapsed along with the rest of the sidebar
              text — the nav's own 대시보드 entry remains. */}
          <Link to="/" className="hgadm-sidebar__brand-link" title="대시보드로 이동">
            한귤 관리자
            <span className="hgadm-sidebar__brand-sub">Hangyul Admin</span>
          </Link>
          {/* Sidebar chrome, not a menu item: a 26px icon button that sits in
              the brand row (right of the wordmark when expanded, under the
              mark when collapsed) so it is always visible without competing
              with navigation for space. The row is sticky, so it stays put
              while the nav scrolls. */}
          <button
            type="button"
            className="hgadm-sidebar__collapse"
            onClick={() => {
              const next = !collapsed;
              setCollapsed(next);
              saveSidebarCollapsed(next);
            }}
            aria-expanded={!collapsed}
            aria-controls="hgadm-nav"
            // Named for the action it performs, not the current state, so the
            // tooltip and the screen-reader name agree with what a click does.
            // Icon-only, so this is the ONLY name it has.
            aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
            title={collapsed ? "사이드바 펼치기" : "사이드바 접기"}
          >
            {collapsed ? (
              <PanelLeftOpen size={16} strokeWidth={1.75} aria-hidden />
            ) : (
              <PanelLeftClose size={16} strokeWidth={1.75} aria-hidden />
            )}
          </button>
        </div>
        <nav className="hgadm-nav" id="hgadm-nav" aria-label="관리자 메뉴">
          {NAV.map((group) => {
            const visible = group.items.filter((item) =>
              item.scopes.some((scope) => can(scope)),
            );
            if (visible.length === 0) return null;
            return (
              <div key={group.label}>
                <div className="hgadm-nav__group">{group.label}</div>
                {visible.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.to === activeTo;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`hgadm-nav__link ${isActive ? "active" : ""}`}
                      // Set here rather than left to NavLink, which derives it
                      // from its own prefix match — the same match that lit two
                      // items at once, so the accessibility tree announced two
                      // current pages.
                      aria-current={isActive ? "page" : undefined}
                      // The label is display:none when collapsed, which also
                      // removes it from the accessibility tree — so the link
                      // carries its own name, and `title` gives sighted users
                      // the tooltip. Both are always set: identical to the
                      // visible text when expanded, and the only description
                      // available when not.
                      title={item.label}
                      aria-label={item.label}
                    >
                      <span className="hgadm-nav__icon" aria-hidden>
                        <Icon size={18} strokeWidth={1.75} />
                      </span>
                      <span className="hgadm-nav__label">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="hgadm-main">
        <header className="hgadm-topbar">
          {/* The portal renders and accepts every time on Seoul's clock, no
              matter where the admin is sitting. Saying so once here means no
              screen has to caveat its own timestamps. */}
          <span className="hgadm-muted" style={{ fontSize: 12.5 }}>
            모든 시각은 한국 시간(KST) 기준
          </span>
          <div className="hgadm-topbar__right">
            <div className="hgadm-topbar__user">
              <span className="hgadm-avatar" aria-hidden>
                <UserRound size={17} strokeWidth={2} />
              </span>
              <div className="hgadm-topbar__who">
                <div className="hgadm-topbar__who-name">
                  {me?.nickname || me?.name || me?.email}
                </div>
                <div className="hgadm-topbar__who-role">
                  {TIER_LABELS[me?.admin_role ?? ""] ?? me?.admin_role}
                </div>
              </div>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setConfirmLogout(true)}>
              <LogOut size={15} strokeWidth={2} />
              로그아웃
            </Button>
          </div>
        </header>
        <ConfirmDialog
          open={confirmLogout}
          title="로그아웃"
          message="관리자 계정에서 로그아웃할까요? 다시 사용하려면 다시 로그인해야 합니다."
          confirmLabel="로그아웃"
          icon={<LogOut size={24} strokeWidth={2} />}
          loading={loggingOut}
          onConfirm={() => {
            setLoggingOut(true);
            void logout().finally(() => {
              setLoggingOut(false);
              setConfirmLogout(false);
            });
          }}
          onCancel={() => setConfirmLogout(false)}
        />
        <main className="hgadm-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

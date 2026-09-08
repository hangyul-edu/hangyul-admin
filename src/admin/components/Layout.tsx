import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  Bell,
  BookOpen,
  Bot,
  Citrus,
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
  UserRound,
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
    ],
  },
  {
    label: "콘텐츠",
    items: [
      { to: "/courses", icon: BookOpen, label: "코스", scopes: ["content:read"] },
      { to: "/lectures", icon: Clapperboard, label: "강의·영상", scopes: ["content:read"] },
      { to: "/sentences", icon: PenLine, label: "문장", scopes: ["content:read"] },
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

  return (
    <div className="hgadm-frame">
      <aside className={`hgadm-sidebar ${collapsed ? "is-collapsed" : ""}`}>
        <div className="hgadm-sidebar__brand">
          <span className="hgadm-brand-mark hgadm-sidebar__brand-mark" aria-hidden>
            <Citrus size={19} strokeWidth={2} />
          </span>
          <span>
            한귤 관리자
            <span className="hgadm-sidebar__brand-sub">Hangyul Admin</span>
          </span>
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
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === "/"}
                      className={({ isActive }) =>
                        `hgadm-nav__link ${isActive ? "active" : ""}`
                      }
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
                    </NavLink>
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
          message="관리자 세션에서 로그아웃할까요? 다시 사용하려면 재로그인이 필요합니다."
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

import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Bell,
  BookOpen,
  Bot,
  Clapperboard,
  CreditCard,
  HelpCircle,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MessagesSquare,
  PenLine,
  Receipt,
  Repeat,
  ScrollText,
  ShieldCheck,
  Ticket,
  Users as UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { useAdminAuth } from "../auth";
import { Button } from "./kit";

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
    label: "커머스",
    items: [
      { to: "/plans", icon: CreditCard, label: "요금제", scopes: ["commerce:read"] },
      { to: "/coupons", icon: Ticket, label: "쿠폰", scopes: ["commerce:read"] },
      { to: "/subscriptions", icon: Repeat, label: "구독", scopes: ["commerce:read"] },
      { to: "/payments", icon: Receipt, label: "결제·인보이스", scopes: ["commerce:read"] },
    ],
  },
  {
    label: "운영",
    items: [
      { to: "/banners", icon: ImageIcon, label: "배너", scopes: ["ops:read"] },
      { to: "/notices", icon: Megaphone, label: "공지", scopes: ["ops:read"] },
      { to: "/faqs", icon: MessagesSquare, label: "FAQ", scopes: ["ops:read"] },
      { to: "/notifications", icon: Bell, label: "알림 발송", scopes: ["ops:write"] },
    ],
  },
  {
    label: "시스템",
    items: [
      { to: "/audit-logs", icon: ScrollText, label: "감사 로그", scopes: ["audit:read"] },
      { to: "/admins", icon: ShieldCheck, label: "관리자 계정", scopes: ["admins:manage"] },
    ],
  },
];

const TIER_LABELS: Record<string, string> = {
  super_admin: "최고 관리자",
  operator: "운영자",
  content_manager: "콘텐츠 관리자",
  support_agent: "고객지원",
  viewer: "뷰어",
};

const TITLES: [string, string][] = [
  ["/users", "사용자 관리"],
  ["/courses", "코스 관리"],
  ["/lectures", "강의·영상 관리"],
  ["/sentences", "문장 관리"],
  ["/quizzes", "문제 관리"],
  ["/ai-content", "AI 생성 콘텐츠 검수"],
  ["/plans", "요금제 관리"],
  ["/coupons", "쿠폰 관리"],
  ["/subscriptions", "구독 현황"],
  ["/payments", "결제·인보이스"],
  ["/banners", "배너 관리"],
  ["/notices", "공지 관리"],
  ["/faqs", "FAQ 관리"],
  ["/notifications", "알림 발송"],
  ["/audit-logs", "감사 로그"],
  ["/admins", "관리자 계정"],
];

export function AdminLayout() {
  const { me, can, logout } = useAdminAuth();
  const location = useLocation();
  const title =
    TITLES.find(([prefix]) => location.pathname.startsWith(prefix))?.[1] ??
    "대시보드";

  return (
    <div className="hgadm-frame">
      <aside className="hgadm-sidebar">
        <div className="hgadm-sidebar__brand">
          <span className="hgadm-sidebar__brand-mark" aria-hidden>
            한
          </span>
          <span>
            한귤 관리자
            <span className="hgadm-sidebar__brand-sub">Hangyul Admin</span>
          </span>
        </div>
        <nav className="hgadm-nav" aria-label="관리자 메뉴">
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
          <div className="hgadm-topbar__title">{title}</div>
          <div className="hgadm-topbar__right">
            <div className="hgadm-topbar__user">
              <span className="hgadm-avatar" aria-hidden>
                {(me?.nickname || me?.name || me?.email || "?").trim().charAt(0).toUpperCase()}
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
            <Button size="sm" variant="ghost" onClick={() => void logout()}>
              <LogOut size={15} strokeWidth={2} />
              로그아웃
            </Button>
          </div>
        </header>
        <main className="hgadm-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

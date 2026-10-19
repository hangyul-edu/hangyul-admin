// Shared layout pieces for the 학습 인사이트 pages (and 콘텐츠 업데이트):
// a page header that says in one sentence what the page is for, tabs that join
// related pages, KPI cards that say whether a change is good or bad, a period
// picker with presets, and friendly empty/notice blocks.
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, CalendarDays, CircleHelp, Clock3, Inbox, Minus } from "lucide-react";
import { useAdminAuth } from "../auth";
import { useUrlFilters } from "../lib/urlFilters";
import type { GoodDirection } from "../lib/metricGuide";
import { Input } from "./kit";

// ---- Page header -----------------------------------------------------------

export function PageHero({
  icon: Icon,
  eyebrow,
  title,
  description,
  actions,
}: {
  icon: LucideIcon;
  eyebrow?: string;
  title: string;
  description: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="hgins-hero">
      <span className="hgins-hero__icon" aria-hidden>
        <Icon size={22} strokeWidth={2} />
      </span>
      <div className="hgins-hero__text">
        {eyebrow && <div className="hgins-hero__eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p className="hgins-hero__desc">{description}</p>
      </div>
      {actions && <div className="hgins-hero__actions">{actions}</div>}
    </header>
  );
}

// ---- Section tabs: related pages behind one menu item ----------------------

interface InsightTab {
  to: string;
  label: string;
  scope: string;
}

/** Pages that share one sidebar entry, shown as tabs on each of them. */
const INSIGHT_SECTIONS:InsightTab[][] = [
  [
    { to: "/learning/learners", label: "학습 현황", scope: "learners:read" },
    { to: "/learning/proficiency", label: "레벨 판정", scope: "learners:read" },
  ],
  [
    { to: "/learning/recommendations", label: "맞춤 학습", scope: "analytics:read" },
    { to: "/learning/ai", label: "AI 기능·비용", scope: "ai:read" },
  ],
  [
    { to: "/learning/proficiency-policy", label: "레벨 판정 기준", scope: "analytics:read" },
    { to: "/learning/data-health", label: "데이터 집계 상태", scope: "ops:read" },
  ],
];

function SectionTabs({ pathname }: { pathname: string }) {
  const { can } = useAdminAuth();
  // Only on a section's own pages — a learner's detail page has a back link
  // instead, and tabs there would read as tabs of that learner.
  const section = INSIGHT_SECTIONS.find((tabs) => tabs.some((t) => t.to === pathname));
  const visible = section?.filter((t) => can(t.scope)) ?? [];
  if (visible.length < 2) return null;
  return (
    <nav className="hgins-tabs" aria-label="관련 화면">
      {visible.map((t) => (
        <NavLink key={t.to} to={t.to} end className={({ isActive }) => `hgins-tab${isActive ? " is-active" : ""}`}>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

/** Route wrapper for every 학습 인사이트 page. */
export function InsightsShell() {
  const { pathname } = useLocation();
  return (
    <div className="hgadm-la hgins">
      <SectionTabs pathname={pathname} />
      <Outlet />
    </div>
  );
}

// ---- Panels ---------------------------------------------------------------

export function Panel({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`hgadm-card hgins-panel ${className}`}>
      {(title || actions) && (
        <div className="hgins-panel__head">
          <div>
            {title && <h2 className="hgins-panel__title">{title}</h2>}
            {description && <p className="hgins-panel__desc">{description}</p>}
          </div>
          {actions && <div className="hgins-panel__actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

// ---- KPI cards and trends ---------------------------------------------------

type TrendTone ="good" | "bad" | "flat";

interface Trend {
  text: string;
  tone: TrendTone;
  direction: "up" | "down" | "flat";
}

/** A change, judged by which direction is good for this metric. */
export function trendOf(delta: number | null | undefined, good: GoodDirection, text: string): Trend | null {
  if (delta === null || delta === undefined) return null;
  if (delta === 0) return { text: "변화 없음", tone: "flat", direction: "flat" };
  const direction = delta > 0 ? "up" : "down";
  const tone: TrendTone = good === "neutral" ? "flat" : (direction === "up") === (good === "up") ? "good" : "bad";
  return { text, tone, direction };
}

export function TrendChip({ trend, label }: { trend: Trend; label?: string }) {
  const Icon = trend.direction === "up" ? ArrowUpRight : trend.direction === "down" ? ArrowDownRight : Minus;
  const verdict = trend.tone === "good" ? "좋아짐" : trend.tone === "bad" ? "나빠짐" : "변화 없음";
  return (
    <span className={`hgins-trend hgins-trend--${trend.tone}`} title={label ? `${label} · ${verdict}` : verdict}>
      <Icon size={13} strokeWidth={2.4} aria-hidden />
      {trend.text}
      <span className="hgins-sr">({verdict})</span>
    </span>
  );
}

export function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  trend,
  help,
}: {
  icon?: LucideIcon;
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  trend?: Trend | null;
  help?: ReactNode;
}) {
  return (
    <div className="hgins-kpi">
      <div className="hgins-kpi__top">
        {Icon && (
          <span className="hgins-kpi__icon" aria-hidden>
            <Icon size={16} strokeWidth={2.2} />
          </span>
        )}
        <span className="hgins-kpi__label">{label}</span>
        {help}
      </div>
      <div className="hgins-kpi__value">{value}</div>
      <div className="hgins-kpi__foot">
        {trend && <TrendChip trend={trend} />}
        {sub && <span className="hgins-kpi__sub">{sub}</span>}
      </div>
    </div>
  );
}

export function KpiRow({ children }: { children: ReactNode }) {
  return <div className="hgins-kpis">{children}</div>;
}

// ---- Help popover -----------------------------------------------------------

/** A "?" that opens a small explanation; closes on Escape or outside click. */
export function HelpTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <span className="hgins-help" ref={ref}>
      <button
        type="button"
        className="hgins-help__btn"
        aria-label={`${label} 설명 보기`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <CircleHelp size={14} strokeWidth={2} />
      </button>
      {open && (
        <span className="hgins-help__pop" id={id} role="dialog" aria-label={`${label} 설명`}>
          {children}
        </span>
      )}
    </span>
  );
}

// ---- Period picker ------------------------------------------------------------

const PRESETS = [7, 28, 90] as const;
const DEFAULT_DAYS = 28;

function seoulToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

function shiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function spanDays(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}

function dotted(iso: string): string {
  return iso.replaceAll("-", ".");
}

/** The window ending today with `days` days, and the same length just before it. */
function presetWindow(days: number, today = seoulToday()) {
  const current_end = today;
  const current_start = shiftDays(today, -(days - 1));
  return {
    current_start,
    current_end,
    comparison_end: shiftDays(current_start, -1),
    comparison_start: shiftDays(current_start, -days),
  };
}

/**
 * Period selection kept in the URL (Asia/Seoul calendar days). Presets cover
 * what operators ask most; 직접 선택 opens a start/end pair, and the comparison
 * period is always the same number of days just before it. No parameters at
 * all is the server's default — the last 28 days against the 28 before.
 */
export function PeriodPicker({ withComparison = true }: { withComparison?: boolean }) {
  const f = useUrlFilters();
  const start = f.value("current_start");
  const end = f.value("current_end");
  const today = seoulToday();
  const active: number | "custom" = !start && !end ? DEFAULT_DAYS : (() => {
    const match = PRESETS.find((n) => {
      const w = presetWindow(n, today);
      return w.current_start === start && w.current_end === end;
    });
    return match ?? "custom";
  })();
  const [custom, setCustom] = useState(active === "custom");

  const choose = (days: number) => {
    setCustom(false);
    if (days === DEFAULT_DAYS) {
      f.patch({ current_start: null, current_end: null, comparison_start: null, comparison_end: null });
      return;
    }
    const w = presetWindow(days, today);
    f.patch(withComparison ? w : { current_start: w.current_start, current_end: w.current_end });
  };

  const setCustomRange = (nextStart: string, nextEnd: string) => {
    if (!nextStart || !nextEnd || nextStart > nextEnd) {
      f.patch({ current_start: nextStart || null, current_end: nextEnd || null });
      return;
    }
    const days = spanDays(nextStart, nextEnd);
    f.patch({
      current_start: nextStart,
      current_end: nextEnd,
      ...(withComparison
        ? { comparison_end: shiftDays(nextStart, -1), comparison_start: shiftDays(nextStart, -days) }
        : {}),
    });
  };

  const shown = !start && !end ? presetWindow(DEFAULT_DAYS, today) : { current_start: start, current_end: end };
  const days = shown.current_start && shown.current_end ? spanDays(shown.current_start, shown.current_end) : null;

  return (
    <div className="hgins-period" role="group" aria-label="조회 기간">
      <div className="hgins-seg" role="radiogroup" aria-label="기간 빠른 선택">
        {PRESETS.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={!custom && active === n}
            className={`hgins-seg__btn${!custom && active === n ? " is-on" : ""}`}
            onClick={() => choose(n)}
          >
            최근 {n}일
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={custom || active === "custom"}
          className={`hgins-seg__btn${custom || active === "custom" ? " is-on" : ""}`}
          onClick={() => setCustom(true)}
        >
          직접 선택
        </button>
      </div>
      {(custom || active === "custom") && (
        <div className="hgins-period__custom">
          <Input
            type="date"
            aria-label="시작일"
            value={start}
            max={end || today}
            onChange={(e) => setCustomRange(e.target.value, end)}
          />
          <span aria-hidden>–</span>
          <Input
            type="date"
            aria-label="종료일"
            value={end}
            min={start || undefined}
            max={today}
            onChange={(e) => setCustomRange(start, e.target.value)}
          />
        </div>
      )}
      <span className="hgins-period__caption">
        <CalendarDays size={14} strokeWidth={2} aria-hidden />
        {shown.current_start && shown.current_end
          ? `${dotted(shown.current_start)} – ${dotted(shown.current_end)}`
          : "기간을 선택하세요"}
        {withComparison && days ? ` · 직전 ${days}일과 비교` : ""}
      </span>
    </div>
  );
}

// ---- Notices and empty states ----------------------------------------------------

export function Notice({
  tone = "info",
  icon: Icon = Clock3,
  title,
  children,
}: {
  tone?: "info" | "warn" | "danger" | "success";
  icon?: LucideIcon;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`hgins-notice hgins-notice--${tone}`} role="status">
      <Icon size={18} strokeWidth={2} aria-hidden />
      <div>
        <div className="hgins-notice__title">{title}</div>
        {children && <div className="hgins-notice__body">{children}</div>}
      </div>
    </div>
  );
}

export function EmptyHint({ title = "아직 데이터가 없어요", children }: { title?: string; children?: ReactNode }) {
  return (
    <div className="hgins-empty">
      <span className="hgins-empty__icon" aria-hidden>
        <Inbox size={20} strokeWidth={2} />
      </span>
      <div className="hgins-empty__title">{title}</div>
      {children && <div className="hgins-empty__body">{children}</div>}
    </div>
  );
}

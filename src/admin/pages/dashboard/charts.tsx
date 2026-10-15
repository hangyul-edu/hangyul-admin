import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import type { MonthlyRevenueResponse } from "../../api";
import { chartDayLabel, currencySymbol, formatMoney, isZeroDecimal, toMajorUnits, weekdayShort } from "../../lib/format";
import { formatTick, niceScale } from "../../lib/chartScale";
import { placeTooltip } from "../../lib/tooltipPlacement";
import type { Rect } from "../../lib/tooltipPlacement";

/** Daily 30-day chart: labels every 7th day so the axis stays readable. */
export function TimeseriesChart({
  points,
  money,
}: {
  points: { date: string; value: number }[];
  money: string | null;
}) {
  const bars: Bar[] = points.map((p) => {
    const weekday = weekdayShort(p.date);
    return {
      key: p.date,
      label: chartDayLabel(p.date),
      // The axis drops the year for width; the tooltip has room to keep it.
      caption: weekday ? `${p.date} (${weekday})` : p.date,
      value: p.value,
    };
  });
  return (
    <BarChart
      bars={bars}
      money={money}
      ariaLabel="최근 30일 일별 현황 막대 차트"
      // The weekday makes each label wider, so one fewer fits: every 7th day
      // still lands on the same weekday, which is the point of showing it.
      showLabel={(i, n) => i === 0 || i === n - 1 || (i % 7 === 0 && n - 1 - i >= 3)}
    />
  );
}

/**
 * Revenue by calendar month. Every month is labelled — the trend is the point
 * of the chart — and the year is shown whenever it changes so a window
 * spanning New Year reads correctly.
 *
 * The month in progress is drawn hatched rather than solid: it holds the 1st
 * to today only, so showing it as a flat bar next to completed months would
 * read as a collapse in revenue every single month.
 */
export function MonthlyRevenueChart({ data }: { data: MonthlyRevenueResponse }) {
  const bars: Bar[] = data.points.map((p, i) => {
    const [year, month] = p.month.split("-");
    const yearChanged = i === 0 || p.month.slice(0, 4) !== data.points[i - 1].month.slice(0, 4);
    return {
      key: p.month,
      label: yearChanged ? `${year.slice(2)}'${Number(month)}월` : `${Number(month)}월`,
      caption: `${year}년 ${Number(month)}월`,
      value: p.value_cents,
      partial: p.month === data.current_month,
    };
  });

  return (
    <>
      <BarChart
        bars={bars}
        money={data.currency}
        ariaLabel={`최근 ${data.months}개월 월별 매출 막대 차트`}
        showLabel={() => true}
      />
      <div className="hgadm-row hgadm-chart-legend">
        <span className="hgadm-row hgadm-row--tight">
          <span aria-hidden className="hgadm-chart-legend__swatch" />
          완료된 달
        </span>
        <span className="hgadm-row hgadm-row--tight">
          <span aria-hidden className="hgadm-chart-legend__swatch hgadm-chart-legend__swatch--current" />
          이번 달 (진행 중 · 1일~오늘)
        </span>
      </div>
    </>
  );
}

/** Widest a single bar is drawn, so a sparse chart is not one solid block. */
const MAX_BAR_WIDTH = 72;

interface Bar {
  key: string;
  /** Axis label. */
  label: string;
  /** Tooltip title. */
  caption: string;
  value: number;
  /** Incomplete period — drawn hatched so it is not read as a real drop. */
  partial?: boolean;
}

/**
 * Single-series bar chart (inline SVG), shared by both dashboard charts so the
 * two cannot drift apart visually.
 * Mark spec: thin bars, 4px rounded data-end anchored to the baseline via a
 * squared-off bottom, 2px gaps, recessive grid, ink-token text, per-bar hover
 * tooltip. Bar color #2563eb (brand blue) validated ≥3:1 against the white
 * surface (~5.2:1).
 */
function BarChart({
  bars: points,
  money,
  ariaLabel,
  showLabel,
}: {
  bars: Bar[];
  money: string | null;
  ariaLabel: string;
  showLabel: (index: number, total: number) => boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  // Where the hovered bar sits on screen, captured on enter. The tooltip is
  // placed against the viewport rather than against the chart, so it needs the
  // bar in viewport coordinates.
  const anchorRef = useRef<Rect | null>(null);
  const width = 920;
  const height = 220;

  /*
   * The axis is computed in the unit it is labelled in, which for money means
   * dollars rather than cents: ticks land on $5 / $12.50, not on 500¢ rounded
   * into two identical `$5`s. Counts are integers all the way down, so their
   * axis is told never to offer a fractional signup.
   */
  const plot = useMemo(
    () => (money ? (v: number) => toMajorUnits(v, money) : (v: number) => v),
    [money],
  );
  const scale = useMemo(
    () =>
      niceScale(Math.max(0, ...points.map((p) => plot(p.value))), {
        integer: !money || isZeroDecimal(money),
      }),
    [points, plot, money],
  );
  const symbol = money ? currencySymbol(money) : "";
  const tickLabels = scale.ticks.map((t) =>
    formatTick(t, { decimals: scale.decimals, symbol }),
  );

  // The gutter follows the widest label rather than a fixed 46px, so `$50,000`
  // has somewhere to go instead of being clipped by the plot area.
  const gutter = Math.max(...tickLabels.map((l) => l.length)) * 6.2 + 12;
  const pad = { top: 16, right: 8, bottom: 26, left: Math.max(28, Math.min(96, gutter)) };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  /*
   * Each period owns an equal slot and its bar is centred in it. The bar is
   * capped rather than filling its slot: a chart with one point would otherwise
   * draw a single mark the full width of the plot, which reads as a filled area
   * rather than as one value. The cap is above the width of a 12-bar chart, so
   * only sparse charts are affected.
   */
  const barGap = 2;
  const slot = innerW / points.length;
  const barW = Math.max(2, Math.min(MAX_BAR_WIDTH, slot - barGap));
  const barX = (i: number) => pad.left + i * slot + (slot - barW) / 2;
  const fmt = (v: number) => (money ? formatMoney(v, money) : v.toLocaleString());

  const hovered = hover !== null ? points[hover] : null;

  return (
    <div className="hgadm-chart-scroll">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="hgadm-chart-svg"
        role="img"
        aria-label={ariaLabel}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          {/* Diagonal hatch for a period that is not over yet. Reads as
              "incomplete" rather than "lower" at a glance, and survives being
              printed or viewed without color. */}
          <pattern
            id="hgadm-bar-partial"
            width={6}
            height={6}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width={6} height={6} fill="#2563eb" opacity={0.18} />
            <line x1={0} y1={0} x2={0} y2={6} stroke="#2563eb" strokeWidth={2.5} />
          </pattern>
        </defs>
        {scale.ticks.map((tick, i) => {
          const y = pad.top + innerH * (1 - tick / scale.max);
          return (
            <g key={tick}>
              {/* Zero already has the axis line; a grid line there would double it. */}
              {tick > 0 && (
                <line
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={y}
                  y2={y}
                  stroke="var(--border)"
                  strokeWidth={1}
                />
              )}
              <text
                x={pad.left - 8}
                y={y + 4}
                textAnchor="end"
                fontSize={10.5}
                fill="var(--ink-3)"
              >
                {tickLabels[i]}
              </text>
            </g>
          );
        })}
        <line
          x1={pad.left}
          x2={width - pad.right}
          y1={pad.top + innerH}
          y2={pad.top + innerH}
          stroke="var(--border-strong)"
          strokeWidth={1}
        />
        {points.map((p, i) => {
          const h = Math.round((plot(p.value) / scale.max) * innerH);
          const x = barX(i);
          const y = pad.top + innerH - h;
          const isHover = hover === i;
          return (
            <g key={p.key}>
              {/* Full-height hit target, larger than the mark itself. */}
              <rect
                x={pad.left + i * slot}
                y={pad.top}
                width={slot}
                height={innerH}
                fill="transparent"
                onMouseEnter={(e) => {
                  anchorRef.current = e.currentTarget.getBoundingClientRect();
                  setHover(i);
                }}
              />
              {p.value > 0 && (
                <path
                  d={roundedTopBar(x, y, barW, h, Math.min(4, barW / 2, h))}
                  fill={p.partial ? "url(#hgadm-bar-partial)" : "#2563eb"}
                  stroke={p.partial ? "#2563eb" : undefined}
                  strokeWidth={p.partial ? 1 : undefined}
                  strokeDasharray={p.partial ? "3 2" : undefined}
                  opacity={hover === null || isHover ? 1 : 0.45}
                  pointerEvents="none"
                />
              )}
              {showLabel(i, points.length) && (
                <text
                  x={x + barW / 2}
                  y={height - 8}
                  textAnchor="middle"
                  fontSize={10.5}
                  fill="var(--ink-3)"
                >
                  {p.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hovered && (
        <ChartTooltip anchor={anchorRef.current}>
          <strong>{hovered.caption}</strong> · {fmt(hovered.value)}
          {hovered.partial && " (진행 중)"}
        </ChartTooltip>
      )}
    </div>
  );
}

/**
 * The hover readout for a chart bar.
 *
 * It renders into `document.body` rather than into the chart. The chart's
 * scroll container is a clipping context — `overflow-x: auto` makes it one —
 * so a tooltip parented there is cut off at the card's edge no matter how it is
 * positioned. A portal escapes every ancestor's overflow, and `position: fixed`
 * then puts it in the same coordinate space the viewport bounds are measured
 * in, which is what lets `placeTooltip` guarantee the whole of it is on screen.
 *
 * Placement runs in a layout effect, after the browser has sized the box but
 * before it paints, so the tooltip is never seen in the wrong place. Until the
 * first measurement it is rendered hidden rather than not at all — it has to be
 * in the DOM to have a size.
 */
function ChartTooltip({ anchor, children }: { anchor: Rect | null; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || !anchor) return setPlaced(null);
    const box = node.getBoundingClientRect();
    setPlaced(
      placeTooltip(anchor, box, {
        // clientWidth, not innerWidth: the scrollbar is not usable space.
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      }),
    );
  }, [anchor, children]);

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      className="hgadm-chart-tip"
      style={{
        left: placed?.left ?? 0,
        top: placed?.top ?? 0,
        visibility: placed ? "visible" : "hidden",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Bar path with rounded top corners and a square base on the baseline. */
function roundedTopBar(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, r);
  return [
    `M ${x} ${y + h}`,
    `L ${x} ${y + rr}`,
    `Q ${x} ${y} ${x + rr} ${y}`,
    `L ${x + w - rr} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + rr}`,
    `L ${x + w} ${y + h}`,
    "Z",
  ].join(" ");
}

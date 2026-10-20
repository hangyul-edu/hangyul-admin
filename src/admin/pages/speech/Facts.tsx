// A row of short label–value pairs that wraps, for the facts that belong
// together on the 음성 인식 테스트 page (a recogniser and its model, a latency
// and a confidence). One line where a description list would be eight.
import type { ReactNode } from "react";

/** A `false`/`null` entry is skipped, so callers can write `cond && [label, value]`. */
export type Fact = [label: ReactNode, value: ReactNode] | false | null | undefined;

export function Facts({ items, label, className = "" }: { items: Fact[]; label?: string; className?: string }) {
  const shown = items.filter((f): f is [ReactNode, ReactNode] => Array.isArray(f));
  if (shown.length === 0) return null;
  return (
    <dl className={`hgadm-speech__facts ${className}`.trim()} role={label ? "group" : undefined} aria-label={label}>
      {shown.map(([name, value], i) => (
        <div key={i} className="hgadm-speech__fact">
          <dt>{name}</dt>
          <dd>{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

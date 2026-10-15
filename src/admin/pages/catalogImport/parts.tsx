import type { ReactNode } from "react";
import { Check } from "lucide-react";
import type { CatalogJob } from "../../catalogImportApi";
import { Badge } from "../../components/kit";
import { IMPORT_STEPS, PLAN_STEPS, PROGRESS_LABEL } from "./model";

export function JobBadge({ job }: { job: CatalogJob }) {
  if (job.status === "succeeded") return <Badge tone="success">완료</Badge>;
  if (job.status === "failed") return <Badge tone="danger">실패</Badge>;
  return <Badge tone="info">{job.status === "queued" ? "대기 중" : "진행 중"}</Badge>;
}

/** A running job's steps: done, current, still to come. */
export function Progress({ job }: { job: CatalogJob }) {
  const steps = job.kind === "plan" ? PLAN_STEPS : IMPORT_STEPS;
  const at = job.status === "queued" ? -1 : steps.indexOf(job.step ?? "");
  return (
    <ol className="hgins-progress" aria-label="진행 상황">
      {steps.map((s, i) => {
        const state = i < at ? "is-done" : i === at ? "is-now" : "";
        return (
          <li key={s} className={state}>
            <span className="hgins-progress__dot" aria-hidden>
              {i < at && <Check size={11} strokeWidth={3} />}
            </span>
            {PROGRESS_LABEL[s]}
            {i === at && <span className="hgins-sr"> (진행 중)</span>}
          </li>
        );
      })}
    </ol>
  );
}

export function Fact({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "good" | "bad" | "brand" }) {
  return (
    <div className={`hgins-fact${tone ? ` hgins-fact--${tone}` : ""}`}>
      <div className="hgins-fact__label">{label}</div>
      <div className="hgins-fact__value">{value}</div>
      {hint && <div className="hgins-fact__hint">{hint}</div>}
    </div>
  );
}

const STEPS: [string, string][] = [
  ["미리보기", "바뀌는 내용 확인"],
  ["앱에 반영", "확인 후 한 번에 적용"],
  ["완료", "회원에게 공개된 내용"],
];

/** The three-step flow, with the current step marked. */
export function Stepper({ current, done }: { current: 1 | 2 | 3; done: number[] }) {
  return (
    <ol className="hgins-steps" aria-label="업데이트 단계">
      {STEPS.map(([title, sub], i) => {
        const num = i + 1;
        const isDone = done.includes(num);
        const isCurrent = num === current && !isDone;
        return (
          <li
            key={title}
            className={`hgins-step${isDone ? " is-done" : ""}${isCurrent ? " is-current" : ""}`}
            aria-current={isCurrent ? "step" : undefined}
          >
            <span className="hgins-step__num">{isDone ? <Check size={14} strokeWidth={3} /> : num}</span>
            <span>
              {title}
              <span className="hgins-step__sub">{sub}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

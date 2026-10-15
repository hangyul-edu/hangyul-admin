import type { ReactNode } from "react";
import { ArrowRight, CheckCircle2, Eye, ShieldAlert, Upload } from "lucide-react";
import type { CatalogImportOverview, CatalogJob, PlanSummary } from "../../catalogImportApi";
import { Badge, Button, DataTable, Dl, Timestamp } from "../../components/kit";
import type { Column } from "../../components/kit";
import { Notice, Panel } from "../../components/insights";
import { formatDateTime } from "../../lib/format";
import { HELD_LABEL, READINESS_LABEL, changesIn, n, problemsIn, type updateState } from "./model";
import { Fact, JobBadge, Progress } from "./parts";

type State = ReturnType<typeof updateState>;

/** Where things stand, before anything else: what the app has, what is ready. */
export function StatusBar({ d, state }: { d: CatalogImportOverview; state: State }) {
  const { applied, active, revisionOk, upToDate } = state;
  const verdict = d.package_error ? (
    <span className="hgins-pill hgins-pill--bad">패키지 확인 필요</span>
  ) : active ? (
    <span className="hgins-pill hgins-pill--busy">{active.kind === "plan" ? "미리보기 중" : "반영 중"}</span>
  ) : !revisionOk ? (
    <span className="hgins-pill hgins-pill--bad">서버 업데이트 필요</span>
  ) : upToDate ? (
    <span className="hgins-pill hgins-pill--ok">
      <CheckCircle2 size={15} strokeWidth={2.2} aria-hidden /> 최신 상태
    </span>
  ) : (
    <span className="hgins-pill hgins-pill--new">업데이트 가능</span>
  );
  return (
    <section className="hgins-status" aria-label="현재 상태">
      <div className="hgins-status__side">
        <div className="hgins-status__label">지금 앱에 들어 있는 콘텐츠</div>
        <div className="hgins-status__value">{applied ? `v${applied.package_version}` : "아직 반영한 적 없음"}</div>
        {applied?.finished_at && <div className="hgins-status__hint">{formatDateTime(applied.finished_at)} 반영</div>}
      </div>
      <ArrowRight className="hgins-status__arrow" size={20} aria-hidden />
      <div className="hgins-status__side">
        <div className="hgins-status__label">준비된 패키지</div>
        {d.package_error ? (
          <div className="hgins-status__value">읽을 수 없음</div>
        ) : (
          <>
            <div className="hgins-status__value">v{d.package.version}</div>
            <div className="hgins-status__hint">
              {d.package.package_id} · 파일 {n(d.package.files)}개
              {d.package.readiness ? ` · ${READINESS_LABEL[d.package.readiness] ?? d.package.readiness}` : ""}
            </div>
          </>
        )}
      </div>
      <div className="hgins-status__verdict">{verdict}</div>
    </section>
  );
}

/** Step 1 — the dry run and what it found. */
export function PreviewPanel({
  state,
  disabled,
  starting,
  onStart,
}: {
  state: State;
  disabled: boolean;
  starting: boolean;
  onStart: () => void;
}) {
  const { active, latestPlan, plan } = state;
  return (
    <Panel
      title="1. 미리보기"
      description="패키지를 검사하고 지금 앱 데이터와 비교해, 반영하면 무엇이 추가·변경되는지 계산해요. 이 단계에서는 아무것도 바뀌지 않아요. 1~2분 걸릴 수 있어요."
      actions={
        <Button variant={latestPlan ? "secondary" : "primary"} onClick={onStart} loading={starting} disabled={disabled}>
          <Eye size={15} strokeWidth={2} aria-hidden />
          {latestPlan ? "다시 미리보기" : "미리보기 시작"}
        </Button>
      }
    >
      {active?.kind === "plan" ? (
        <Progress job={active} />
      ) : latestPlan ? (
        <div data-testid="catalog-plan">
          {latestPlan.status === "failed" ? (
            <Notice tone="danger" icon={ShieldAlert} title="미리보기가 실패했어요">
              {latestPlan.error}
            </Notice>
          ) : (
            <>
              <PlanFacts plan={plan} />
              {plan && <PlanProblems plan={plan} />}
              <p className="hgins-cta__hint hgadm-mt-12">
                {formatDateTime(latestPlan.created_at)} 미리보기 · {latestPlan.requested_by_email ?? "알 수 없음"}
              </p>
            </>
          )}
        </div>
      ) : (
        <p className="hgins-cta__hint">아직 미리보기를 하지 않았어요.</p>
      )}
    </Panel>
  );
}

function PlanFacts({ plan }: { plan: PlanSummary | undefined }) {
  const problems = problemsIn(plan?.counts);
  return (
    <div className="hgins-facts">
      <Fact label="새로 추가" value={n(plan?.counts.create)} tone={plan?.counts.create ? "brand" : undefined} />
      <Fact label="내용 변경" value={n(plan?.counts.update)} tone={plan?.counts.update ? "brand" : undefined} />
      <Fact label="변경 없음" value={n(plan?.counts.skip)} />
      <Fact label="확인 필요" value={n(problems)} tone={problems ? "bad" : "good"} hint={problems ? "충돌·빠진 연결" : "문제 없음"} />
    </div>
  );
}

function PlanProblems({ plan }: { plan: PlanSummary }) {
  if (plan.conflicts.length === 0 && plan.dependency_failures.length === 0) return null;
  const group = (title: string, items: string[]) =>
    items.length > 0 && (
      <>
        <strong>{title}</strong>
        <ul className="hgins-list">
          {items.slice(0, 10).map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </>
    );
  return (
    <details className="hgins-more">
      <summary>확인이 필요한 항목 보기</summary>
      <div className="hgins-more__body">
        {group("충돌 (이미 다른 내용으로 들어가 있음)", plan.conflicts)}
        {group("빠진 연결 (참조하는 항목이 없음)", plan.dependency_failures)}
      </div>
    </details>
  );
}

/** Step 2 — applying the preview, or why it cannot be applied yet. */
export function ApplyPanel({ state, onApply }: { state: State; onApply: () => void }) {
  const { active, blocker, plan } = state;
  return (
    <Panel
      title="2. 앱에 반영"
      description="미리보기 내용을 그대로 적용해요. 한 번에 처리되므로 도중에 실패하면 아무것도 바뀌지 않고, 미리보기 뒤에 데이터가 달라졌다면 반영을 멈춰요."
    >
      {active?.kind === "import" ? (
        <Progress job={active} />
      ) : (
        <div className="hgins-cta">
          <Button variant="primary" onClick={onApply} disabled={Boolean(active) || blocker !== null}>
            <Upload size={15} strokeWidth={2} aria-hidden />
            앱에 반영하기…
          </Button>
          {blocker && !active && <span className="hgins-cta__hint">{blocker}</span>}
          {!blocker && plan && (
            <span className="hgins-cta__hint">
              추가 {n(plan.counts.create)} · 변경 {n(plan.counts.update)}건이 반영됩니다.
            </span>
          )}
        </div>
      )}
    </Panel>
  );
}

/** Step 3 — what the last import published and held back. */
export function ResultPanel({ job, autoPublish }: { job: CatalogJob; autoPublish: boolean }) {
  const remaining = changesIn(job.result.verification);
  return (
    <Panel title="3. 반영 결과" description="마지막 반영에서 회원에게 공개된 콘텐츠와, 아직 공개되지 않고 보류된 콘텐츠예요.">
      <div data-testid="catalog-import">
        {job.status === "failed" ? (
          <Notice tone="danger" icon={ShieldAlert} title="반영이 실패했어요 — 아무것도 바뀌지 않았어요">
            {job.error}
          </Notice>
        ) : job.status === "succeeded" ? (
          <>
            <div className="hgins-facts">
              <Fact label="회원에게 공개" value={n(job.result.published)} tone="good" />
              {Object.entries(job.result.held ?? {}).map(([k, v]) => (
                <Fact key={k} label={HELD_LABEL[k] ?? k} value={n(v)} hint="공개 보류" />
              ))}
              <Fact
                label="반영 후 검증"
                value={remaining === 0 ? "통과" : "다시 확인"}
                tone={remaining === 0 ? "good" : "bad"}
                hint={remaining === 0 ? "남은 변경 없음" : `남은 변경 ${n(remaining)}건`}
              />
            </div>
            <p className="hgins-cta__hint hgadm-mt-12">
              {formatDateTime(job.created_at)} 반영 · {job.requested_by_email ?? "알 수 없음"} · 연습 문항은{" "}
              {autoPublish ? "바로 공개" : "초안으로 저장"}
            </p>
          </>
        ) : (
          <p className="hgins-cta__hint">반영이 진행 중이에요.</p>
        )}
      </div>
    </Panel>
  );
}

const JOB_COLUMNS: Column<CatalogJob>[] = [
  { key: "created", header: "일시", render: (j) => <Timestamp at={j.created_at} /> },
  { key: "kind", header: "작업", render: (j) => (j.kind === "plan" ? "미리보기" : "앱에 반영") },
  { key: "status", header: "결과", render: (j) => <JobBadge job={j} /> },
  {
    key: "summary",
    header: "내용",
    render: (j) => {
      if (j.error) return <span className="hgadm-field__error">{j.error}</span>;
      if (j.kind === "plan") {
        const c = (j.result.plan as PlanSummary | undefined)?.counts;
        if (!c) return "—";
        const parts = [
          c.create ? `추가 ${n(c.create)}` : null,
          c.update ? `변경 ${n(c.update)}` : null,
          c.skip ? `그대로 ${n(c.skip)}` : null,
          problemsIn(c) ? `확인 필요 ${n(problemsIn(c))}` : null,
        ].filter(Boolean);
        return parts.join(" · ") || "—";
      }
      return j.status === "succeeded" ? `회원에게 공개 ${n(j.result.published)}건` : "—";
    },
  },
  { key: "by", header: "실행한 관리자", render: (j) => j.requested_by_email ?? "—" },
];

/** Every preview and import, newest first, with the technical details folded away. */
export function HistoryPanel({ d, state }: { d: CatalogImportOverview; state: State }) {
  const db = d.database;
  return (
    <Panel title="업데이트 기록" description="미리보기와 반영을 실행한 기록이에요. 최근 순서로 보여요.">
      <DataTable columns={JOB_COLUMNS} rows={d.jobs} rowKey={(j) => j.job_id} empty="아직 실행한 작업이 없어요." />
      <details className="hgins-more">
        <summary>기술 정보 (개발자용)</summary>
        <div className="hgins-more__body">
          <Dl
            items={[
              ["대상 데이터베이스", <strong data-testid="catalog-db-name">{db.database}</strong>],
              ["서버", db.server ? `${db.dialect} ${db.server} · ${db.user}` : db.dialect],
              [
                "마이그레이션",
                state.revisionOk ? (
                  <Badge tone="success">{db.revisions.join(", ") || "확인 안 함"}</Badge>
                ) : (
                  <Badge tone="danger">
                    {db.revisions.join(", ") || "없음"} → {db.expected_revisions?.join(", ")} 필요
                  </Badge>
                ),
              ],
              ["커리큘럼 v1 스킬", db.skills_missing ? <Badge tone="info">{db.skills_missing}개 없음 · 반영할 때 함께 생성</Badge> : "모두 있음"],
              ["연습 문항 자동 공개", d.auto_publish ? "켜짐" : "꺼짐 (초안으로 저장)"],
              ["패키지 위치", <span className="hgadm-cell-mono">{d.package.path ?? "—"}</span>],
              ...(state.latestImport?.import_id
                ? ([["마지막 반영 ID", <span className="hgadm-cell-mono">{state.latestImport.import_id}</span>]] as [string, ReactNode][])
                : []),
            ]}
          />
        </div>
      </details>
    </Panel>
  );
}

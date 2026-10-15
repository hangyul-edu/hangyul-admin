import { useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, CheckCircle2, Eye, PackagePlus, ShieldAlert, Upload } from "lucide-react";
import { catalogImportApi } from "../catalogImportApi";
import type { CatalogImportOverview, CatalogJob, PlanSummary } from "../catalogImportApi";
import { Badge, Button, DataTable, Dl, ErrorState, Field, Input, LoadingState, Modal } from "../components/kit";
import type { Column } from "../components/kit";
import { Notice, PageHero, Panel } from "../components/insights";
import { formatDateTime } from "../lib/format";
import { ApiError, errorMessage } from "../../lib/http";
import { useToast, useToastError } from "../../hooks/toast";

/**
 * 콘텐츠 업데이트 (super-admin): bring the content package that ships with the
 * server into the database the app uses.
 *
 * A guided flow over two background jobs the page polls:
 * 1. 미리보기 — a dry run: checks the package and its checksums, checks the
 *    database, and works out what would be added, changed or left alone.
 *    Nothing is written.
 * 2. 반영 — applies that preview, only after typing the database name and
 *    confirming a backup. The server re-checks everything, applies it in one
 *    transaction and verifies nothing is left to do.
 * 3. 완료 — what members can now see, and what is held back.
 */

const PLAN_VALID_MS = 60 * 60 * 1000;

const PROGRESS_LABEL: Record<string, string> = {
  package: "패키지 파일 검사",
  target: "앱 데이터베이스 확인",
  plan: "바뀌는 내용 계산",
  import: "콘텐츠 반영 (한 번에 처리)",
  verify: "반영 결과 검증",
};
const PLAN_STEPS = ["package", "target", "plan"];
const IMPORT_STEPS = ["package", "target", "plan", "import", "verify"];

const READINESS_LABEL: Record<string, string> = {
  release_candidate: "출시 후보",
  released: "정식 배포",
  draft: "작업 중",
};

const HELD_LABEL: Record<string, string> = {
  pending_audio: "오디오 준비 중",
  restricted_in_review: "검토 대기 (모의고사·평가 자료)",
};

function changesIn(counts: Record<string, number> | undefined): number {
  return (counts?.create ?? 0) + (counts?.update ?? 0);
}

function problemsIn(counts: Record<string, number> | undefined): number {
  return (counts?.conflict ?? 0) + (counts?.dependency_failure ?? 0);
}

function n(value: number | undefined): string {
  return (value ?? 0).toLocaleString();
}

/** Why the latest preview cannot be applied, or null when it can. */
export function importBlocker(plan: CatalogJob | undefined, overview: CatalogImportOverview, now = Date.now()): string | null {
  if (!plan) return "먼저 미리보기로 바뀌는 내용을 확인하세요.";
  if (plan.status !== "succeeded") return "미리보기가 성공해야 반영할 수 있어요.";
  const summary = plan.result.plan as PlanSummary | undefined;
  if (!summary?.ok) return "미리보기에서 충돌이나 빠진 연결이 발견되어 반영할 수 없어요.";
  const newer = overview.jobs.find((j) => j.kind === "import" && j.status === "succeeded" && j.created_at > plan.created_at);
  if (newer) return "이 미리보기 뒤에 이미 반영이 실행됐어요. 미리보기를 다시 하세요.";
  // Before the age check: a preview that found nothing to do says the app is
  // up to date, which matters more than that the preview has aged.
  const needsSeed = Boolean(plan.result.target?.skills_missing);
  if (changesIn(summary.counts) === 0 && !needsSeed) return "반영할 내용이 없어요. 앱에 이미 이 패키지가 들어가 있어요.";
  if (!plan.finished_at || now - new Date(plan.finished_at).getTime() > PLAN_VALID_MS)
    return "미리보기는 1시간 동안만 유효해요. 미리보기를 다시 하세요.";
  return null;
}

function JobBadge({ job }: { job: CatalogJob }) {
  if (job.status === "succeeded") return <Badge tone="success">완료</Badge>;
  if (job.status === "failed") return <Badge tone="danger">실패</Badge>;
  return <Badge tone="info">{job.status === "queued" ? "대기 중" : "진행 중"}</Badge>;
}

function Progress({ job }: { job: CatalogJob }) {
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

function Fact({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "good" | "bad" | "brand" }) {
  return (
    <div className={`hgins-fact${tone ? ` hgins-fact--${tone}` : ""}`}>
      <div className="hgins-fact__label">{label}</div>
      <div className="hgins-fact__value">{value}</div>
      {hint && <div className="hgins-fact__hint">{hint}</div>}
    </div>
  );
}

function Stepper({ current, done }: { current: 1 | 2 | 3; done: number[] }) {
  const steps: [string, string][] = [
    ["미리보기", "바뀌는 내용 확인"],
    ["앱에 반영", "확인 후 한 번에 적용"],
    ["완료", "회원에게 공개된 내용"],
  ];
  return (
    <ol className="hgins-steps" aria-label="업데이트 단계">
      {steps.map(([title, sub], i) => {
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

export function CatalogImportPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [backup, setBackup] = useState(false);
  const [seed, setSeed] = useState(false);

  const query = useQuery({
    queryKey: ["admin", "catalog-import"],
    queryFn: catalogImportApi.overview,
    refetchInterval: (q) => (q.state.data?.active_job ? 2000 : false),
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["admin", "catalog-import"] });

  const planMutation = useMutation({
    mutationFn: catalogImportApi.startPlan,
    onSuccess: () => {
      toast.success("미리보기를 시작했어요. 1~2분 정도 걸려요.");
      refresh();
    },
    onError: toastError,
  });

  const importMutation = useMutation({
    mutationFn: catalogImportApi.startImport,
    onSuccess: () => {
      toast.success("반영을 시작했어요. 이 화면에서 진행 상황을 볼 수 있어요.");
      setConfirmOpen(false);
      refresh();
    },
    onError: toastError,
  });

  const hero = (
    <PageHero
      icon={PackagePlus}
      eyebrow="콘텐츠"
      title="콘텐츠 업데이트"
      description="새로 준비된 학습 콘텐츠 패키지를 앱에 반영합니다. 먼저 미리보기로 무엇이 추가·변경되는지 확인하고, 확인이 끝나면 한 번에 반영하세요. 같은 내용은 다시 반영해도 중복되지 않아요."
    />
  );

  if (query.isLoading)
    return (
      <div>
        {hero}
        <LoadingState />
      </div>
    );
  if (query.isError) {
    // A 404 here means the API process predates this page (the admin bundle
    // was updated, the server was not), not that the package is missing.
    const stale = query.error instanceof ApiError && query.error.status === 404;
    return (
      <div>
        {hero}
        <ErrorState
          message={
            stale
              ? "API 서버가 이 화면보다 오래된 버전이에요. 서버를 최신 코드로 다시 시작하고 마이그레이션(alembic upgrade head)을 적용한 뒤 새로고침하세요."
              : errorMessage(query.error)
          }
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  const d = query.data!;
  const db = d.database;
  const active = d.active_job;
  const latestPlan = d.jobs.find((j) => j.kind === "plan");
  const latestImport = d.jobs.find((j) => j.kind === "import");
  const blocker = importBlocker(latestPlan, d);
  const plan = latestPlan?.result.plan as PlanSummary | undefined;
  const needsSeed = Boolean(latestPlan?.result.target?.skills_missing);
  const revisionOk =
    db.expected_revisions == null ||
    (db.revisions.length === db.expected_revisions.length && db.revisions.every((r) => db.expected_revisions!.includes(r)));
  const nameMatches = typedName === db.database;
  const canConfirm = nameMatches && backup && (!needsSeed || seed);

  const applied = db.previous_imports.find((p) => p.status === "applied") ?? db.previous_imports[0];
  const importDone =
    latestImport?.status === "succeeded" && (!latestPlan || latestImport.created_at > latestPlan.created_at);
  const upToDate =
    !d.package_error &&
    applied?.package_version === d.package.version &&
    (importDone || (latestPlan?.status === "succeeded" && plan?.ok && changesIn(plan.counts) === 0));

  const finished = !active && (importDone || upToDate);
  const current: 1 | 2 | 3 = active?.kind === "import" ? 2 : active ? 1 : finished ? 3 : blocker === null ? 2 : 1;
  const doneSteps = finished ? [1, 2, 3] : current === 2 ? [1] : [];

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

  const openConfirm = () => {
    setTypedName("");
    setBackup(false);
    setSeed(false);
    setConfirmOpen(true);
  };

  const jobColumns: Column<CatalogJob>[] = [
    { key: "created", header: "일시", render: (j) => formatDateTime(j.created_at) },
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

  return (
    <div>
      {hero}

      {/* Where things stand, before anything else. */}
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

      {d.package_error && (
        <Notice tone="danger" icon={ShieldAlert} title="패키지를 읽을 수 없어요">
          {d.package_error}
        </Notice>
      )}
      {!revisionOk && (
        <Notice tone="danger" icon={ShieldAlert} title="앱 데이터베이스가 이 기능보다 오래된 버전이에요">
          마이그레이션을 먼저 적용하세요 (현재 {db.revisions.join(", ") || "없음"} → 필요 {db.expected_revisions?.join(", ")}).
        </Notice>
      )}

      <Stepper current={current} done={doneSteps} />

      {/* Step 1 — preview */}
      <Panel
        title="1. 미리보기"
        description="패키지를 검사하고 지금 앱 데이터와 비교해, 반영하면 무엇이 추가·변경되는지 계산해요. 이 단계에서는 아무것도 바뀌지 않아요. 1~2분 걸릴 수 있어요."
        actions={
          <Button
            variant={latestPlan ? "secondary" : "primary"}
            onClick={() => planMutation.mutate()}
            loading={planMutation.isPending}
            disabled={Boolean(active) || Boolean(d.package_error)}
          >
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
                <div className="hgins-facts">
                  <Fact label="새로 추가" value={n(plan?.counts.create)} tone={plan?.counts.create ? "brand" : undefined} />
                  <Fact label="내용 변경" value={n(plan?.counts.update)} tone={plan?.counts.update ? "brand" : undefined} />
                  <Fact label="변경 없음" value={n(plan?.counts.skip)} />
                  <Fact
                    label="확인 필요"
                    value={n(problemsIn(plan?.counts))}
                    tone={problemsIn(plan?.counts) ? "bad" : "good"}
                    hint={problemsIn(plan?.counts) ? "충돌·빠진 연결" : "문제 없음"}
                  />
                </div>
                {plan && (plan.conflicts.length > 0 || plan.dependency_failures.length > 0) && (
                  <details className="hgins-more">
                    <summary>확인이 필요한 항목 보기</summary>
                    <div className="hgins-more__body">
                      {plan.conflicts.length > 0 && (
                        <>
                          <strong>충돌 (이미 다른 내용으로 들어가 있음)</strong>
                          <ul className="hgins-list">
                            {plan.conflicts.slice(0, 10).map((c) => (
                              <li key={c}>{c}</li>
                            ))}
                          </ul>
                        </>
                      )}
                      {plan.dependency_failures.length > 0 && (
                        <>
                          <strong>빠진 연결 (참조하는 항목이 없음)</strong>
                          <ul className="hgins-list">
                            {plan.dependency_failures.slice(0, 10).map((c) => (
                              <li key={c}>{c}</li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  </details>
                )}
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

      {/* Step 2 — apply */}
      <Panel
        title="2. 앱에 반영"
        description="미리보기 내용을 그대로 적용해요. 한 번에 처리되므로 도중에 실패하면 아무것도 바뀌지 않고, 미리보기 뒤에 데이터가 달라졌다면 반영을 멈춰요."
      >
        {active?.kind === "import" ? (
          <Progress job={active} />
        ) : (
          <div className="hgins-cta">
            <Button variant="primary" onClick={openConfirm} disabled={Boolean(active) || blocker !== null}>
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

      {/* Step 3 — result */}
      {latestImport && (
        <Panel title="3. 반영 결과" description="마지막 반영에서 회원에게 공개된 콘텐츠와, 아직 공개되지 않고 보류된 콘텐츠예요.">
          <div data-testid="catalog-import">
            {latestImport.status === "failed" ? (
              <Notice tone="danger" icon={ShieldAlert} title="반영이 실패했어요 — 아무것도 바뀌지 않았어요">
                {latestImport.error}
              </Notice>
            ) : latestImport.status === "succeeded" ? (
              <>
                <div className="hgins-facts">
                  <Fact label="회원에게 공개" value={n(latestImport.result.published)} tone="good" />
                  {Object.entries(latestImport.result.held ?? {}).map(([k, v]) => (
                    <Fact key={k} label={HELD_LABEL[k] ?? k} value={n(v)} hint="공개 보류" />
                  ))}
                  <Fact
                    label="반영 후 검증"
                    value={changesIn(latestImport.result.verification) === 0 ? "통과" : "다시 확인"}
                    tone={changesIn(latestImport.result.verification) === 0 ? "good" : "bad"}
                    hint={
                      changesIn(latestImport.result.verification) === 0
                        ? "남은 변경 없음"
                        : `남은 변경 ${n(changesIn(latestImport.result.verification))}건`
                    }
                  />
                </div>
                <p className="hgins-cta__hint hgadm-mt-12">
                  {formatDateTime(latestImport.created_at)} 반영 · {latestImport.requested_by_email ?? "알 수 없음"} ·
                  연습 문항은 {d.auto_publish ? "바로 공개" : "초안으로 저장"}
                </p>
              </>
            ) : (
              <p className="hgins-cta__hint">반영이 진행 중이에요.</p>
            )}
          </div>
        </Panel>
      )}

      <Panel title="업데이트 기록" description="미리보기와 반영을 실행한 기록이에요. 최근 순서로 보여요.">
        <DataTable columns={jobColumns} rows={d.jobs} rowKey={(j) => j.job_id} empty="아직 실행한 작업이 없어요." />
        <details className="hgins-more">
          <summary>기술 정보 (개발자용)</summary>
          <div className="hgins-more__body">
            <Dl
              items={[
                ["대상 데이터베이스", <strong data-testid="catalog-db-name">{db.database}</strong>],
                ["서버", db.server ? `${db.dialect} ${db.server} · ${db.user}` : db.dialect],
                [
                  "마이그레이션",
                  revisionOk ? (
                    <Badge tone="success">{db.revisions.join(", ") || "확인 안 함"}</Badge>
                  ) : (
                    <Badge tone="danger">
                      {db.revisions.join(", ") || "없음"} → {db.expected_revisions?.join(", ")} 필요
                    </Badge>
                  ),
                ],
                [
                  "커리큘럼 v1 스킬",
                  db.skills_missing ? <Badge tone="info">{db.skills_missing}개 없음 · 반영할 때 함께 생성</Badge> : "모두 있음",
                ],
                ["연습 문항 자동 공개", d.auto_publish ? "켜짐" : "꺼짐 (초안으로 저장)"],
                ["패키지 위치", <span className="hgadm-cell-mono">{d.package.path ?? "—"}</span>],
                ...(latestImport?.import_id
                  ? ([["마지막 반영 ID", <span className="hgadm-cell-mono">{latestImport.import_id}</span>]] as [string, ReactNode][])
                  : []),
              ]}
            />
          </div>
        </details>
      </Panel>

      <Modal
        open={confirmOpen}
        title="앱에 콘텐츠 반영"
        onClose={importMutation.isPending ? () => {} : () => setConfirmOpen(false)}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={importMutation.isPending}>
              취소
            </Button>
            <Button
              variant="danger"
              loading={importMutation.isPending}
              disabled={!canConfirm}
              onClick={() =>
                latestPlan &&
                importMutation.mutate({
                  plan_job_id: latestPlan.job_id,
                  confirm_database: typedName,
                  backup_confirmed: backup,
                  seed_curriculum: seed,
                })
              }
            >
              반영하기
            </Button>
          </>
        }
      >
        <div className="hgins-facts hgadm-mb-12">
          <Fact label="새로 추가" value={n(plan?.counts.create)} tone="brand" />
          <Fact label="내용 변경" value={n(plan?.counts.update)} tone="brand" />
        </div>
        <ul className="hgins-list hgadm-mt-0 hgadm-mb-16">
          <li>
            연습 문항은 {d.auto_publish ? "바로 회원에게 공개돼요" : "초안으로 저장돼요 (공개는 따로 해야 해요)"}.
          </li>
          <li>오디오가 아직 없는 듣기 문항과 모의고사·평가 자료는 공개하지 않고 보류해요.</li>
          <li>한 번에 처리되므로 실패하면 아무것도 바뀌지 않아요.</li>
        </ul>
        <Field
          label={`실수를 막기 위해 데이터베이스 이름(${db.database})을 그대로 입력하세요`}
          error={typedName && !nameMatches ? "이름이 일치하지 않아요." : null}
        >
          <Input value={typedName} onChange={(e) => setTypedName(e.target.value)} autoComplete="off" aria-label="데이터베이스 이름" />
        </Field>
        <label className="hgadm-checkbox hgadm-checkbox--block hgadm-mt-8">
          <input type="checkbox" checked={backup} onChange={(e) => setBackup(e.target.checked)} />
          반영 전에 이 데이터베이스를 백업했고, 복원할 수 있음을 확인했습니다.
        </label>
        {needsSeed && (
          <label className="hgadm-checkbox hgadm-checkbox--block hgadm-mt-8">
            <input type="checkbox" checked={seed} onChange={(e) => setSeed(e.target.checked)} />
            빠진 커리큘럼 v1 스킬도 함께 만듭니다.
          </label>
        )}
      </Modal>
    </div>
  );
}

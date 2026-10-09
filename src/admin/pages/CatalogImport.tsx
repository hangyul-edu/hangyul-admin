import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DatabaseZap, PackageCheck } from "lucide-react";
import { catalogImportApi } from "../catalogImportApi";
import type { CatalogImportOverview, CatalogJob, PlanSummary } from "../catalogImportApi";
import { Badge, Button, DataTable, Dl, ErrorState, Field, Input, LoadingState, Modal } from "../components/kit";
import type { Column } from "../components/kit";
import { formatDateTime } from "../lib/format";
import { ApiError, errorMessage } from "../../lib/http";
import { useToast, useToastError } from "../../hooks/toast";

/**
 * Super-admin page: import the content catalog package into the app's database.
 *
 * Two steps, both background jobs the page polls:
 * 1. a plan (dry run) — validates the package and checksums, checks the
 *    database, and shows what would be created, updated or skipped;
 * 2. the import of that plan — only after typing the database name and
 *    confirming a backup. The server re-checks everything, imports in one
 *    transaction and verifies that nothing is left to do.
 */

const PLAN_VALID_MS = 60 * 60 * 1000;

const STEP_LABEL: Record<string, string> = {
  package: "패키지 검증",
  target: "데이터베이스 확인",
  plan: "가져오기 계획 계산",
  import: "가져오는 중 (하나의 트랜잭션)",
  verify: "결과 검증",
};

const ACTION_LABEL: Record<string, string> = {
  create: "새로 추가",
  update: "새 개정으로 갱신",
  skip: "변경 없음",
  conflict: "충돌",
  dependency_failure: "의존성 누락",
};

const HELD_LABEL: Record<string, string> = {
  pending_audio: "오디오 대기",
  restricted_in_review: "제한 자료 검토 대기",
};

function statusBadge(job: CatalogJob) {
  if (job.status === "succeeded") return <Badge tone="success">완료</Badge>;
  if (job.status === "failed") return <Badge tone="danger">실패</Badge>;
  return <Badge tone="info">{job.status === "queued" ? "대기 중" : STEP_LABEL[job.step ?? ""] ?? "진행 중"}</Badge>;
}

function changesIn(counts: Record<string, number> | undefined): number {
  return (counts?.create ?? 0) + (counts?.update ?? 0);
}

function countsText(counts: Record<string, number> | undefined): string {
  if (!counts || Object.keys(counts).length === 0) return "—";
  return Object.entries(counts)
    .map(([k, v]) => `${ACTION_LABEL[k] ?? k} ${v.toLocaleString()}`)
    .join(" · ");
}

/** Why the latest plan cannot be imported, or null when it can. */
export function importBlocker(plan: CatalogJob | undefined, overview: CatalogImportOverview, now = Date.now()): string | null {
  if (!plan) return "먼저 가져오기 계획을 만드세요.";
  if (plan.status !== "succeeded") return "성공한 계획만 가져올 수 있어요.";
  const summary = plan.result.plan as PlanSummary | undefined;
  if (!summary?.ok) return "계획에 충돌이나 의존성 누락이 있어 가져올 수 없어요.";
  const newer = overview.jobs.find((j) => j.kind === "import" && j.status === "succeeded" && j.created_at > plan.created_at);
  if (newer) return "이 계획 이후에 가져오기가 실행됐어요. 계획을 다시 만드세요.";
  if (!plan.finished_at || now - new Date(plan.finished_at).getTime() > PLAN_VALID_MS)
    return "계획이 만들어진 지 1시간이 지났어요. 계획을 다시 만드세요.";
  const needsSeed = Boolean(plan.result.target?.skills_missing);
  if (changesIn(summary.counts) === 0 && !needsSeed) return "가져올 것이 없어요. 데이터베이스에 이미 이 패키지가 있습니다.";
  return null;
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
      toast.success("가져오기 계획(모의 실행)을 시작했어요.");
      refresh();
    },
    onError: toastError,
  });

  const importMutation = useMutation({
    mutationFn: catalogImportApi.startImport,
    onSuccess: () => {
      toast.success("가져오기를 시작했어요. 끝날 때까지 이 화면에서 진행 상황을 볼 수 있어요.");
      setConfirmOpen(false);
      refresh();
    },
    onError: toastError,
  });

  if (query.isLoading) return <LoadingState />;
  if (query.isError) {
    // A 404 here means the API process predates this page (the admin bundle
    // was updated, the server was not), not that the catalog is missing.
    const stale = query.error instanceof ApiError && query.error.status === 404;
    return (
      <ErrorState
        message={
          stale
            ? "API 서버가 이 화면보다 오래된 버전이에요. 서버를 최신 코드로 다시 시작하고 마이그레이션(alembic upgrade head)을 적용한 뒤 새로고침하세요."
            : errorMessage(query.error)
        }
        onRetry={() => void query.refetch()}
      />
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

  const openConfirm = () => {
    setTypedName("");
    setBackup(false);
    setSeed(false);
    setConfirmOpen(true);
  };

  const jobColumns: Column<CatalogJob>[] = [
    { key: "created", header: "시작", render: (j) => formatDateTime(j.created_at) },
    { key: "kind", header: "종류", render: (j) => (j.kind === "plan" ? "계획(모의 실행)" : "가져오기") },
    { key: "status", header: "상태", render: statusBadge },
    {
      key: "counts",
      header: "내용",
      render: (j) =>
        j.kind === "plan"
          ? countsText((j.result.plan as PlanSummary | undefined)?.counts)
          : j.status === "succeeded"
            ? `게시 ${j.result.published?.toLocaleString() ?? 0}건`
            : "—",
    },
    { key: "by", header: "요청자", render: (j) => j.requested_by_email ?? "—" },
    { key: "error", header: "오류", render: (j) => j.error ?? "—" },
  ];

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>카탈로그 가져오기</h1>
          <div className="hgadm-page-head__desc">
            서버에 있는 콘텐츠 카탈로그 패키지를 앱이 쓰는 데이터베이스로 가져옵니다. 먼저 계획(모의 실행)으로 무엇이
            바뀌는지 확인한 뒤, 데이터베이스 이름을 입력해 확인해야 가져오기가 실행됩니다. 다시 실행해도 같은 내용은
            건너뛰므로 중복되지 않습니다.
          </div>
        </div>
      </div>

      <div className="hgadm-card">
        <h3>
          <PackageCheck size={16} strokeWidth={2} /> 패키지
        </h3>
        {d.package_error ? (
          <p className="hgadm-field__error">{d.package_error}</p>
        ) : (
          <Dl
            items={[
              ["패키지", `${d.package.package_id} v${d.package.version}`],
              ["파일", `${d.package.files?.toLocaleString()}개 (${d.package.readiness ?? "—"})`],
              ["위치", <span className="hgadm-cell-mono">{d.package.path}</span>],
            ]}
          />
        )}
      </div>

      <div className="hgadm-card">
        <h3>
          <DatabaseZap size={16} strokeWidth={2} /> 대상 데이터베이스 (앱 설정)
        </h3>
        <Dl
          items={[
            ["데이터베이스", <strong data-testid="catalog-db-name">{db.database}</strong>],
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
              "커리큘럼 v1",
              db.skills_missing ? <Badge tone="warning">{db.skills_missing}개 스킬 누락 (가져올 때 함께 생성)</Badge> : "완료",
            ],
            ["연습 문항 자동 게시", d.auto_publish ? "켜짐" : "꺼짐 (초안으로 가져옴)"],
            [
              "이전 가져오기",
              db.previous_imports.length
                ? db.previous_imports.map((p) => `v${p.package_version} ${p.status} ${p.finished_at ? formatDateTime(p.finished_at) : ""}`).join(" / ")
                : "없음",
            ],
          ]}
        />
      </div>

      <div className="hgadm-card">
        <h3>1단계 · 가져오기 계획 (모의 실행)</h3>
        <p className="hgadm-cell-sub">
          패키지 검증과 체크섬 확인, 데이터베이스 확인을 거쳐 무엇이 추가·갱신·건너뛰어지는지 계산합니다. 데이터베이스는
          바뀌지 않습니다. 패키지가 커서 1~2분 걸릴 수 있어요.
        </p>
        <Button variant="primary" onClick={() => planMutation.mutate()} loading={planMutation.isPending} disabled={Boolean(active)}>
          계획 만들기
        </Button>
        {latestPlan && (
          <div style={{ marginTop: 14 }} data-testid="catalog-plan">
            <Dl
              items={[
                ["상태", statusBadge(latestPlan)],
                ["시작", formatDateTime(latestPlan.created_at)],
                ["계획", countsText(plan?.counts)],
                ...(plan?.conflicts.length ? [["충돌", plan.conflicts.slice(0, 10).join("\n")] as [string, string]] : []),
                ...(plan?.dependency_failures.length
                  ? [["의존성 누락", plan.dependency_failures.slice(0, 10).join("\n")] as [string, string]]
                  : []),
                ...(latestPlan.error ? [["오류", <span className="hgadm-field__error">{latestPlan.error}</span>] as [string, JSX.Element]] : []),
              ]}
            />
          </div>
        )}
      </div>

      <div className="hgadm-card">
        <h3>2단계 · 가져오기 실행</h3>
        <p className="hgadm-cell-sub">
          최근 계획을 그대로 적용합니다. 하나의 트랜잭션으로 실행되어 실패하면 아무것도 바뀌지 않고, 계획 이후 데이터베이스가
          달라졌으면 실행을 거부합니다.
        </p>
        <Button variant="danger" onClick={openConfirm} disabled={Boolean(active) || blocker !== null}>
          가져오기 실행…
        </Button>
        {blocker && !active && <p className="hgadm-field__hint" style={{ marginTop: 8 }}>{blocker}</p>}
        {latestImport && (
          <div style={{ marginTop: 14 }} data-testid="catalog-import">
            <Dl
              items={[
                ["상태", statusBadge(latestImport)],
                ["시작", formatDateTime(latestImport.created_at)],
                ...(latestImport.status === "succeeded"
                  ? ([
                      ["게시", `${latestImport.result.published?.toLocaleString()}건`],
                      [
                        "보류",
                        Object.entries(latestImport.result.held ?? {})
                          .map(([k, v]) => `${HELD_LABEL[k] ?? k} ${v.toLocaleString()}`)
                          .join(" · ") || "없음",
                      ],
                      ["검증", `다시 계획하면 ${countsText(latestImport.result.verification)}`],
                      ["가져오기 ID", <span className="hgadm-cell-mono">{latestImport.import_id}</span>],
                    ] as [string, React.ReactNode][])
                  : []),
                ...(latestImport.error ? [["오류", <span className="hgadm-field__error">{latestImport.error}</span>] as [string, JSX.Element]] : []),
              ]}
            />
          </div>
        )}
      </div>

      <div className="hgadm-card">
        <h3>작업 기록</h3>
        <DataTable columns={jobColumns} rows={d.jobs} rowKey={(j) => j.job_id} empty="아직 실행한 작업이 없습니다." />
      </div>

      <Modal
        open={confirmOpen}
        title="카탈로그 가져오기 실행"
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
              가져오기
            </Button>
          </>
        }
      >
        <p>
          <strong>{db.database}</strong> 데이터베이스에 다음 내용을 적용합니다: {countsText(plan?.counts)}.
        </p>
        <p className="hgadm-cell-sub" style={{ margin: "8px 0 14px" }}>
          연습 문항은 {d.auto_publish ? "바로 게시되고" : "초안으로 들어가고"}, 오디오가 없는 듣기 문항과 제한 자료(모의고사·평가
          과제)는 회원에게 제공되지 않은 채 보류됩니다.
        </p>
        <Field label={`확인을 위해 데이터베이스 이름(${db.database})을 입력하세요`} error={typedName && !nameMatches ? "이름이 일치하지 않아요." : null}>
          <Input value={typedName} onChange={(e) => setTypedName(e.target.value)} autoComplete="off" aria-label="데이터베이스 이름" />
        </Field>
        <label className="hgadm-checkbox" style={{ display: "flex", marginTop: 6 }}>
          <input type="checkbox" checked={backup} onChange={(e) => setBackup(e.target.checked)} />
          이 데이터베이스의 백업을 만들었고, 복원 가능함을 확인했습니다.
        </label>
        {needsSeed && (
          <label className="hgadm-checkbox" style={{ display: "flex", marginTop: 6 }}>
            <input type="checkbox" checked={seed} onChange={(e) => setSeed(e.target.checked)} />
            누락된 커리큘럼 v1 스킬도 같은 트랜잭션에서 생성합니다.
          </label>
        )}
      </Modal>
    </div>
  );
}

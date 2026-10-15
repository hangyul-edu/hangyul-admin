import type { CatalogImportOverview, CatalogJob, PlanSummary } from "../../catalogImportApi";

const PLAN_VALID_MS = 60 * 60 * 1000;

export const PROGRESS_LABEL: Record<string, string> = {
  package: "패키지 파일 검사",
  target: "앱 데이터베이스 확인",
  plan: "바뀌는 내용 계산",
  import: "콘텐츠 반영 (한 번에 처리)",
  verify: "반영 결과 검증",
};
export const PLAN_STEPS = ["package", "target", "plan"];
export const IMPORT_STEPS = ["package", "target", "plan", "import", "verify"];

export const READINESS_LABEL: Record<string, string> = {
  release_candidate: "출시 후보",
  released: "정식 배포",
  draft: "작업 중",
};

export const HELD_LABEL: Record<string, string> = {
  pending_audio: "오디오 준비 중",
  restricted_in_review: "검토 대기 (모의고사·평가 자료)",
};

export function changesIn(counts: Record<string, number> | undefined): number {
  return (counts?.create ?? 0) + (counts?.update ?? 0);
}

export function problemsIn(counts: Record<string, number> | undefined): number {
  return (counts?.conflict ?? 0) + (counts?.dependency_failure ?? 0);
}

export function n(value: number | undefined): string {
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

/**
 * Where the update stands, worked out once from the overview: the latest
 * preview and import, whether the app already has this package, which step
 * the flow is on, and what (if anything) stops the import.
 */
export function updateState(d: CatalogImportOverview) {
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

  const applied = db.previous_imports.find((p) => p.status === "applied") ?? db.previous_imports[0];
  const importDone = latestImport?.status === "succeeded" && (!latestPlan || latestImport.created_at > latestPlan.created_at);
  const upToDate =
    !d.package_error &&
    applied?.package_version === d.package.version &&
    (importDone || (latestPlan?.status === "succeeded" && plan?.ok && changesIn(plan.counts) === 0));

  const finished = !active && (importDone || upToDate);
  const current: 1 | 2 | 3 = active?.kind === "import" ? 2 : active ? 1 : finished ? 3 : blocker === null ? 2 : 1;
  const doneSteps = finished ? [1, 2, 3] : current === 2 ? [1] : [];

  return { active, latestPlan, latestImport, blocker, plan, needsSeed, revisionOk, applied, upToDate: Boolean(upToDate), current, doneSteps };
}

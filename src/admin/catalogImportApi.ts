// Typed client for the content-catalog import (/admin/content-catalog/package-import).
// Shapes mirror src/modules/content_catalog/presentation/package_import_router.py.
import { http } from "../lib/http";

const BASE = "/admin/content-catalog/package-import";

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export interface PlanSummary {
  ok: boolean;
  counts: Record<string, number>;
  conflicts: string[];
  dependency_failures: string[];
}

export interface TargetInfo {
  dialect: string;
  database: string;
  user: string | null;
  server: string | null;
  revisions: string[];
  expected_revisions?: string[] | null;
  missing_tables: string[];
  skills_missing: number | null;
  previous_imports: {
    import_id: string;
    package_version: string;
    status: string;
    actor: string | null;
    finished_at: string | null;
  }[];
}

export interface CatalogJob {
  job_id: string;
  kind: "plan" | "import";
  status: JobStatus;
  step: string | null;
  database_name: string;
  plan_job_id: string | null;
  requested_by_email: string | null;
  package: { package_id?: string; version?: string; manifest_sha256?: string; records?: number; stimuli?: number; forms?: number };
  result: {
    target?: TargetInfo;
    plan?: PlanSummary | Record<string, number>;
    auto_publish?: boolean;
    import_id?: string;
    published?: number;
    held?: Record<string, number>;
    curriculum_rows_seeded?: number;
    verification?: Record<string, number>;
  };
  error: string | null;
  import_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface CatalogImportOverview {
  package: { package_id?: string; version?: string; readiness?: string; files?: number; path?: string };
  package_error: string | null;
  database: TargetInfo;
  auto_publish: boolean;
  active_job: CatalogJob | null;
  jobs: CatalogJob[];
}

export interface StartImportBody {
  plan_job_id: string;
  confirm_database: string;
  backup_confirmed: boolean;
  seed_curriculum: boolean;
}

export const catalogImportApi = {
  overview: () => http.get<CatalogImportOverview>(BASE),
  startPlan: () => http.post<CatalogJob>(`${BASE}/plan`),
  startImport: (body: StartImportBody) => http.post<CatalogJob>(`${BASE}/import`, body),
  job: (jobId: string) => http.get<CatalogJob>(`${BASE}/jobs/${jobId}`),
};

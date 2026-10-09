/**
 * The catalog-import page: the import stays locked until a fresh, successful
 * plan exists, and the confirmation needs the exact database name and the
 * backup box before anything is sent.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ToastProvider } from "../../hooks/toast";
import { CatalogImportPage, importBlocker } from "./CatalogImport";
import { catalogImportApi } from "../catalogImportApi";
import type { CatalogImportOverview, CatalogJob } from "../catalogImportApi";

vi.mock("../catalogImportApi", async () => {
  const actual = await vi.importActual<typeof import("../catalogImportApi")>("../catalogImportApi");
  return {
    ...actual,
    catalogImportApi: { overview: vi.fn(), startPlan: vi.fn(), startImport: vi.fn(), job: vi.fn() },
  };
});

const overviewMock = vi.mocked(catalogImportApi.overview);
const startImport = vi.mocked(catalogImportApi.startImport);

function planJob(overrides: Partial<CatalogJob> = {}): CatalogJob {
  const now = new Date().toISOString();
  return {
    job_id: "cij_plan1",
    kind: "plan",
    status: "succeeded",
    step: null,
    database_name: "hangyul_test",
    plan_job_id: null,
    requested_by_email: "ops@talkhangyul.co.kr",
    package: { version: "1.0.0", manifest_sha256: "abc" },
    result: {
      plan: { ok: true, counts: { create: 11373 }, conflicts: [], dependency_failures: [] },
      target: {
        dialect: "postgresql", database: "hangyul_test", user: "hangyul", server: "16.4", revisions: ["0071_catalog_import_jobs"],
        missing_tables: [], skills_missing: 0, previous_imports: [],
      },
    },
    error: null,
    import_id: null,
    created_at: now,
    started_at: now,
    finished_at: now,
    ...overrides,
  };
}

function overview(jobs: CatalogJob[]): CatalogImportOverview {
  return {
    package: { package_id: "hangyul-initial-catalog", version: "1.0.0", readiness: "release_candidate", files: 282, path: "/app/content" },
    package_error: null,
    database: {
      dialect: "postgresql", database: "hangyul_test", user: "hangyul", server: "16.4",
      revisions: ["0071_catalog_import_jobs"], expected_revisions: ["0071_catalog_import_jobs"],
      missing_tables: [], skills_missing: 0, previous_imports: [],
    },
    auto_publish: true,
    active_job: null,
    jobs,
  };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={["/catalog-import"]}>
          <CatalogImportPage />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("CatalogImportPage", () => {
  it("keeps the import locked until there is a plan", async () => {
    overviewMock.mockResolvedValue(overview([]));
    renderPage();
    expect(await screen.findByText("먼저 가져오기 계획을 만드세요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "가져오기 실행…" })).toBeDisabled();
  });

  it("sends the import only after the exact name and the backup confirmation", async () => {
    overviewMock.mockResolvedValue(overview([planJob()]));
    startImport.mockResolvedValue(planJob({ job_id: "cij_import1", kind: "import", status: "queued" }));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "가져오기 실행…" }));
    const go = screen.getByRole("button", { name: "가져오기" });
    expect(go).toBeDisabled();

    await user.type(screen.getByLabelText("데이터베이스 이름"), "hangyul");
    expect(screen.getByText("이름이 일치하지 않아요.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("데이터베이스 이름"), "_test");
    expect(go).toBeDisabled(); // backup not confirmed yet

    await user.click(screen.getByRole("checkbox"));
    expect(go).toBeEnabled();
    await user.click(go);
    await waitFor(() => expect(startImport).toHaveBeenCalled());
    expect(startImport.mock.calls[0][0]).toEqual({
      plan_job_id: "cij_plan1",
      confirm_database: "hangyul_test",
      backup_confirmed: true,
      seed_curriculum: false,
    });
  });
});

describe("importBlocker", () => {
  const base = overview([]);

  it("refuses a failed, conflicting, stale or empty plan", () => {
    expect(importBlocker(planJob({ status: "failed" }), base)).toMatch("성공한 계획");
    const conflicting = planJob();
    conflicting.result.plan = { ok: false, counts: { conflict: 1 }, conflicts: ["x"], dependency_failures: [] };
    expect(importBlocker(conflicting, base)).toMatch("충돌");
    const old = planJob({ finished_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() });
    expect(importBlocker(old, base)).toMatch("1시간");
    const empty = planJob();
    empty.result.plan = { ok: true, counts: { skip: 11373 }, conflicts: [], dependency_failures: [] };
    expect(importBlocker(empty, base)).toMatch("가져올 것이 없어요");
    expect(importBlocker(planJob(), base)).toBeNull();
  });
});

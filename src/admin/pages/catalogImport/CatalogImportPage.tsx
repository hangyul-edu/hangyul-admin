import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackagePlus, ShieldAlert } from "lucide-react";
import { catalogImportApi } from "../../catalogImportApi";
import { ErrorState, LoadingState } from "../../components/kit";
import { Notice, PageHero } from "../../components/insights";
import { ApiError, errorMessage } from "../../../lib/http";
import { useToast, useToastError } from "../../../hooks/toast";
import { ConfirmImportDialog } from "./ConfirmImportDialog";
import { updateState } from "./model";
import { ApplyPanel, HistoryPanel, PreviewPanel, ResultPanel, StatusBar } from "./panels";
import { Stepper } from "./parts";

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

const KEY = ["admin", "catalog-import"];

function useCatalogImport() {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const query = useQuery({
    queryKey: KEY,
    queryFn: catalogImportApi.overview,
    // A running job is polled until it finishes.
    refetchInterval: (q) => (q.state.data?.active_job ? 2000 : false),
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: KEY });
  const startPlan = useMutation({
    mutationFn: catalogImportApi.startPlan,
    onSuccess: () => {
      toast.success("미리보기를 시작했어요. 1~2분 정도 걸려요.");
      refresh();
    },
    onError: toastError,
  });
  const startImport = useMutation({
    mutationFn: catalogImportApi.startImport,
    onSuccess: () => {
      toast.success("반영을 시작했어요. 이 화면에서 진행 상황을 볼 수 있어요.");
      refresh();
    },
    onError: toastError,
  });
  return { query, startPlan, startImport };
}

export function CatalogImportPage() {
  const { query, startPlan, startImport } = useCatalogImport();
  const [confirmOpen, setConfirmOpen] = useState(false);

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
  const state = updateState(d);

  return (
    <div>
      {hero}
      <StatusBar d={d} state={state} />
      {d.package_error && (
        <Notice tone="danger" icon={ShieldAlert} title="패키지를 읽을 수 없어요">
          {d.package_error}
        </Notice>
      )}
      {!state.revisionOk && (
        <Notice tone="danger" icon={ShieldAlert} title="앱 데이터베이스가 이 기능보다 오래된 버전이에요">
          마이그레이션을 먼저 적용하세요 (현재 {db.revisions.join(", ") || "없음"} → 필요 {db.expected_revisions?.join(", ")}).
        </Notice>
      )}
      <Stepper current={state.current} done={state.doneSteps} />
      <PreviewPanel
        state={state}
        disabled={Boolean(state.active) || Boolean(d.package_error)}
        starting={startPlan.isPending}
        onStart={() => startPlan.mutate()}
      />
      <ApplyPanel state={state} onApply={() => setConfirmOpen(true)} />
      {state.latestImport && <ResultPanel job={state.latestImport} autoPublish={d.auto_publish} />}
      <HistoryPanel d={d} state={state} />

      {confirmOpen && (
        <ConfirmImportDialog
          database={db.database}
          plan={state.plan}
          autoPublish={d.auto_publish}
          needsSeed={state.needsSeed}
          importing={startImport.isPending}
          onClose={() => setConfirmOpen(false)}
          onImport={(confirm) =>
            state.latestPlan &&
            startImport.mutate({ plan_job_id: state.latestPlan.job_id, ...confirm }, { onSuccess: () => setConfirmOpen(false) })
          }
        />
      )}
    </div>
  );
}

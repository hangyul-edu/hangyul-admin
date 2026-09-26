import { useMutation, useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { learningApi } from "../../learningApi";
import type { CohortRow, Ratio } from "../../learningApi";
import { useUrlFilters } from "../../lib/urlFilters";
import { useAdminAuth } from "../../auth";
import { useToast, useToastError } from "../../../hooks/toast";
import { Button, DataTable, EmptyState, ErrorState, Input, LoadingState, Select } from "../../components/kit";
import type { Column } from "../../components/kit";
import { MetricLabel, RatioView, downloadExport } from "../../components/learning";
import { errorMessage } from "../../../lib/http";

/** Heat cell: background opacity follows the value; numbers always stay visible. */
function heatStyle(ratio: Ratio): CSSProperties | undefined {
  if (ratio.status !== "ok" || ratio.value === null) return undefined;
  const alpha = 0.08 + Math.min(1, Math.max(0, ratio.value)) * 0.5;
  return { background: `rgba(37, 99, 235, ${alpha.toFixed(2)})` };
}

function RetentionCell({ ratio, notYet }: { ratio: Ratio; notYet: number }) {
  return (
    <div>
      <span className="hgadm-heat" style={heatStyle(ratio)}>
        <RatioView ratio={ratio} />
      </span>
      {notYet > 0 && <div className="hgadm-cell-sub">아직 판정 불가 {notYet.toLocaleString()}명</div>}
    </div>
  );
}

export function CohortsPage() {
  const f = useUrlFilters();
  const { can } = useAdminAuth();
  const toast = useToast();
  const toastError = useToastError();
  const start = f.value("start");
  const end = f.value("end");
  const granularity = f.value("granularity", "week");
  const filters = { start: start || undefined, end: end || undefined, granularity };

  const query = useQuery({
    queryKey: ["admin", "learning", "cohorts", filters],
    queryFn: () => learningApi.cohorts(filters),
  });

  const exporter = useMutation({
    mutationFn: async () => {
      const created = await learningApi.createExport({ report: "cohorts", filters });
      await downloadExport(created.export_id, `cohorts-${created.export_id}.csv`);
      return created;
    },
    onSuccess: (created) => toast.success(`CSV를 내보냈어요 (${created.row_count.toLocaleString()}행).`),
    onError: toastError,
  });

  const columns: Column<CohortRow>[] = [
    { key: "cohort", header: "코호트 (첫 학습 기간)", render: (c) => c.cohort },
    {
      key: "size",
      header: "인원",
      numeric: true,
      render: (c) => (c.size === null ? <span className="hgadm-cell-sub">비공개</span> : c.size.toLocaleString()),
    },
    {
      key: "d1",
      header: "D1",
      render: (c) => <RetentionCell ratio={c.d1} notYet={c.d1_not_yet_eligible} />,
    },
    {
      key: "d7",
      header: "D7",
      render: (c) => <RetentionCell ratio={c.d7} notYet={c.d7_not_yet_eligible} />,
    },
    {
      key: "d30",
      header: "D30",
      render: (c) => <RetentionCell ratio={c.d30} notYet={c.d30_not_yet_eligible} />,
    },
  ];

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>코호트·재방문</h1>
          <div className="hgadm-page-head__desc">
            첫 학습일 기준 코호트별 D1·D7·D30 재방문율입니다. 아직 해당 일수가 지나지 않은 학습자는 분모에서 제외됩니다.
          </div>
        </div>
        {can("exports:create") && (
          <Button variant="secondary" loading={exporter.isPending} onClick={() => exporter.mutate()}>
            CSV 내보내기
          </Button>
        )}
      </div>

      <div className="hgadm-card">
        <div className="hgadm-toolbar">
          <label className="hgadm-window-field">
            <span className="hgadm-cell-sub">시작일</span>
            <Input
              type="date"
              aria-label="시작일"
              value={start}
              onChange={(e) => f.patch({ start: e.target.value || null })}
              style={{ width: 150 }}
            />
          </label>
          <label className="hgadm-window-field">
            <span className="hgadm-cell-sub">종료일</span>
            <Input
              type="date"
              aria-label="종료일"
              value={end}
              onChange={(e) => f.patch({ end: e.target.value || null })}
              style={{ width: 150 }}
            />
          </label>
          <Select
            aria-label="코호트 단위"
            value={granularity}
            onChange={(e) => f.patch({ granularity: e.target.value })}
            style={{ width: 120 }}
          >
            <option value="week">주 단위</option>
            <option value="month">월 단위</option>
          </Select>
        </div>

        {query.isLoading ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : !query.data || query.data.cohorts.length === 0 ? (
          <EmptyState title="대상 데이터 없음" desc="선택한 기간에 첫 학습을 시작한 학습자가 없습니다." />
        ) : (
          <>
            <div className="hgadm-cell-sub" style={{ marginBottom: 8 }}>
              정의: {query.data.definition} · 시간대 {query.data.timezone}
              {query.data.small_cell_suppression !== null
                ? ` · 표본 ${query.data.small_cell_suppression}명 미만인 칸은 비공개로 표시됩니다`
                : " · 표본 크기 비공개 처리 없음 (학습자 조회 권한)"}
            </div>
            <div className="hgadm-toolbar" aria-label="지표 정의">
              <MetricLabel metric="return_retention_d1" />
              <MetricLabel metric="return_retention_d7" />
              <MetricLabel metric="return_retention_d30" />
            </div>
            <DataTable columns={columns} rows={query.data.cohorts} rowKey={(c) => c.cohort} />
          </>
        )}
        <div className="hgadm-cell-sub" style={{ marginTop: 8 }}>
          기간 비교는 인과를 입증하지 않습니다. 코호트 구성과 학습 조건이 다를 수 있습니다.
        </div>
      </div>
    </div>
  );
}

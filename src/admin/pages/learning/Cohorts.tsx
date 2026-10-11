import { useMutation, useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { CalendarRange, Download } from "lucide-react";
import { learningApi } from "../../learningApi";
import type { CohortRow, Ratio } from "../../learningApi";
import { useUrlFilters } from "../../lib/urlFilters";
import { useAdminAuth } from "../../auth";
import { useToast, useToastError } from "../../../hooks/toast";
import { Button, DataTable, ErrorState, Input, LoadingState } from "../../components/kit";
import type { Column } from "../../components/kit";
import { EmptyHint, PageHero, Panel } from "../../components/insights";
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
      {notYet > 0 && <div className="hgadm-cell-sub">아직 날짜가 안 된 회원 {notYet.toLocaleString()}명</div>}
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
      // Named by date, not by the export's internal id.
      await downloadExport(created.export_id, `cohorts-${new Date().toISOString().slice(0, 10)}.csv`);
      return created;
    },
    onSuccess: (created) => toast.success(`CSV를 내보냈어요 (${created.row_count.toLocaleString()}행).`),
    onError: toastError,
  });

  const columns: Column<CohortRow>[] = [
    { key: "cohort", header: granularity === "month" ? "처음 학습한 달" : "처음 학습한 주", render: (c) => c.cohort },
    {
      key: "size",
      header: "회원 수",
      numeric: true,
      render: (c) =>
        c.size === null ? <span className="hgins-nodata" title="5명 미만은 개인을 특정할 수 없도록 숨겨요">숨김</span> : `${c.size.toLocaleString()}명`,
    },
    { key: "d1", header: "다음 날 재방문", render: (c) => <RetentionCell ratio={c.d1} notYet={c.d1_not_yet_eligible} /> },
    { key: "d7", header: "7일 뒤 재방문", render: (c) => <RetentionCell ratio={c.d7} notYet={c.d7_not_yet_eligible} /> },
    { key: "d30", header: "30일 뒤 재방문", render: (c) => <RetentionCell ratio={c.d30} notYet={c.d30_not_yet_eligible} /> },
  ];

  return (
    <div>
      <PageHero
        icon={CalendarRange}
        eyebrow="학습 인사이트"
        title="재방문 분석"
        description="처음 학습을 시작한 시기별로 회원을 묶어, 다음 날·7일 뒤·30일 뒤에도 다시 학습했는지 보여 줘요. 칸 색이 진할수록 다시 온 회원이 많아요. 아직 그날이 오지 않은 회원은 계산에서 빼요."
        actions={
          can("exports:create") ? (
            <Button variant="secondary" loading={exporter.isPending} onClick={() => exporter.mutate()}>
              <Download size={15} strokeWidth={2} aria-hidden />
              CSV 내보내기
            </Button>
          ) : undefined
        }
      />

      <Panel
        title="시작 시기별 재방문"
        description={
          query.data
            ? `${query.data.timezone} 기준${
                query.data.small_cell_suppression !== null
                  ? ` · 개인을 특정할 수 없도록 표본 ${query.data.small_cell_suppression}명 미만인 칸은 숨겨요`
                  : " · 학습자 조회 권한이 있어 작은 표본도 그대로 보여요"
              }`
            : undefined
        }
        actions={
          <div className="hgins-period" style={{ margin: 0 }}>
            <div className="hgins-seg" role="radiogroup" aria-label="묶는 단위">
              {(
                [
                  ["week", "주 단위"],
                  ["month", "월 단위"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={granularity === value}
                  className={`hgins-seg__btn${granularity === value ? " is-on" : ""}`}
                  onClick={() => f.patch({ granularity: value })}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="hgins-period__custom">
              <Input type="date" aria-label="시작일" value={start} onChange={(e) => f.patch({ start: e.target.value || null })} />
              <span aria-hidden>–</span>
              <Input type="date" aria-label="종료일" value={end} onChange={(e) => f.patch({ end: e.target.value || null })} />
            </div>
          </div>
        }
      >
        {query.isLoading ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : !query.data || query.data.cohorts.length === 0 ? (
          <EmptyHint title="이 기간에 처음 학습을 시작한 회원이 없어요">기간을 넓히거나 다른 기간을 선택해 보세요.</EmptyHint>
        ) : (
          <>
            <div className="hgadm-toolbar" aria-label="지표 설명">
              <MetricLabel metric="return_retention_d1" />
              <MetricLabel metric="return_retention_d7" />
              <MetricLabel metric="return_retention_d30" />
            </div>
            <DataTable columns={columns} rows={query.data.cohorts} rowKey={(c) => c.cohort} />
            <p className="hgins-cta__hint" style={{ marginTop: 10 }}>
              {query.data.definition}
            </p>
          </>
        )}
      </Panel>
      <p className="hgins-cta__hint">시기끼리 비교해도 원인까지 알 수는 없어요. 시기마다 회원 구성과 학습 조건이 다를 수 있어요.</p>
    </div>
  );
}

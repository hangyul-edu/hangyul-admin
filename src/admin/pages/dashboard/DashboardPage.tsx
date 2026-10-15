import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../../api";
import { errorMessage } from "../../../lib/http";
import { useAdminAuth } from "../../auth";
import { ErrorState, LoadingState } from "../../components/kit";
import { RecentActivity } from "./recent";
import { AlertList, DailyTrendCard, HeadlineStats, RevenueCard } from "./sections";

/**
 * The dashboard's reads, started together so the charts load alongside the
 * overview rather than after it. The overview refreshes each minute.
 */
function useDashboardData() {
  const overview = useQuery({
    queryKey: ["admin", "metrics", "overview"],
    queryFn: adminApi.metricsOverview,
    refetchInterval: 60_000,
  });
  const [metric, setMetric] = useState("signups");
  const series = useQuery({
    queryKey: ["admin", "metrics", "timeseries", metric],
    queryFn: () => adminApi.metricsTimeseries(metric, 30),
  });
  const [months, setMonths] = useState(12);
  const monthly = useQuery({
    queryKey: ["admin", "metrics", "monthly-revenue", months],
    queryFn: () => adminApi.metricsMonthlyRevenue(months),
  });
  return { overview, series, metric, setMetric, monthly, months, setMonths };
}

export function DashboardPage() {
  const { can } = useAdminAuth();
  const { overview, series, metric, setMetric, monthly, months, setMonths } = useDashboardData();

  if (overview.isPending) return <LoadingState label="지표를 불러오는 중…" />;
  if (overview.isError) return <ErrorState message={errorMessage(overview.error)} onRetry={() => void overview.refetch()} />;
  const data = overview.data;

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>대시보드</h1>
          <div className="hgadm-page-head__desc">
            주요 지표와 최근 활동을 한눈에 확인합니다. ‘오늘’·‘이번 달’ 등 모든 기간은 <strong>한국 시간(KST)</strong> 기준입니다.
          </div>
        </div>
      </div>
      <AlertList alerts={data.alerts ?? []} can={can} />
      <HeadlineStats data={data} can={can} />
      <RevenueCard revenue={data.revenue} query={monthly} months={months} onMonths={setMonths} can={can} />
      <DailyTrendCard query={series} metric={metric} onMetric={setMetric} />
      <RecentActivity data={data} can={can} />
    </div>
  );
}

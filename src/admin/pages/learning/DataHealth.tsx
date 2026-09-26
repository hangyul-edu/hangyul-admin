import { useQuery } from "@tanstack/react-query";
import { learningApi } from "../../learningApi";
import type { DataHealth } from "../../learningApi";
import { Badge, DataTable, ErrorState, LoadingState, Stat } from "../../components/kit";
import type { Column } from "../../components/kit";
import { formatDateTime } from "../../lib/format";
import { errorMessage } from "../../../lib/http";

const STALE_MS = 15 * 60 * 1000;

type Consumer = DataHealth["consumers"][number];
type Run = DataHealth["recent_runs"][number];

function consumerProblems(c: Consumer, now: number): string[] {
  const out: string[] = [];
  if (c.lag_events > 0) out.push(`미처리 이벤트 ${c.lag_events.toLocaleString()}건`);
  if (!c.last_success_at || now - new Date(c.last_success_at).getTime() > STALE_MS) out.push("15분 넘게 갱신 안 됨");
  if (c.error_count > 0) out.push(`오류 ${c.error_count.toLocaleString()}회`);
  return out;
}

/** Everything that makes the figures untrustworthy right now, in plain words. */
export function healthProblems(d: DataHealth, now: number = Date.now()): string[] {
  const problems: string[] = [];
  for (const c of d.consumers) {
    const p = consumerProblems(c, now);
    if (p.length) problems.push(`${c.consumer}: ${p.join(", ")}`);
  }
  if (d.failed_runs_24h > 0) problems.push(`최근 24시간 실패한 작업 ${d.failed_runs_24h.toLocaleString()}건`);
  const discrepant = d.recent_runs.filter((r) => r.discrepancies.length > 0).length;
  if (discrepant > 0) problems.push(`불일치가 발견된 점검 ${discrepant.toLocaleString()}건`);
  if (d.pending_erasures > 0) problems.push(`처리 대기 중인 삭제 요청 ${d.pending_erasures.toLocaleString()}건`);
  return problems;
}

export function DataHealthPage() {
  const query = useQuery({
    queryKey: ["admin", "learning", "data-health"],
    queryFn: learningApi.dataHealth,
    refetchInterval: 60_000,
  });

  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  const d = query.data!;
  const now = Date.now();
  const problems = healthProblems(d, now);

  const consumerColumns: Column<Consumer>[] = [
    { key: "consumer", header: "집계", render: (c) => <span className="hgadm-cell-mono">{c.consumer}</span> },
    {
      key: "state",
      header: "상태",
      render: (c) => {
        const p = consumerProblems(c, now);
        return p.length ? <Badge tone="warning">{p.join(", ")}</Badge> : <Badge tone="success">정상</Badge>;
      },
    },
    { key: "lag", header: "미처리", numeric: true, render: (c) => c.lag_events.toLocaleString() },
    { key: "last", header: "마지막 성공", render: (c) => (c.last_success_at ? formatDateTime(c.last_success_at) : "없음") },
    { key: "processed", header: "처리", numeric: true, render: (c) => c.events_processed.toLocaleString() },
    { key: "dups", header: "중복 차단", numeric: true, render: (c) => c.duplicates_suppressed.toLocaleString() },
    { key: "error", header: "마지막 오류", render: (c) => c.last_error ?? "—" },
  ];

  const runColumns: Column<Run>[] = [
    { key: "started", header: "시작", render: (r) => formatDateTime(r.started_at) },
    { key: "job", header: "작업", render: (r) => <span className="hgadm-cell-mono">{r.job}</span> },
    { key: "kind", header: "유형", render: (r) => r.kind },
    {
      key: "status",
      header: "상태",
      render: (r) => (
        <Badge tone={r.status === "succeeded" ? "success" : r.status === "failed" ? "danger" : "info"}>
          {r.status === "succeeded" ? "성공" : r.status === "failed" ? "실패" : "진행 중"}
        </Badge>
      ),
    },
    { key: "dry", header: "모의 실행", render: (r) => (r.dry_run ? "예" : "아니오") },
    { key: "processed", header: "처리", numeric: true, render: (r) => r.processed.toLocaleString() },
    { key: "watermark", header: "워터마크", numeric: true, render: (r) => r.watermark_seq ?? "—" },
    {
      key: "discrepancies",
      header: "불일치",
      render: (r) =>
        r.discrepancies.length ? (
          <span>
            <Badge tone="danger">불일치</Badge> <span className="hgadm-cell-mono">{JSON.stringify(r.discrepancies)}</span>
          </span>
        ) : (
          "—"
        ),
    },
    { key: "error", header: "오류", render: (r) => r.error ?? "—" },
  ];

  const i = d.ingestion;
  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>데이터 상태</h1>
          <div className="hgadm-page-head__desc">
            학습 지표의 원천인 이벤트 수집과 집계 작업 상태입니다. 여기에 문제가 있으면 다른 화면의 수치를 판단에 쓰기 전에 먼저 확인하세요. 1분마다 갱신됩니다.
          </div>
        </div>
      </div>

      <div className="hgadm-card" role="status">
        {problems.length === 0 ? (
          <div>
            <Badge tone="success">정상</Badge> 모든 집계가 정상입니다.
          </div>
        ) : (
          <div>
            <Badge tone="warning">확인 필요</Badge>
            <ul>
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="hgadm-cell-sub">기준 시각 {formatDateTime(d.generated_at)}</div>
      </div>

      <div className="hgadm-stats">
        <Stat label="최근 24시간 이벤트" value={i.events_24h.toLocaleString()} />
        <Stat label="앱에서 보낸 이벤트 (24시간)" value={i.client_events_24h.toLocaleString()} />
        <Stat label="시계 오차로 보정된 이벤트 (24시간)" value={i.clock_skew_clamped_24h.toLocaleString()} />
        <Stat label="테스트용 합성 이벤트 (지표 제외)" value={i.synthetic_events_total.toLocaleString()} />
        <Stat label="마지막 수신" value={<span style={{ fontSize: 15 }}>{i.last_received_at ? formatDateTime(i.last_received_at) : "없음"}</span>} />
        <Stat label="실패한 작업 (24시간)" value={d.failed_runs_24h.toLocaleString()} />
        <Stat label="처리 대기 삭제 요청" value={d.pending_erasures.toLocaleString()} />
      </div>

      <div className="hgadm-card">
        <h3>집계(프로젝션)</h3>
        <DataTable columns={consumerColumns} rows={d.consumers} rowKey={(c) => c.consumer} empty="아직 실행된 집계가 없습니다." />
      </div>

      <div className="hgadm-card">
        <h3>최근 작업 (50건)</h3>
        <DataTable columns={runColumns} rows={d.recent_runs} rowKey={(r) => r.run_id} empty="실행 기록이 없습니다." />
      </div>
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { learningApi } from "../../learningApi";
import type { DataHealth } from "../../learningApi";
import { Activity, AlertTriangle, CheckCircle2, Clock3, FlaskConical, Radio } from "lucide-react";
import { Badge, DataTable, ErrorState, LoadingState } from "../../components/kit";
import { KpiCard, KpiRow, Notice, PageHero, Panel } from "../../components/insights";
import type { Column } from "../../components/kit";
import { formatDateTime } from "../../lib/format";
import { errorMessage } from "../../../lib/http";

const STALE_MS = 15 * 60 * 1000;

type Consumer = DataHealth["consumers"][number];
type Run = DataHealth["recent_runs"][number];

function consumerProblems(c: Consumer, now: number): string[] {
  const out: string[] = [];
  if (c.lag_events > 0) out.push(`밀린 이벤트 ${c.lag_events.toLocaleString()}건`);
  if (!c.last_success_at || now - new Date(c.last_success_at).getTime() > STALE_MS) out.push("15분 넘게 갱신 안 됨");
  if (c.error_count > 0) out.push(`오류 ${c.error_count.toLocaleString()}회`);
  return out;
}

/** Everything that makes the figures untrustworthy right now, in plain words. */
function healthProblems(d: DataHealth, now: number = Date.now()): string[] {
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

  const hero = (
    <PageHero
      icon={Activity}
      eyebrow="학습 인사이트 · 기준·데이터 상태"
      title="데이터 집계 상태"
      description="학습 인사이트의 모든 수치는 앱이 보낸 학습 이벤트를 모아 계산해요. 여기에 문제가 있으면 다른 화면의 수치를 쓰기 전에 먼저 확인하세요."
    />
  );
  if (query.isLoading)
    return (
      <div>
        {hero}
        <LoadingState />
      </div>
    );
  if (query.isError)
    return (
      <div>
        {hero}
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </div>
    );
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
        return p.length ? <Badge tone="danger">{p.join(", ")}</Badge> : <Badge tone="success" dot>정상</Badge>;
      },
    },
    { key: "lag", header: "밀린 이벤트", numeric: true, render: (c) => c.lag_events.toLocaleString() },
    { key: "last", header: "마지막 성공", render: (c) => (c.last_success_at ? formatDateTime(c.last_success_at) : "없음") },
    { key: "processed", header: "처리한 이벤트", numeric: true, render: (c) => c.events_processed.toLocaleString() },
    { key: "dups", header: "걸러 낸 중복", numeric: true, render: (c) => c.duplicates_suppressed.toLocaleString() },
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
      {hero}

      {problems.length === 0 ? (
        <Notice tone="success" icon={CheckCircle2} title="모든 집계가 정상이에요">
          학습 인사이트의 수치를 믿고 써도 돼요. 기준 시각 {formatDateTime(d.generated_at)} · 1분마다 다시 확인해요.
        </Notice>
      ) : (
        <Notice tone="danger" icon={AlertTriangle} title="확인이 필요해요">
          아래 문제가 풀릴 때까지 다른 화면의 수치는 늦거나 틀릴 수 있어요.
          <ul className="hgins-list">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <span className="hgins-cta__hint">기준 시각 {formatDateTime(d.generated_at)}</span>
        </Notice>
      )}

      <KpiRow>
        <KpiCard icon={Radio} label="받은 학습 이벤트 (24시간)" value={i.events_24h.toLocaleString()} sub={`그중 앱에서 보낸 것 ${i.client_events_24h.toLocaleString()}`} />
        <KpiCard
          icon={Clock3}
          label="마지막으로 받은 시각"
          value={<span className="hgadm-text-lg">{i.last_received_at ? formatDateTime(i.last_received_at) : "없음"}</span>}
          sub={`기기 시계 오차로 보정 ${i.clock_skew_clamped_24h.toLocaleString()}건`}
        />
        <KpiCard
          icon={AlertTriangle}
          label="실패한 집계 작업 (24시간)"
          value={d.failed_runs_24h.toLocaleString()}
          sub={`처리 대기 중인 삭제 요청 ${d.pending_erasures.toLocaleString()}건`}
        />
        <KpiCard icon={FlaskConical} label="테스트용 합성 이벤트" value={i.synthetic_events_total.toLocaleString()} sub="지표 계산에서 빠져요" />
      </KpiRow>

      <Panel title="집계 상태" description="이벤트를 지표로 바꾸는 집계 작업마다 밀린 양과 마지막 성공 시각이에요.">
        <DataTable columns={consumerColumns} rows={d.consumers} rowKey={(c) => c.consumer} empty="아직 실행된 집계가 없어요." />
        <details className="hgins-more">
          <summary>최근 작업 기록 50건 (개발자용)</summary>
          <div className="hgins-more__body">
            <DataTable columns={runColumns} rows={d.recent_runs} rowKey={(r) => r.run_id} empty="실행 기록이 없어요." />
          </div>
        </details>
      </Panel>
    </div>
  );
}

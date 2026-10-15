import { useState } from "react";
import { Lock } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { adminApi } from "../api";
import type { AdminDeadWebhook, AdminStuckOutboxEvent } from "../api";
import { proficiencyAdminApi } from "../proficiencyApi";
import type { ScoringQueueItem } from "../proficiencyApi";
import { ApiError, errorMessage } from "../../lib/http";
import { useToast } from "../../hooks/toast";
import { useAdminAuth } from "../auth";
import { Badge, Button, ConfirmDialog, DataTable, EmptyState, ErrorState, LoadingState, Timestamp } from "../components/kit";
import type { Column } from "../components/kit";

/**
 * 운영 대기열: the background queues the dashboard alerts on, each tab holding
 * exactly the rows its alert counts. The alerts used to open 결제·청구서,
 * which shows none of them.
 */
const TABS = [
  { key: "webhooks", label: "결제 웹훅 (DLQ)", scope: "commerce:read" },
  { key: "outbox", label: "아웃박스 전송 지연", scope: "commerce:read" },
  { key: "scoring", label: "말하기 채점", scope: "learners:read" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** A long error kept to one line; the whole text is in the tooltip. */
function ErrorText({ text }: { text: string | null }) {
  if (!text) return <span className="hgadm-muted">—</span>;
  return (
    <span className="hgadm-ops-error" title={text}>
      {text}
    </span>
  );
}

function QueueTotal({ shown, total, unit }: { shown: number; total: number; unit: string }) {
  return (
    <div className="hgadm-cell-sub hgadm-mb-8">
      {total.toLocaleString()}
      {unit}
      {total > shown ? ` 중 ${shown.toLocaleString()}건 표시` : ""}
    </div>
  );
}

const WEBHOOK_COLUMNS: Column<AdminDeadWebhook>[] = [
  { key: "dlq_at", header: "DLQ 이동", render: (r) => <Timestamp at={r.dlq_at} />, width: 120 },
  { key: "type", header: "이벤트", render: (r) => <div><div>{r.event_type}</div><div className="hgadm-cell-sub">{r.provider} · {r.event_id}</div></div> },
  { key: "received_at", header: "수신", render: (r) => <Timestamp at={r.received_at} />, width: 120 },
  { key: "attempts", header: "시도", render: (r) => `${r.attempts}회`, numeric: true, width: 64 },
  { key: "error", header: "마지막 오류", render: (r) => <ErrorText text={r.processing_error} /> },
];

function WebhooksTab() {
  const query = useQuery({ queryKey: ["admin", "operations", "webhooks"], queryFn: adminApi.deadWebhooks });
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  return (
    <>
      <p className="hgadm-cell-sub">
        처리를 여러 번 시도했지만 모두 실패해 자동 처리 대상에서 빠진 결제사 웹훅입니다. 오류 원인을 해결한 뒤 결제사
        콘솔에서 이벤트를 다시 보내거나 개발팀에 재처리를 요청하세요.
      </p>
      <QueueTotal shown={query.data.items.length} total={query.data.total} unit="건이 DLQ에 있습니다" />
      <DataTable
        columns={WEBHOOK_COLUMNS}
        rows={query.data.items}
        rowKey={(r) => r.event_id}
        empty={<EmptyState title="DLQ에 쌓인 웹훅이 없습니다" />}
      />
    </>
  );
}

const OUTBOX_COLUMNS: Column<AdminStuckOutboxEvent>[] = [
  { key: "created_at", header: "생성", render: (r) => <Timestamp at={r.created_at} />, width: 120 },
  { key: "type", header: "이벤트", render: (r) => <div><div>{r.event_type}</div><div className="hgadm-cell-sub">{r.aggregate_type} · {r.aggregate_id}</div></div> },
  { key: "attempts", header: "전송 시도", render: (r) => `${r.attempts}회`, numeric: true, width: 80 },
  { key: "error", header: "마지막 오류", render: (r) => <ErrorText text={r.last_error} /> },
];

function OutboxTab() {
  const query = useQuery({ queryKey: ["admin", "operations", "outbox"], queryFn: adminApi.stuckOutbox });
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  return (
    <>
      <p className="hgadm-cell-sub">
        생성된 지 10분이 지나도록 전송되지 않은 아웃박스 이벤트입니다(오래된 순). 전송 작업은 계속 다시 시도하므로,
        같은 오류가 반복되면 오류 내용을 개발팀에 전달하세요.
      </p>
      <QueueTotal shown={query.data.items.length} total={query.data.total} unit="건이 전송 대기 중입니다" />
      <DataTable
        columns={OUTBOX_COLUMNS}
        rows={query.data.items}
        rowKey={(r) => r.event_id}
        empty={<EmptyState title="전송이 지연된 이벤트가 없습니다" />}
      />
    </>
  );
}

function ScoringTab() {
  const { can } = useAdminAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState<ScoringQueueItem | null>(null);
  const query = useQuery({ queryKey: ["admin", "operations", "scoring"], queryFn: proficiencyAdminApi.scoringQueue });
  const retry = useMutation({
    mutationFn: (attemptId: string) => proficiencyAdminApi.retryScoring(attemptId),
    onSuccess: () => toast.success("채점 대기열에 다시 넣었습니다. 다음 채점 작업(5분 간격)에서 처리됩니다."),
    onError: (error) =>
      toast.error(
        error instanceof ApiError && error.code === "proficiency.not_pending"
          ? "이미 채점이 끝난 과제입니다. 목록을 새로 고칩니다."
          : errorMessage(error),
      ),
    onSettled: () => {
      setConfirming(null);
      void qc.invalidateQueries({ queryKey: ["admin", "operations", "scoring"] });
      void qc.invalidateQueries({ queryKey: ["admin", "metrics", "overview"] });
    },
  });

  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  const { items, total, exhausted, max_attempts } = query.data;

  const columns: Column<ScoringQueueItem>[] = [
    {
      key: "state",
      header: "상태",
      render: (r) => (r.exhausted ? <Badge tone="danger">재시도 소진</Badge> : <Badge tone="warning">자동 재시도 대기</Badge>),
      width: 120,
    },
    {
      key: "learner",
      header: "학습자",
      render: (r) => (
        <Link to={`/learning/proficiency/${r.user_id}`}>
          <div>{r.nickname ?? "(이름 없는 계정)"}</div>
          {r.email && <div className="hgadm-cell-sub">{r.email}</div>}
        </Link>
      ),
    },
    { key: "family", header: "과제", render: (r) => r.family_id },
    { key: "submitted", header: "제출", render: (r) => <Timestamp at={r.submitted_at} />, width: 120 },
    { key: "attempts", header: "시도", render: (r) => `${r.attempts}/${max_attempts}`, numeric: true, width: 64 },
    { key: "next", header: "다음 시도", render: (r) => (r.exhausted ? "—" : <Timestamp at={r.next_scoring_at} />), width: 120 },
    { key: "failure", header: "마지막 실패", render: (r) => <ErrorText text={r.failure} /> },
  ];
  if (can("ops:write")) {
    columns.push({
      key: "action",
      header: "",
      width: 110,
      render: (r) =>
        r.exhausted ? (
          <Button size="sm" variant="secondary" onClick={() => setConfirming(r)}>
            다시 채점
          </Button>
        ) : null,
    });
  }

  return (
    <>
      <p className="hgadm-cell-sub">
        채점이 끝나지 않은 말하기 과제입니다. 실패한 과제는 점점 긴 간격으로 최대 {max_attempts}번까지 자동으로 다시
        채점하며, 그동안 다른 과제의 채점을 막지 않습니다. 모두 실패한 과제(재시도 소진)는 자동 대기열에서 빠져 여기에
        남습니다. 원인을 해결한 뒤 ‘다시 채점’을 누르세요. 이미 채점된 과제는 다시 채점되거나 보상이 중복 지급되지
        않습니다.
      </p>
      <QueueTotal shown={items.length} total={total} unit={`건 대기 중 · 재시도 소진 ${exhausted.toLocaleString()}건`} />
      <DataTable
        columns={columns}
        rows={items}
        rowKey={(r) => r.attempt_id}
        empty={<EmptyState title="채점을 기다리는 과제가 없습니다" />}
      />
      <ConfirmDialog
        open={confirming !== null}
        title="이 과제를 다시 채점할까요?"
        message={`${confirming?.nickname ?? "이 학습자"}의 과제를 자동 채점 대기열 맨 앞에 다시 넣고, 자동 재시도 횟수를 처음부터 다시 셉니다.`}
        confirmLabel="다시 채점"
        loading={retry.isPending}
        onConfirm={() => confirming && retry.mutate(confirming.attempt_id)}
        onCancel={() => setConfirming(null)}
      />
    </>
  );
}

export function OperationsPage() {
  const { can } = useAdminAuth();
  const [params, setParams] = useSearchParams();
  const tabs = TABS.filter((t) => can(t.scope));
  if (tabs.length === 0) {
    return (
      <EmptyState
        icon={<Lock size={28} strokeWidth={1.75} />}
        title="접근 권한이 없습니다"
        desc="이 화면을 보려면 'commerce:read' 또는 'learners:read' 권한이 필요합니다. 필요한 경우 최고 관리자에게 요청하세요."
      />
    );
  }
  const requested = params.get("tab");
  const tab: TabKey = tabs.find((t) => t.key === requested)?.key ?? tabs[0].key;
  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>운영 대기열</h1>
          <div className="hgadm-page-head__desc">
            자동으로 처리되지 못하고 멈춘 작업입니다. 대시보드 알림의 건수는 각 탭의 전체 건수와 같습니다.
          </div>
        </div>
      </div>
      <div className="hgadm-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`hgadm-tab ${tab === t.key ? "active" : ""}`}
            onClick={() => setParams({ tab: t.key }, { replace: true })}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "webhooks" ? <WebhooksTab /> : tab === "outbox" ? <OutboxTab /> : <ScoringTab />}
    </div>
  );
}

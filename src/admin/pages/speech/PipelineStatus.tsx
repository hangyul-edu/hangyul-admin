import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { speechApi } from "../../speechApi";
import type { AgentWorker, SpeechStatus } from "../../speechApi";
import { Badge, Card, DataTable, Dl, ErrorState, LoadingState, Stat, Timestamp } from "../../components/kit";
import type { Column } from "../../components/kit";
import { Notice } from "../../components/insights";
import { formatDateTime } from "../../lib/format";
import { errorMessage } from "../../../lib/http";
import { MOCK_WARNING, formatMs, providerLabel, reasonText } from "./labels";

export const STATUS_KEY = ["admin", "speech", "status"];

function yesNo(value: boolean | null | undefined, yes = "예", no = "아니요") {
  if (value === null || value === undefined) return <span className="hgadm-muted">—</span>;
  return <Badge tone={value ? "success" : "danger"} dot>{value ? yes : no}</Badge>;
}

const WORKER_COLUMNS: Column<AgentWorker>[] = [
  { key: "id", header: "워커", render: (w) => <span className="hgadm-cell-mono">{w.worker_id}</span> },
  { key: "host", header: "호스트", render: (w) => w.hostname ?? "—" },
  {
    key: "model",
    header: "인식기 · 모델",
    render: (w) => (
      <span>
        {providerLabel(w.provider)} {w.model && <span className="hgadm-cell-mono">{w.model}</span>}
      </span>
    ),
  },
  { key: "loaded", header: "모델 로드", render: (w) => yesNo(w.model_loaded, "완료", "대기") },
  { key: "rooms", header: "방", numeric: true, render: (w) => w.rooms_active },
  { key: "version", header: "버전", render: (w) => w.version ?? "—" },
  { key: "seen", header: "마지막 응답", render: (w) => <Timestamp at={w.last_seen_at} /> },
];

function SttCard({ stt }: { stt: SpeechStatus["stt"] }) {
  const reason = reasonText(stt.reason);
  const whisper = stt.provider === "whisper_local";
  const items: [ReactNode, ReactNode][] = [
    [
      "활성 인식기",
      <span key="p" className="hgadm-row hgadm-row--wrap">
        <Badge tone={stt.provider === "mock" ? "danger" : "success"} dot>{providerLabel(stt.provider)}</Badge>
        {stt.is_fallback && <Badge tone="warning">대체 인식기</Badge>}
      </span>,
    ],
    ["모델", stt.model ? <span className="hgadm-cell-mono">{stt.model}</span> : "—"],
    ["요청된 설정", <span key="r" className="hgadm-cell-mono">{stt.requested}</span>],
    [
      "선택 이유",
      <span key="why" className={reason.warn ? "hgadm-speech__warn-text" : undefined}>
        {reason.warn && <AlertTriangle size={14} strokeWidth={2} aria-hidden />} {reason.text}
      </span>,
    ],
  ];
  if (whisper) {
    items.push(
      ["모델 로드", yesNo(stt.loaded, "완료", "아직")],
      ["장치 · 연산", `${stt.device ?? "—"} · ${stt.compute_type ?? "—"}`],
      ["로드 시간", stt.load_seconds != null ? `${stt.load_seconds.toFixed(1)}초` : "—"],
      ["빔 · 동시 처리", `${stt.beam_size ?? "—"} · ${stt.max_concurrency ?? "—"}`],
    );
    if (stt.load_error) items.push(["로드 오류", <span key="e" className="hgadm-text-danger">{stt.load_error}</span>]);
  }
  return (
    <Card title="음성 인식기 (STT)">
      {stt.provider === "mock" && (
        <div className="hgadm-mb-12">
          <Notice tone="danger" icon={AlertTriangle} title={MOCK_WARNING}>
            인식 결과는 고정된 예시 문장입니다. 실제 인식을 확인하려면 Whisper 또는 Google Cloud STT를 설정하세요.
          </Notice>
        </div>
      )}
      <Dl items={items} />
    </Card>
  );
}

function LiveKitCard({ livekit, agent }: { livekit: SpeechStatus["livekit"]; agent: SpeechStatus["agent"] }) {
  return (
    <Card title="LiveKit · STT 에이전트">
      <Dl
        items={[
          ["LiveKit 설정", yesNo(livekit.configured, "설정됨", "미설정")],
          ["서버 주소", livekit.url ? <span className="hgadm-cell-mono">{livekit.url}</span> : "—"],
          ["연결", livekit.configured ? yesNo(livekit.reachable, "연결 가능", "연결 불가") : "—"],
          ["응답 시간", formatMs(livekit.latency_ms)],
          ["열린 방", livekit.rooms ?? "—"],
          ["에이전트", yesNo(agent.online, "온라인", "오프라인")],
          ["에이전트 공유 키", yesNo(agent.shared_secret_configured, "설정됨", "미설정")],
          ...(livekit.error
            ? ([["오류", <span key="e" className="hgadm-text-danger">{livekit.error}</span>]] as [ReactNode, ReactNode][])
            : []),
        ]}
      />
    </Card>
  );
}

export function PipelineStatus() {
  const query = useQuery({ queryKey: STATUS_KEY, queryFn: speechApi.status, refetchInterval: 15_000 });

  if (query.isPending) return <LoadingState label="파이프라인 상태를 불러오는 중…" />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  const d = query.data;
  const recent = d.recent;

  return (
    <section className="hgadm-speech__section" aria-labelledby="speech-status-title">
      <div className="hgadm-speech__section-head">
        <h2 id="speech-status-title">파이프라인 상태</h2>
        <span className="hgadm-muted hgadm-text-xs">
          15초마다 갱신 · 확인 시각 {formatDateTime(d.checked_at)}
        </span>
      </div>
      {!d.livekit.configured || !d.livekit.reachable ? (
        <div className="hgadm-mb-12">
          <Notice tone="warn" icon={AlertTriangle} title="실시간 음성 서버를 쓸 수 없습니다">
            {d.livekit.configured
              ? "LiveKit 서버가 응답하지 않습니다. 실시간 마이크 테스트 대신 녹음 업로드 테스트를 사용하세요."
              : "LiveKit이 설정되지 않았습니다. 연동·환경 설정에서 LiveKit을 설정하거나 녹음 업로드 테스트를 사용하세요."}
          </Notice>
        </div>
      ) : !d.agent.online ? (
        <div className="hgadm-mb-12">
          <Notice tone="warn" icon={AlertTriangle} title="STT 에이전트가 오프라인입니다">
            방에 들어와 인식을 수행할 에이전트가 없습니다. 에이전트 프로세스가 실행 중인지 확인하세요.
          </Notice>
        </div>
      ) : null}
      <div className="hgadm-speech__grid">
        <SttCard stt={d.stt} />
        <LiveKitCard livekit={d.livekit} agent={d.agent} />
      </div>
      <h3 className="hgadm-speech__subhead">최근 {recent.window_minutes}분</h3>
      <div className="hgadm-stats hgadm-speech__stats">
        <Stat label="인식 결과" value={recent.transcripts.toLocaleString()} />
        <Stat label="인식됨" value={recent.recognised.toLocaleString()} />
        <Stat label="음성 없음" value={recent.no_speech.toLocaleString()} />
        <Stat
          label="실패"
          value={recent.failed.toLocaleString()}
          sub={recent.failed > 0 ? "확인 필요" : undefined}
          subTone={recent.failed > 0 ? "down" : undefined}
        />
        <Stat label="평균 인식 시간" value={formatMs(recent.avg_latency_ms)} />
        <Stat label="마지막 인식" value={<Timestamp at={recent.last_transcript_at} />} />
      </div>
      {recent.last_error && (
        <p className="hgadm-text-danger hgadm-text-sm hgadm-mt-0">
          <strong>마지막 오류:</strong> {recent.last_error}
        </p>
      )}
      <Card title={`에이전트 워커 (${d.agent.workers.length})`} flush>
        <DataTable
          columns={WORKER_COLUMNS}
          rows={d.agent.workers}
          rowKey={(w) => w.worker_id}
          empty="등록된 워커가 없습니다. 에이전트가 API에 하트비트를 보내는지 확인하세요."
        />
      </Card>
      <p className="hgadm-muted hgadm-text-xs hgadm-mt-8">
        발음 평가: {d.pronunciation.provider} {d.pronunciation.azure_configured ? "(Azure 설정됨)" : "(Azure 미설정)"}
      </p>
    </section>
  );
}

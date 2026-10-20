import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { speechApi } from "../../speechApi";
import type { AgentWorker, SpeechStatus } from "../../speechApi";
import { Badge, Card, ErrorState, LoadingState, Timestamp } from "../../components/kit";
import type { BadgeTone } from "../../components/kit";
import { Notice } from "../../components/insights";
import { formatDateTime } from "../../lib/format";
import { errorMessage } from "../../../lib/http";
import { Facts } from "./Facts";
import { MOCK_WARNING, formatMs, providerLabel, reasonText } from "./labels";

export const STATUS_KEY = ["admin", "speech", "status"];

type Tone = "success" | "warning" | "danger" | "neutral";

/** One component of the pipeline: a title, its state as a badge, the main
 * fact in large type and the details that go with it on one wrapping line. */
function Tile({
  title,
  tone = "neutral",
  badge,
  main,
  note,
  children,
}: {
  title: string;
  tone?: Tone;
  badge: ReactNode;
  main?: ReactNode;
  note?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`hgadm-speech__tile hgadm-speech__tile--${tone}`}>
      <div className="hgadm-speech__tile-head">
        <span className="hgadm-speech__tile-title">{title}</span>
        {badge}
      </div>
      {main && <div className="hgadm-speech__tile-main">{main}</div>}
      {note && <div className="hgadm-speech__tile-note">{note}</div>}
      {children}
    </div>
  );
}

function SttTile({ stt }: { stt: SpeechStatus["stt"] }) {
  const reason = reasonText(stt.reason);
  const mock = stt.provider === "mock";
  const whisper = stt.provider === "whisper_local";
  const tone: Tone = mock ? "danger" : stt.is_fallback || reason.warn || stt.load_error ? "warning" : "success";
  const badge = mock ? (
    <Badge tone="danger" dot>모의</Badge>
  ) : stt.is_fallback ? (
    <Badge tone="warning" dot>대체 인식기</Badge>
  ) : (
    <Badge tone="success" dot>사용 중</Badge>
  );
  return (
    <Tile
      title="음성 인식기"
      tone={tone}
      badge={badge}
      main={
        <>
          {providerLabel(stt.provider)}
          {stt.model && <span className="hgadm-cell-mono">{stt.model}</span>}
        </>
      }
      note={
        <span className={reason.warn ? "hgadm-speech__warn-text" : undefined}>
          {reason.warn && <AlertTriangle size={14} strokeWidth={2} aria-hidden />} {reason.text}
        </span>
      }
    >
      {whisper && (
        <Facts
          items={[
            ["모델 로드", <Badge key="l" tone={stt.loaded ? "success" : "warning"}>{stt.loaded ? "완료" : "아직"}</Badge>],
            ["장치", `${stt.device ?? "—"} · ${stt.compute_type ?? "—"}`],
            stt.load_seconds != null && ["로드 시간", `${stt.load_seconds.toFixed(1)}초`],
            ["빔 · 동시 처리", `${stt.beam_size ?? "—"} · ${stt.max_concurrency ?? "—"}`],
          ]}
        />
      )}
      {stt.load_error && <div className="hgadm-text-danger hgadm-text-xs">모델 로드 오류: {stt.load_error}</div>}
    </Tile>
  );
}

function LiveKitTile({ livekit }: { livekit: SpeechStatus["livekit"] }) {
  const state: { tone: Tone; label: string } = !livekit.configured
    ? { tone: "neutral", label: "미설정" }
    : livekit.reachable
      ? { tone: "success", label: "연결 가능" }
      : { tone: "danger", label: "연결 불가" };
  return (
    <Tile
      title="실시간 음성 서버 (LiveKit)"
      tone={state.tone}
      badge={<Badge tone={state.tone as BadgeTone} dot>{state.label}</Badge>}
      main={livekit.url ? <span className="hgadm-cell-mono hgadm-speech__tile-mono">{livekit.url}</span> : "서버 주소 없음"}
      note={!livekit.configured ? "연동·환경 설정에서 LiveKit 서버 주소와 키를 설정하세요." : undefined}
    >
      {livekit.configured && (
        <Facts items={[["응답 시간", formatMs(livekit.latency_ms)], ["열린 방", livekit.rooms ?? "—"]]} />
      )}
      {livekit.error && <div className="hgadm-text-danger hgadm-text-xs">{livekit.error}</div>}
    </Tile>
  );
}

function WorkerLine({ worker }: { worker: AgentWorker }) {
  return (
    <li>
      <strong>{worker.hostname ?? worker.worker_id}</strong>
      <span>
        {providerLabel(worker.provider)} {worker.model && <span className="hgadm-cell-mono">{worker.model}</span>}
      </span>
      <Badge tone={worker.model_loaded ? "success" : "warning"}>{worker.model_loaded ? "모델 로드 완료" : "모델 로드 대기"}</Badge>
      <span className="hgadm-muted">방 {worker.rooms_active}개</span>
      {worker.version && <span className="hgadm-muted">v{worker.version}</span>}
      <span className="hgadm-muted">
        마지막 응답 <Timestamp at={worker.last_seen_at} />
      </span>
    </li>
  );
}

function AgentTile({ agent }: { agent: SpeechStatus["agent"] }) {
  const tone: Tone = !agent.online ? "danger" : agent.shared_secret_configured ? "success" : "warning";
  return (
    <Tile
      title="STT 에이전트"
      tone={tone}
      badge={<Badge tone={agent.online ? "success" : "danger"} dot>{agent.online ? "온라인" : "오프라인"}</Badge>}
      main={agent.workers.length > 0 ? `워커 ${agent.workers.length}개` : "연결된 워커 없음"}
      note={
        !agent.shared_secret_configured ? (
          <span className="hgadm-speech__warn-text">
            <AlertTriangle size={14} strokeWidth={2} aria-hidden /> 에이전트 공유 키가 설정되지 않아 인식 결과를 저장할 수 없습니다.
          </span>
        ) : !agent.online ? (
          "에이전트 프로세스가 API에 하트비트를 보내는지 확인하세요."
        ) : undefined
      }
    >
      {agent.workers.length > 0 && (
        <ul className="hgadm-speech__workers">
          {agent.workers.map((w) => (
            <WorkerLine key={w.worker_id} worker={w} />
          ))}
        </ul>
      )}
    </Tile>
  );
}

const PRONUNCIATION_TEXT: Record<string, string> = { azure: "Azure 발음 평가", mock: "모의 평가" };

function PronunciationTile({ pronunciation }: { pronunciation: SpeechStatus["pronunciation"] }) {
  const configured = pronunciation.azure_configured;
  return (
    <Tile
      title="발음 평가"
      tone={configured ? "success" : "neutral"}
      badge={<Badge tone={configured ? "success" : "neutral"} dot>{configured ? "Azure 설정됨" : "Azure 미설정"}</Badge>}
      main={PRONUNCIATION_TEXT[pronunciation.provider] ?? pronunciation.provider}
      note={configured ? "읽기 채점의 발음 점수에 Azure 결과를 사용합니다." : "Azure 키가 없어 발음 점수는 계산되지 않습니다."}
    />
  );
}

function Metric({ label, value, tone }: { label: string; value: ReactNode; tone?: "danger" }) {
  return (
    <div className="hgadm-speech__metric">
      <div className="hgadm-speech__metric-label">{label}</div>
      <div className={`hgadm-speech__metric-value ${tone ? `hgadm-speech__metric-value--${tone}` : ""}`.trim()}>{value}</div>
    </div>
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
      {d.stt.provider === "mock" && (
        <Notice tone="danger" icon={AlertTriangle} title={MOCK_WARNING}>
          인식 결과는 고정된 예시 문장입니다. 실제 인식을 확인하려면 Whisper 또는 Google Cloud STT를 설정하세요.
        </Notice>
      )}
      {!d.livekit.configured || !d.livekit.reachable ? (
        <Notice tone="warn" icon={AlertTriangle} title="실시간 음성 서버를 쓸 수 없습니다">
          {d.livekit.configured
            ? "LiveKit 서버가 응답하지 않습니다. 실시간 마이크 테스트 대신 녹음 업로드 테스트를 사용하세요."
            : "LiveKit이 설정되지 않았습니다. 연동·환경 설정에서 LiveKit을 설정하거나 녹음 업로드 테스트를 사용하세요."}
        </Notice>
      ) : !d.agent.online ? (
        <Notice tone="warn" icon={AlertTriangle} title="STT 에이전트가 오프라인입니다">
          방에 들어와 인식을 수행할 에이전트가 없습니다. 에이전트 프로세스가 실행 중인지 확인하세요.
        </Notice>
      ) : null}
      <div className="hgadm-speech__summary">
        <SttTile stt={d.stt} />
        <LiveKitTile livekit={d.livekit} />
        <AgentTile agent={d.agent} />
        <PronunciationTile pronunciation={d.pronunciation} />
      </div>
      <Card title={`최근 ${recent.window_minutes}분`} flush>
        <div className="hgadm-speech__metrics">
          <Metric label="인식 결과" value={recent.transcripts.toLocaleString()} />
          <Metric label="인식됨" value={recent.recognised.toLocaleString()} />
          <Metric label="음성 없음" value={recent.no_speech.toLocaleString()} />
          <Metric label="실패" value={recent.failed.toLocaleString()} tone={recent.failed > 0 ? "danger" : undefined} />
          <Metric label="평균 인식 시간" value={formatMs(recent.avg_latency_ms)} />
          <Metric label="마지막 인식" value={<Timestamp at={recent.last_transcript_at} />} />
        </div>
        {recent.last_error && (
          <div className="hgadm-speech__metrics-foot hgadm-text-danger hgadm-text-sm">
            <strong>마지막 오류</strong> {recent.last_error}
          </div>
        )}
      </Card>
    </section>
  );
}

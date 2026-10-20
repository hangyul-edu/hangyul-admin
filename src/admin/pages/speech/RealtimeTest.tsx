import { AlertTriangle, Mic, MicOff, RefreshCw } from "lucide-react";
import { Badge, Button, Card, DataTable, Field, Input, Select, Timestamp } from "../../components/kit";
import type { Column } from "../../components/kit";
import { Notice } from "../../components/insights";
import { Facts } from "./Facts";
import { PHASE_TEXT, useRealtimeTest } from "./useRealtimeTest";
import type { TranscriptRow } from "./useRealtimeTest";
import { formatConfidence, formatMs, providerLabel, reasonText, transcriptStatus, verdictText } from "./labels";

function GradeCell({ grade }: { grade: TranscriptRow["grade"] }) {
  if (!grade) return <span className="hgadm-muted">—</span>;
  if (grade.state === "pending") return <span className="hgadm-muted">채점 중…</span>;
  if (grade.state === "failed") return <Badge tone="danger">채점 실패</Badge>;
  const v = verdictText(grade.verdict);
  return (
    <div className="hgadm-cell-text hgadm-cell-text--narrow">
      <Badge tone={v.tone} dot>{v.label}</Badge>
      {grade.explanation && <div className="hgadm-cell-sub">{grade.explanation}</div>}
    </div>
  );
}

const COLUMNS: Column<TranscriptRow>[] = [
  { key: "at", header: "시각", render: (r) => <Timestamp at={r.at} /> },
  {
    key: "text",
    header: "인식된 텍스트",
    render: (r) => (
      <div className="hgadm-cell-text">
        {r.text ? <span className="hgadm-cell-main">{r.text}</span> : <span className="hgadm-muted">(없음)</span>}
        {r.error && <div className="hgadm-cell-sub hgadm-text-danger">{r.error}</div>}
      </div>
    ),
  },
  {
    key: "status",
    header: "상태",
    render: (r) => {
      const s = transcriptStatus(r.status);
      return (
        <span className="hgadm-row hgadm-row--wrap hgadm-row--tight">
          <Badge tone={s.tone} dot>{s.label}</Badge>
          {r.delivered && r.transcriptId ? (
            <span className="hgadm-muted hgadm-text-xs">저장됨</span>
          ) : (
            <Badge tone="danger" dot>저장 실패</Badge>
          )}
        </span>
      );
    },
  },
  { key: "grade", header: "채점", render: (r) => <GradeCell grade={r.grade} /> },
  {
    key: "provider",
    header: "인식기",
    render: (r) => (
      <span>
        {providerLabel(r.provider)}
        {r.model && <div className="hgadm-cell-sub hgadm-cell-mono">{r.model}</div>}
      </span>
    ),
  },
  { key: "confidence", header: "신뢰도", numeric: true, render: (r) => formatConfidence(r.confidence) },
  {
    key: "latency",
    header: "인식 시간",
    numeric: true,
    render: (r) => (
      <span>
        <span className="hgadm-tabular">{formatMs(r.latencyMs)}</span>
        {r.endToEndMs !== null && <div className="hgadm-cell-sub hgadm-tabular">종단 {formatMs(r.endToEndMs)}</div>}
      </span>
    ),
  },
];

export function RealtimeTest({ canRun }: { canRun: boolean }) {
  const t = useRealtimeTest();
  const busy = t.phase === "opening" || t.phase === "connecting";
  const active = t.connected || busy;
  const phaseTone = t.phase === "error" ? "danger" : t.phase === "idle" ? "neutral" : "success";
  const session = t.session;
  const reason = session ? reasonText(session.provider.reason) : null;

  return (
    <section className="hgadm-speech__section" aria-labelledby="speech-realtime-title">
      <div className="hgadm-speech__section-head">
        <h2 id="speech-realtime-title">실시간 마이크 테스트</h2>
        <span className="hgadm-muted hgadm-text-xs">
          브라우저 마이크를 LiveKit 방에 보내고, STT 에이전트의 음성 감지와 인식 결과를 그대로 확인합니다.
        </span>
      </div>

      {t.realtimeUnavailable && (
        <Notice tone="warn" icon={AlertTriangle} title="실시간 음성 서버를 쓸 수 없습니다">
          LiveKit이 설정되지 않았거나 응답하지 않습니다. 아래 녹음 업로드 테스트로 인식기만 따로 확인할 수 있습니다.
        </Notice>
      )}

      <Card title="마이크">
        <div className="hgadm-stack">
          <div className="hgadm-speech__controls">
            <Field label="입력 장치" hint="목록이 비어 있으면 '시작'을 눌러 마이크 권한을 허용한 뒤 새로 고침하세요.">
              <div className="hgadm-row">
                <Select
                  aria-label="마이크"
                  value={t.deviceId}
                  onChange={(e) => void t.changeDevice(e.target.value)}
                  className="hgadm-flex-1"
                >
                  <option value="">기본 마이크</option>
                  {t.devices.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId}>
                      {d.label || `마이크 ${i + 1}`}
                    </option>
                  ))}
                </Select>
                <Button size="sm" variant="ghost" onClick={() => void t.refreshDevices(false)} aria-label="마이크 목록 새로 고침">
                  <RefreshCw size={14} aria-hidden />
                </Button>
              </div>
            </Field>
            <Field label="기대 답안 (선택)" hint="입력하면 인식된 문장마다 읽기 채점을 함께 보여 줍니다. 정확히 그 내용을 말했을 때만 '정답'이어야 합니다.">
              <Input
                value={t.expected}
                onChange={(e) => t.setExpected(e.target.value)}
                placeholder="예: 안녕하세요, 만나서 반갑습니다"
                aria-label="기대 답안"
              />
            </Field>
          </div>

          <div className={`hgadm-speech__live ${t.vad.speaking ? "is-speaking" : ""}`}>
            <div className="hgadm-speech__live-row">
              {active ? (
                <Button variant="danger" onClick={() => void t.stop()} disabled={busy}>
                  <MicOff size={15} aria-hidden /> 중지
                </Button>
              ) : (
                <Button variant="primary" onClick={() => void t.start()} disabled={!canRun}>
                  <Mic size={15} aria-hidden /> 시작
                </Button>
              )}
              <Badge tone={phaseTone} dot>{PHASE_TEXT[t.phase]}</Badge>
              {t.phase === "error" && (
                <Button variant="ghost" size="sm" onClick={() => void t.stop()}>
                  초기화
                </Button>
              )}
              <div className="hgadm-speech__vad">
                <span className="hgadm-speech__vad-label">음성 감지</span>
                <meter
                  className="hgadm-speech__meter"
                  min={0}
                  max={1}
                  low={0.3}
                  high={0.6}
                  optimum={1}
                  value={t.vad.level}
                  aria-label="음성 확률"
                />
                <span className="hgadm-speech__vad-value hgadm-tabular">
                  {Math.round(t.vad.level * 100)}% {t.vad.speaking ? "· 말하는 중" : ""}
                </span>
              </div>
            </div>
            {!canRun ? (
              <p className="hgadm-muted hgadm-text-sm hgadm-m-0">
                이 브라우저는 마이크 캡처를 지원하지 않습니다. HTTPS 또는 localhost에서 여세요.
              </p>
            ) : session ? (
              <>
                <Facts
                  label="세션 정보"
                  items={[
                    [
                      "인식기",
                      <>
                        <Badge tone={session.provider.provider === "mock" ? "danger" : "success"} dot>
                          {providerLabel(session.provider.provider)}
                        </Badge>
                        {session.provider.model && <span className="hgadm-cell-mono">{session.provider.model}</span>}
                        {session.provider.is_fallback && <Badge tone="warning">대체 인식기</Badge>}
                      </>,
                    ],
                    ["에이전트", <Badge key="a" tone={session.agent_online ? "success" : "danger"} dot>{session.agent_online ? "온라인" : "오프라인"}</Badge>],
                    ["세션 만료", <Timestamp key="x" at={session.expires_at} />],
                  ]}
                />
                {reason?.warn && (
                  <p className="hgadm-speech__warn-text hgadm-text-xs hgadm-m-0">
                    <AlertTriangle size={14} strokeWidth={2} aria-hidden /> {reason.text}
                  </p>
                )}
              </>
            ) : (
              <p className="hgadm-muted hgadm-text-sm hgadm-m-0">'시작'을 누르면 세션을 열고 LiveKit 방에 연결합니다.</p>
            )}
          </div>
        </div>
      </Card>

      <Card title={`인식 결과 (${t.rows.length})`} flush>
        <DataTable
          columns={COLUMNS}
          rows={t.rows}
          rowKey={(r) => r.key}
          empty="아직 인식 결과가 없습니다. 연결된 뒤 마이크에 대고 말해 보세요."
        />
      </Card>

      {t.errors.length > 0 && (
        <Card
          title={`오류 (${t.errors.length})`}
          aside={
            <Button size="sm" variant="ghost" onClick={t.clearErrors}>
              지우기
            </Button>
          }
        >
          <ul className="hgadm-speech__errors">
            {t.errors.map((e, i) => (
              <li key={`${e.at}-${i}`}>
                <Timestamp at={e.at} />
                <span>{e.message}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  );
}

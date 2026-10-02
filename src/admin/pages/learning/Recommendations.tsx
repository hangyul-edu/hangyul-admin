import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { learningApi } from "../../learningApi";
import type { LearnerRow, SimulationResult, TraceSummary } from "../../learningApi";
import { useUrlFilters } from "../../lib/urlFilters";
import { useAdminAuth } from "../../auth";
import { useToastError } from "../../../hooks/toast";
import {
  Badge,
  Button,
  DataTable,
  ErrorState,
  Field,
  Input,
  LoadingState,
  SearchBox,
  Select,
  Stat,
} from "../../components/kit";
import type { Column } from "../../components/kit";
import { BarList, MetricLabel, RatioView, TRACK_LABEL, WindowControls, windowParams } from "../../components/learning";
import { formatDateTime } from "../../lib/format";
import { errorMessage } from "../../../lib/http";

const EXCLUSION_LABEL: Record<string, string> = {
  level_bound: "레벨 범위 밖",
  prerequisite_unmet: "선수 기술 미충족",
  recent_exposure: "최근 노출",
  no_skill_link: "기술 연결 없음",
  duplicate_item: "중복",
};

const KIND_LABEL: Record<string, string> = {
  assembly: "세션 구성",
  customization: "맞춤화",
  simulation: "시뮬레이션",
};

const STATUS_LABEL: Record<string, string> = {
  applied: "적용",
  undone: "적용 후 되돌림",
  needs_clarification: "추가 질문",
  rejected: "유지(조건 불충족)",
  conflicted: "충돌",
  cancelled: "취소",
  failed: "실패",
  processing: "처리 중",
};

const STEP_LABEL: Record<string, string> = {
  exact: "요청 그대로 충족",
  alternative: "대안 제공(차이 안내)",
  clarify: "추가 질문",
  preserve: "세션 유지",
  none: "해당 없음",
};

const INTERPRETER_LABEL: Record<string, string> = {
  model: "AI 모델",
  rule_based: "규칙 기반",
  none: "해석 전 종료",
};

const UNMET_LABEL: Record<string, string> = {
  topic_not_fully_available: "요청 주제 문항 부족",
  fewer_items_than_requested: "요청보다 적은 문항",
  difficulty_out_of_range: "난이도 범위 밖",
  no_mistakes_in_session: "세션 내 오답 없음",
  no_eligible_content: "제공 가능한 문항 없음",
};

function rows(record: Record<string, number> | undefined, labels: Record<string, string> = {}) {
  return Object.entries(record ?? {})
    .map(([key, value]) => ({ label: labels[key] ?? key, value }))
    .sort((a, b) => b.value - a.value);
}

function latency(l: { p50: number | null; p95: number | null; n: number }): string {
  if (l.n === 0) return "대상 데이터 없음";
  return `p50 ${l.p50 ?? "—"}ms · p95 ${l.p95 ?? "—"}ms (n=${l.n})`;
}

function Diagnostics() {
  const f = useUrlFilters();
  const params = windowParams(f, false);
  const query = useQuery({
    queryKey: ["admin", "learning", "recommendations", params],
    queryFn: () => learningApi.recommendations(params),
  });
  if (query.isLoading) return <LoadingState />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  const d = query.data!;
  const c = d.customizations;
  return (
    <>
      <div className="hgadm-stats">
        <Stat label="세션 구성 횟수" value={d.assemblies.toLocaleString()} />
        <Stat label="요청보다 짧은 세션" value={d.shorter_sessions.toLocaleString()} />
        <Stat label="구성 지연" value={<span style={{ fontSize: 15 }}>{latency(d.assembly_latency_ms)}</span>} />
        <Stat
          label={<MetricLabel metric="unwanted_repetition_rate" />}
          value={<RatioView ratio={d.unwanted_repetition} />}
        />
      </div>
      <div className="hgadm-grid-2">
        <div className="hgadm-card">
          <h3>제외 사유 (필수 조건)</h3>
          <BarList rows={rows(d.excluded_by_reason, EXCLUSION_LABEL)} />
        </div>
        <div className="hgadm-card">
          <h3>대체 경로</h3>
          <BarList rows={rows(d.fallbacks)} />
        </div>
      </div>
      <div className="hgadm-card">
        <h3>맞춤화 ({c.total.toLocaleString()}건)</h3>
        <div className="hgadm-cell-sub" style={{ marginBottom: 8 }}>
          충돌 {c.conflicts.toLocaleString()}건 · 재계산 {c.recomputes.toLocaleString()}회 · 지연 {latency(c.latency_ms)}
        </div>
        <div className="hgadm-grid-2">
          <div>
            <h4>상태</h4>
            <BarList rows={rows(c.by_status, STATUS_LABEL)} />
          </div>
          <div>
            <h4>대체 단계</h4>
            <BarList rows={rows(c.by_fallback_step, STEP_LABEL)} />
          </div>
          <div>
            <h4>해석 경로</h4>
            <BarList rows={rows(c.by_interpreter, INTERPRETER_LABEL)} />
          </div>
          <div>
            <h4>충족되지 않은 조건</h4>
            <BarList rows={rows(c.unmet_constraints, UNMET_LABEL)} />
          </div>
        </div>
      </div>
    </>
  );
}

function Traces() {
  const f = useUrlFilters();
  const kind = f.value("trace_kind");
  const query = useQuery({
    queryKey: ["admin", "learning", "traces", kind],
    queryFn: () => learningApi.traces({ kind: kind || undefined, limit: 50 }),
  });
  const columns: Column<TraceSummary>[] = [
    { key: "at", header: "시각", render: (t) => formatDateTime(t.created_at) },
    { key: "kind", header: "종류", render: (t) => <Badge tone="info">{KIND_LABEL[t.kind] ?? t.kind}</Badge> },
    { key: "considered", header: "후보", numeric: true, render: (t) => t.candidates_considered.toLocaleString() },
    { key: "eligible", header: "적격", numeric: true, render: (t) => t.candidates_eligible.toLocaleString() },
    { key: "selected", header: "선택", numeric: true, render: (t) => t.selected_count.toLocaleString() },
    {
      key: "excluded",
      header: "제외",
      render: (t) =>
        Object.entries(t.excluded_by_reason)
          .map(([k, v]) => `${EXCLUSION_LABEL[k] ?? k} ${v}`)
          .join(", ") || "—",
    },
    { key: "fallbacks", header: "대체", render: (t) => (t.fallbacks.length ? JSON.stringify(t.fallbacks) : "—") },
    { key: "latency", header: "지연(ms)", numeric: true, render: (t) => t.latency_ms ?? "—" },
    { key: "policy", header: "정책", render: (t) => <span className="hgadm-cell-mono">{t.ranking_policy_version}</span> },
  ];
  return (
    <div className="hgadm-card">
      <h3>추천 근거 탐색 (읽기 전용)</h3>
      <div className="hgadm-toolbar">
        <Select aria-label="근거 종류" value={kind} onChange={(e) => f.patch({ trace_kind: e.target.value })} style={{ width: 160 }}>
          <option value="">전체</option>
          <option value="assembly">세션 구성</option>
          <option value="customization">맞춤화</option>
        </Select>
      </div>
      {query.isLoading ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <DataTable columns={columns} rows={query.data!.items} rowKey={(t) => t.trace_id} empty="대상 데이터 없음" />
      )}
    </div>
  );
}

/** At most this many topics can be preferred (the API's limit). */
const MAX_TOPICS = 8;

/**
 * Pick the learner to simulate by nickname — their id is used only for the
 * request, never typed or shown.
 */
function LearnerPicker({ value, onChange }: { value: LearnerRow | null; onChange: (learner: LearnerRow | null) => void }) {
  const [q, setQ] = useState("");
  const results = useQuery({
    queryKey: ["admin", "learning", "simulation-learners", q],
    queryFn: () => learningApi.learners({ q, page: 1, page_size: 8 }),
    enabled: !value && q.trim().length > 0,
  });
  if (value) {
    return (
      <div className="hgadm-row" style={{ gap: 8 }}>
        <span>
          <strong>{value.nickname ?? "(닉네임 없음)"}</strong> <span className="hgadm-cell-sub">{value.email_masked}</span>
        </span>
        <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
          변경
        </Button>
      </div>
    );
  }
  return (
    <div style={{ width: 260 }}>
      <SearchBox value={q} placeholder="닉네임으로 검색" onSearch={setQ} />
      {q.trim() && (
        <div className="hgadm-card" style={{ marginTop: 4, padding: 4 }}>
          {results.isLoading ? (
            <LoadingState />
          ) : (results.data?.items ?? []).length === 0 ? (
            <div className="hgadm-cell-sub" style={{ padding: 6 }}>
              찾는 학습자가 없습니다.
            </div>
          ) : (
            <ul aria-label="학습자 검색 결과" style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {results.data!.items.map((l) => (
                <li key={l.user_id}>
                  <Button size="sm" variant="ghost" onClick={() => onChange(l)}>
                    {l.nickname ?? "(닉네임 없음)"} · {l.email_masked}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Simulation() {
  const toastError = useToastError();
  const [learner, setLearner] = useState<LearnerRow | null>(null);
  const [track, setTrack] = useState("conversation");
  const [count, setCount] = useState("8");
  const [topics, setTopics] = useState<string[]>([]);
  const [band, setBand] = useState("");
  const [result, setResult] = useState<SimulationResult | null>(null);
  const topicList = useQuery({ queryKey: ["admin", "learning", "topics"], queryFn: () => learningApi.topics() });
  const toggleTopic = (topicId: string) =>
    setTopics((was) => (was.includes(topicId) ? was.filter((t) => t !== topicId) : [...was, topicId]));
  const run = useMutation({
    mutationFn: () =>
      learningApi.simulate({
        user_id: learner!.user_id,
        track,
        activity_count: Number(count) || 8,
        topic_preferences: topics,
        band_override: band ? Number(band) : undefined,
      }),
    onSuccess: setResult,
    onError: toastError,
  });
  return (
    <div className="hgadm-card">
      <h3>
        세션 구성 시뮬레이션 <Badge tone="warning">시뮬레이션 — 저장되지 않음</Badge>
      </h3>
      <div className="hgadm-cell-sub" style={{ marginBottom: 8 }}>
        학습자의 현재 상태로 실제 구성 로직을 실행합니다. 세션·노출·예측·이벤트는 기록되지 않습니다. 조회는 감사 기록에 남습니다.
      </div>
      <div className="hgadm-toolbar">
        <Field label="학습자">
          <LearnerPicker value={learner} onChange={setLearner} />
        </Field>
        <Field label="트랙">
          <Select value={track} onChange={(e) => setTrack(e.target.value)} style={{ width: 120 }}>
            <option value="conversation">회화</option>
            <option value="topik">TOPIK</option>
          </Select>
        </Field>
        <Field label="활동 수">
          <Input type="number" min={1} max={20} value={count} onChange={(e) => setCount(e.target.value)} style={{ width: 80 }} />
        </Field>
        <Field label="수준 지정 (선택)">
          <Input type="number" min={1} max={10} value={band} onChange={(e) => setBand(e.target.value)} style={{ width: 90 }} />
        </Field>
        <Button variant="primary" disabled={!learner} loading={run.isPending} onClick={() => run.mutate()}>
          시뮬레이션 실행
        </Button>
      </div>
      {/* A group, not a Field: Field's <label> would turn any click into a
          click on the first checkbox. */}
      <div role="group" aria-label="선호 주제 (선택)" style={{ margin: "4px 0 8px" }}>
        <div className="hgadm-field__label">
          선호 주제 (선택, 최대 {MAX_TOPICS}개){topics.length ? ` · ${topics.length}개 선택` : ""}
        </div>
        {topicList.isLoading ? (
          <LoadingState />
        ) : topicList.isError ? (
          <ErrorState message="주제를 불러오지 못했습니다." onRetry={() => void topicList.refetch()} />
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
            {(topicList.data?.items ?? []).map((t) => (
              <label key={t.topic_id} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={topics.includes(t.topic_id)}
                  disabled={!topics.includes(t.topic_id) && topics.length >= MAX_TOPICS}
                  onChange={() => toggleTopic(t.topic_id)}
                />
                {t.name_ko}
              </label>
            ))}
          </div>
        )}
      </div>
      {result && (
        <div>
          <div className="hgadm-cell-sub" style={{ margin: "8px 0" }}>
            수준 {result.learner_band} · {TRACK_LABEL[track] ?? track} · 후보 {result.candidates_considered.toLocaleString()} · 적격{" "}
            {result.candidates_eligible.toLocaleString()}
            {result.shortfall_reason ? ` · 부족: ${result.shortfall_reason}` : ""}
          </div>
          <BarList rows={rows(result.excluded_by_reason, EXCLUSION_LABEL)} />
          <DataTable
            columns={[
              {
                key: "item",
                header: "콘텐츠",
                render: (s) => (
                  <span style={{ display: "inline-block", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.preview || "(내용 없음)"}
                  </span>
                ),
              },
              { key: "phase", header: "단계", render: (s) => s.phase },
              { key: "skill", header: "기술", render: (s) => (s.primary_skill_id ? s.primary_skill_name ?? "(이름 없는 기술)" : "—") },
              { key: "band", header: "수준", numeric: true, render: (s) => s.band },
              { key: "topic", header: "주제", render: (s) => (s.topic_id ? s.topic_name ?? "(이름 없는 주제)" : "—") },
              { key: "score", header: "점수", numeric: true, render: (s) => s.score.toFixed(3) },
              {
                key: "components",
                header: "점수 구성",
                render: (s) =>
                  Object.entries(s.components)
                    .map(([k, v]) => `${k} ${v}`)
                    .join(" · "),
              },
            ]}
            rows={result.selected}
            rowKey={(s) => s.version_id}
            empty="선택된 콘텐츠 없음"
          />
        </div>
      )}
    </div>
  );
}

export function RecommendationsPage() {
  const { can } = useAdminAuth();
  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>추천·맞춤화 진단</h1>
          <div className="hgadm-page-head__desc">
            세션 구성에서 제외된 이유, 대체 경로, 맞춤화 결과와 충족되지 않은 조건을 확인합니다.
          </div>
        </div>
      </div>
      <div className="hgadm-card">
        <WindowControls withComparison={false} />
      </div>
      <Diagnostics />
      <Traces />
      {can("learners:read") && <Simulation />}
    </div>
  );
}

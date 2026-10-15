import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Gauge, Layers, Repeat2, Scissors, Sparkles } from "lucide-react";
import { learningApi } from "../../learningApi";
import type { LearnerRow, SimulationResult, TraceSummary } from "../../learningApi";
import { useUrlFilters } from "../../lib/urlFilters";
import { useAdminAuth } from "../../auth";
import { useToastError } from "../../../hooks/toast";
import { Badge, Button, DataTable, ErrorState, Field, Input, LoadingState, SearchBox, Select } from "../../components/kit";
import type { Column } from "../../components/kit";
import { KpiCard, KpiRow, PageHero, Panel, PeriodPicker } from "../../components/insights";
import { BarList, MetricLabel, RatioView, TRACK_LABEL, windowParams } from "../../components/learning";
import { formatDateTime } from "../../lib/format";
import { errorMessage } from "../../../lib/http";

const EXCLUSION_LABEL: Record<string, string> = {
  level_bound: "레벨 범위 밖",
  prerequisite_unmet: "선수 기술 미충족",
  recent_exposure: "최근에 이미 나옴",
  no_skill_link: "학습 기술 연결 없음",
  duplicate_item: "중복",
};

const KIND_LABEL: Record<string, string> = {
  assembly: "세션 구성",
  customization: "맞춤 요청",
  simulation: "미리 구성",
};

const STATUS_LABEL: Record<string, string> = {
  applied: "반영됨",
  undone: "반영 후 회원이 되돌림",
  needs_clarification: "추가 질문 필요",
  rejected: "조건이 안 맞아 유지",
  conflicted: "다른 설정과 충돌",
  cancelled: "회원이 취소",
  failed: "처리 실패",
  processing: "처리 중",
};

const STEP_LABEL: Record<string, string> = {
  exact: "요청 그대로",
  alternative: "비슷한 대안으로 (차이 안내)",
  clarify: "회원에게 다시 질문",
  preserve: "기존 세션 유지",
  none: "해당 없음",
};

const INTERPRETER_LABEL: Record<string, string> = {
  model: "AI가 해석",
  rule_based: "규칙으로 해석",
  none: "해석 전에 끝남",
};

const UNMET_LABEL: Record<string, string> = {
  topic_not_fully_available: "요청 주제의 문항 부족",
  fewer_items_than_requested: "요청보다 적은 문항",
  difficulty_out_of_range: "요청 난이도 범위 밖",
  no_mistakes_in_session: "세션에 틀린 문항이 없음",
  no_eligible_content: "쓸 수 있는 문항 없음",
};

function rows(record: Record<string, number> | undefined, labels: Record<string, string> = {}) {
  return Object.entries(record ?? {})
    .map(([key, value]) => ({ label: labels[key] ?? key, value }))
    .sort((a, b) => b.value - a.value);
}

function latency(l: { p50: number | null; p95: number | null; n: number }): string {
  if (l.n === 0) return "아직 데이터 없음";
  return `보통 ${l.p50 ?? "—"}ms · 느릴 때 ${l.p95 ?? "—"}ms`;
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
      <KpiRow>
        <KpiCard icon={Layers} label="구성한 학습 세션" value={`${d.assemblies.toLocaleString()}회`} />
        <KpiCard
          icon={Scissors}
          label="요청보다 짧았던 세션"
          value={`${d.shorter_sessions.toLocaleString()}회`}
          sub="쓸 문항이 모자라 회원이 고른 길이보다 짧았어요"
        />
        <KpiCard
          icon={Gauge}
          label="세션 구성 속도"
          value={<span style={{ fontSize: 17 }}>{latency(d.assembly_latency_ms)}</span>}
          sub={d.assembly_latency_ms.n ? `${d.assembly_latency_ms.n.toLocaleString()}회 기준` : undefined}
        />
        <KpiCard
          icon={Repeat2}
          label={<MetricLabel metric="unwanted_repetition_rate" />}
          value={<RatioView ratio={d.unwanted_repetition} />}
        />
      </KpiRow>
      <div className="hgins-grid">
        <Panel title="문항이 빠진 이유" description="세션을 구성할 때 후보 문항이 제외된 이유예요. 한 이유가 너무 많으면 콘텐츠나 규칙을 확인해 보세요.">
          <BarList rows={rows(d.excluded_by_reason, EXCLUSION_LABEL)} empty="이 기간에 제외된 문항이 없어요" />
        </Panel>
        <Panel title="대체 방식" description="원하는 문항이 모자랄 때 어떤 방법으로 채웠는지예요.">
          <BarList rows={rows(d.fallbacks)} empty="이 기간에 대체한 적이 없어요" />
        </Panel>
      </div>
      <Panel
        title={`회원의 맞춤 요청 · ${c.total.toLocaleString()}건`}
        description={`주제·난이도를 바꿔 달라는 요청이 어떻게 처리됐는지예요. 다른 설정과 충돌 ${c.conflicts.toLocaleString()}건 · 다시 계산 ${c.recomputes.toLocaleString()}회 · 처리 시간 ${latency(c.latency_ms)}`}
      >
        <div className="hgins-grid" style={{ marginBottom: 0 }}>
          <div>
            <h4>처리 결과</h4>
            <BarList rows={rows(c.by_status, STATUS_LABEL)} empty="요청이 없어요" />
          </div>
          <div>
            <h4>반영 방식</h4>
            <BarList rows={rows(c.by_fallback_step, STEP_LABEL)} empty="요청이 없어요" />
          </div>
          <div>
            <h4>요청 해석</h4>
            <BarList rows={rows(c.by_interpreter, INTERPRETER_LABEL)} empty="요청이 없어요" />
          </div>
          <div>
            <h4>채우지 못한 조건</h4>
            <BarList rows={rows(c.unmet_constraints, UNMET_LABEL)} empty="채우지 못한 조건이 없어요" />
          </div>
        </div>
      </Panel>
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
    { key: "at", header: "일시", render: (t) => formatDateTime(t.created_at) },
    { key: "kind", header: "종류", render: (t) => <Badge tone="info">{KIND_LABEL[t.kind] ?? t.kind}</Badge> },
    { key: "considered", header: "살펴본 후보", numeric: true, render: (t) => t.candidates_considered.toLocaleString() },
    { key: "eligible", header: "조건 맞는 후보", numeric: true, render: (t) => t.candidates_eligible.toLocaleString() },
    { key: "selected", header: "고른 문항", numeric: true, render: (t) => t.selected_count.toLocaleString() },
    {
      key: "excluded",
      header: "빠진 이유",
      render: (t) =>
        Object.entries(t.excluded_by_reason)
          .map(([k, v]) => `${EXCLUSION_LABEL[k] ?? k} ${v}`)
          .join(", ") || "—",
    },
    { key: "fallbacks", header: "대체", render: (t) => (t.fallbacks.length ? JSON.stringify(t.fallbacks) : "—") },
    { key: "latency", header: "처리 시간(ms)", numeric: true, render: (t) => t.latency_ms ?? "—" },
    { key: "policy", header: "규칙 버전", render: (t) => <span className="hgadm-cell-mono">{t.ranking_policy_version}</span> },
  ];
  return (
    <Panel
      title="세션 구성 기록"
      description="최근 세션 50개가 어떤 후보 중에서 어떻게 골라졌는지 볼 수 있어요. 보기만 할 수 있어요."
      actions={
        <Select aria-label="근거 종류" value={kind} onChange={(e) => f.patch({ trace_kind: e.target.value })} style={{ width: 160 }}>
          <option value="">전체</option>
          <option value="assembly">세션 구성</option>
          <option value="customization">맞춤 요청</option>
        </Select>
      }
    >
      {query.isLoading ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <DataTable columns={columns} rows={query.data!.items} rowKey={(t) => t.trace_id} empty="아직 기록이 없어요" />
      )}
    </Panel>
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
              찾는 회원이 없어요.
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
    <Panel
      title={
        <>
          세션 미리 구성해 보기 <Badge tone="info">미리보기 — 저장되지 않음</Badge>
        </>
      }
      description="회원의 지금 상태로 실제 구성 규칙을 돌려, 다음 학습에 어떤 문항이 왜 나올지 확인해요. 세션·출제·이벤트는 저장되지 않고, 조회했다는 기록만 남아요."
    >
      <div className="hgadm-toolbar">
        <Field label="회원">
          <LearnerPicker value={learner} onChange={setLearner} />
        </Field>
        <Field label="과정">
          <Select value={track} onChange={(e) => setTrack(e.target.value)}>
            <option value="conversation">회화</option>
            <option value="topik">TOPIK</option>
          </Select>
        </Field>
        <Field label="문항 수">
          <Input type="number" min={1} max={20} value={count} onChange={(e) => setCount(e.target.value)} style={{ width: 80 }} />
        </Field>
        <Field label="레벨 직접 지정 (선택)">
          <Input type="number" min={1} max={10} value={band} onChange={(e) => setBand(e.target.value)} style={{ width: 90 }} />
        </Field>
        <Button variant="primary" disabled={!learner} loading={run.isPending} onClick={() => run.mutate()}>
          <Sparkles size={15} strokeWidth={2} aria-hidden />
          미리 구성해 보기
        </Button>
      </div>
      {/* A group, not a Field: Field's <label> would turn any click into a
          click on the first checkbox. */}
      <div role="group" aria-label="선호 주제 (선택)" style={{ margin: "4px 0 8px" }}>
        <div className="hgadm-field__label">
          좋아하는 주제 (선택, 최대 {MAX_TOPICS}개){topics.length ? ` · ${topics.length}개 선택` : ""}
        </div>
        {topicList.isLoading ? (
          <LoadingState />
        ) : topicList.isError ? (
          <ErrorState message="주제를 불러오지 못했습니다." onRetry={() => void topicList.refetch()} />
        ) : (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "6px 14px",
              maxHeight: 112,
              overflowY: "auto",
              padding: "8px 10px",
              border: "1px solid var(--border)",
              borderRadius: 10,
              background: "var(--surface-2)",
            }}
          >
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
          <div className="hgins-facts" style={{ margin: "12px 0" }}>
            <div className="hgins-fact">
              <div className="hgins-fact__label">회원 레벨</div>
              <div className="hgins-fact__value">
                {TRACK_LABEL[track] ?? track} {result.learner_band}
              </div>
            </div>
            <div className="hgins-fact">
              <div className="hgins-fact__label">살펴본 후보</div>
              <div className="hgins-fact__value">{result.candidates_considered.toLocaleString()}</div>
            </div>
            <div className="hgins-fact">
              <div className="hgins-fact__label">조건 맞는 후보</div>
              <div className="hgins-fact__value">{result.candidates_eligible.toLocaleString()}</div>
              {result.shortfall_reason && <div className="hgins-fact__hint">부족: {result.shortfall_reason}</div>}
            </div>
          </div>
          <BarList rows={rows(result.excluded_by_reason, EXCLUSION_LABEL)} empty="빠진 후보가 없어요" />
          <DataTable
            columns={[
              {
                key: "item",
                header: "나올 문항",
                render: (s) => (
                  <span style={{ display: "inline-block", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.preview || "(내용 없음)"}
                  </span>
                ),
              },
              { key: "phase", header: "단계", render: (s) => s.phase },
              { key: "skill", header: "학습 기술", render: (s) => (s.primary_skill_id ? s.primary_skill_name ?? "(이름 없는 기술)" : "—") },
              { key: "band", header: "레벨", numeric: true, render: (s) => s.band },
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
            empty="고를 수 있는 문항이 없어요"
          />
        </div>
      )}
    </Panel>
  );
}

export function RecommendationsPage() {
  const { can } = useAdminAuth();
  return (
    <div>
      <PageHero
        icon={Sparkles}
        eyebrow="학습 인사이트 · 맞춤 학습·AI"
        title="맞춤 학습"
        description="회원마다 학습 세션이 어떻게 구성되는지, 주제·난이도를 바꿔 달라는 요청이 얼마나 잘 반영되는지 보여 줘요. 문항이 모자라거나 요청을 채우지 못한 경우를 찾는 데 써요."
      />
      <PeriodPicker withComparison={false} />
      <Diagnostics />
      <Traces />
      {can("learners:read") && <Simulation />}
    </div>
  );
}

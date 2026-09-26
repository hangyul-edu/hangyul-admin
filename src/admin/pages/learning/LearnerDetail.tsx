import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { learningApi } from "../../learningApi";
import type { EvidenceRow, Growth, SessionTrace, SkillGrowth, TimelineRow } from "../../learningApi";
import { errorMessage } from "../../../lib/http";
import { useUrlFilters } from "../../lib/urlFilters";
import { useBackTarget } from "../../lib/navigation";
import { formatDateTime } from "../../lib/format";
import {
  Badge,
  Button,
  DataTable,
  Dl,
  ErrorState,
  Input,
  LoadingState,
  Modal,
  Select,
} from "../../components/kit";
import type { Column } from "../../components/kit";
import {
  ChangeView,
  MetricLabel,
  RatioView,
  STRENGTH_LABEL,
  TRACK_LABEL,
  pct,
  statusText,
} from "../../components/learning";

type Tab = "overview" | "growth" | "evidence" | "timeline" | "sessions";

const EVENT_LABEL: Record<string, string> = {
  session_created: "세션 시작",
  session_resumed: "세션 재개",
  session_completed: "세션 완료",
  session_abandoned: "세션 중단",
  session_expired: "세션 만료",
  attempt_graded: "답안 채점",
  hint_requested: "힌트 요청",
  answer_revealed: "정답 공개",
  activity_skipped: "활동 건너뜀",
  activity_withdrawn: "콘텐츠 회수로 활동 제외",
  review_scheduled: "복습 예정",
  review_completed: "복습 완료",
  skill_evidence_accepted: "학습 증거 반영",
  skill_evidence_excluded: "학습 증거 제외",
  skill_state_updated: "숙달도 갱신",
  recommendation_selected: "활동 추천",
  recommendation_fallback: "추천 대체",
  customization_requested: "맞춤화 요청",
  customization_interpreted: "맞춤화 해석",
  customization_applied: "맞춤화 적용",
  customization_rejected: "맞춤화 미적용",
  customization_conflicted: "맞춤화 충돌",
  customization_cancelled: "맞춤화 취소·되돌림",
  tutor_requested: "튜터 질문",
  tutor_responded: "튜터 응답",
  tutor_failed: "튜터 응답 실패",
  content_issue_reported: "콘텐츠 문제 신고",
  model_usage_recorded: "AI 모델 사용",
};

const POLICY_LABEL: Record<string, string> = {
  independent: "독립",
  assisted: "도움 받음",
  revealed: "정답 공개 후",
  retry: "재시도",
  custom_practice: "맞춤 연습",
  excluded: "제외",
};

const CAUSE_LABEL: Record<string, string> = {
  evidence: "새 증거",
  correction: "콘텐츠 정정",
  recompute: "재계산",
  review_decay: "복습 일정",
};

export function LearnerDetailPage() {
  const { userId = "" } = useParams();
  const back = useBackTarget({ to: "/learning/learners", label: "학습자 성장" });
  const [tab, setTab] = useState<Tab>("overview");
  const [skillFilter, setSkillFilter] = useState<string>("");
  const [traceId, setTraceId] = useState<string | null>(null);
  const f = useUrlFilters();
  const track = f.value("track", "conversation");

  const detail = useQuery({ queryKey: ["admin", "learning", "learner", userId], queryFn: () => learningApi.learner(userId) });

  if (detail.isLoading) return <LoadingState />;
  if (detail.isError) return <ErrorState message={errorMessage(detail.error)} onRetry={() => detail.refetch()} />;
  const d = detail.data!;

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <Link to={back.to} className="hgadm-cell-sub">
            ← {back.label}
          </Link>
          <h1>{d.nickname ?? "(닉네임 없음)"}</h1>
          <div className="hgadm-page-head__desc">
            {d.email_masked} · 가입 {formatDateTime(d.created_at)} · 학습 데이터 수집 시작{" "}
            {d.data_coverage_start ? formatDateTime(d.data_coverage_start) : "기록 없음"} · 학습자 모델 {d.learner_model_version}
          </div>
        </div>
      </div>

      <div className="hgadm-tabs" role="tablist">
        {(
          [
            ["overview", "개요·기술"],
            ["growth", "성장 비교"],
            ["evidence", "학습 증거"],
            ["timeline", "타임라인"],
            ["sessions", "세션·추천 근거"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={`hgadm-tab ${tab === key ? "active" : ""}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab !== "overview" && tab !== "timeline" && tab !== "sessions" && (
        <div className="hgadm-toolbar">
          <Select aria-label="트랙" value={track} onChange={(e) => f.patch({ track: e.target.value })} style={{ width: 140 }}>
            <option value="conversation">{TRACK_LABEL.conversation}</option>
            <option value="topik">{TRACK_LABEL.topik}</option>
          </Select>
        </div>
      )}

      {tab === "overview" &&
        d.tracks.map((t) => (
          <div className="hgadm-card" key={t.track}>
            <h3>
              {TRACK_LABEL[t.track]} · 현재 레벨 {t.band ?? "미설정"}
            </h3>
            <div className="hgadm-cell-sub">
              배치 방법 {t.placement_method ?? "—"} · 불확실성 {t.placement_uncertainty === "high" ? "높음 (자기 보고)" : (t.placement_uncertainty ?? "—")}
            </div>
            <DataTable
              columns={[
                { key: "skill", header: "기술", render: (s) => <div><div>{s.name_ko}</div><div className="hgadm-cell-sub hgadm-cell-mono">{s.skill_id} · {s.dimension}</div></div> },
                { key: "mastery", header: "숙달 추정치", numeric: true, render: (s) => <span title="규칙 기반 추정치이며 보정된 확률이 아닙니다">{pct(s.mastery, 0)}</span> },
                { key: "prior", header: "배치 초기값", numeric: true, render: (s) => pct(s.prior, 0) },
                { key: "evidence", header: "증거", numeric: true, render: (s) => `${s.evidence_count}건` },
                { key: "strength", header: "증거 강도", render: (s) => <Badge tone={s.evidence_strength === "high" ? "success" : s.evidence_strength === "medium" ? "info" : "neutral"}>{STRENGTH_LABEL[s.evidence_strength]}</Badge> },
                { key: "next", header: "다음 복습", render: (s) => formatDateTime(s.next_review_at) },
              ]}
              rows={t.skills}
              rowKey={(s) => `${s.skill_id}:${s.dimension}`}
              onRowClick={(s) => {
                f.patch({ track: t.track });
                setSkillFilter(s.skill_id);
                setTab("evidence");
              }}
              empty="아직 반영된 학습 증거가 없습니다."
            />
            <div className="hgadm-grid-2" style={{ marginTop: 12 }}>
              <div>
                <h4>복습 대기열</h4>
                {t.review_queue.length === 0 ? (
                  <div className="hgadm-cell-sub">예정된 복습 없음</div>
                ) : (
                  <ul>
                    {t.review_queue.map((r) => (
                      <li key={r.review_id}>
                        {r.skill_id} · {r.kind === "retention_check" ? "유지 확인" : "복습"} · {formatDateTime(r.due_at)}{" "}
                        {r.overdue && <Badge tone="warning">기한 지남</Badge>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h4>최근 30일 반복된 독립 오답</h4>
                {t.recent_miss_patterns.length === 0 ? (
                  <div className="hgadm-cell-sub">기록된 반복 오답 없음</div>
                ) : (
                  <ul>
                    {t.recent_miss_patterns.map((m) => (
                      <li key={m.skill_id}>
                        {m.skill_id}: {m.independent_misses_30d}회 (마지막 {formatDateTime(m.last_miss_at)})
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        ))}

      {tab === "growth" && <GrowthPanel userId={userId} track={track} onSkill={(s) => { setSkillFilter(s); setTab("evidence"); }} />}
      {tab === "evidence" && <EvidencePanel userId={userId} track={track} skillId={skillFilter} onSkillChange={setSkillFilter} />}
      {tab === "timeline" && <TimelinePanel userId={userId} />}
      {tab === "sessions" && (
        <div className="hgadm-card">
          <DataTable
            columns={[
              { key: "started", header: "시작", render: (s) => formatDateTime(s.started_at) },
              { key: "track", header: "트랙", render: (s) => TRACK_LABEL[s.track] },
              { key: "status", header: "상태", render: (s) => <Badge tone="neutral">{s.status}</Badge> },
              { key: "rev", header: "수정 버전", numeric: true, render: (s) => s.current_revision },
              { key: "short", header: "짧아진 이유", render: (s) => s.shortfall_reason ?? "—" },
            ]}
            rows={d.recent_sessions}
            rowKey={(s) => s.session_id}
            onRowClick={(s) => setTraceId(s.session_id)}
            empty="세션 기록이 없습니다."
          />
        </div>
      )}
      {traceId && <TraceModal userId={userId} sessionId={traceId} onClose={() => setTraceId(null)} />}
    </div>
  );
}

function GrowthPanel({ userId, track, onSkill }: { userId: string; track: string; onSkill: (skill: string) => void }) {
  const f = useUrlFilters();
  const params = {
    track,
    baseline_start: f.value("baseline_start") || undefined,
    baseline_end: f.value("baseline_end") || undefined,
    current_start: f.value("current_start") || undefined,
    current_end: f.value("current_end") || undefined,
  };
  const q = useQuery({ queryKey: ["admin", "learning", "growth", userId, params], queryFn: () => learningApi.growth(userId, params) });
  const date = (name: string, label: string) => (
    <label className="hgadm-window-field">
      <span className="hgadm-cell-sub">{label}</span>
      <Input type="date" aria-label={label} value={f.value(name)} onChange={(e) => f.patch({ [name]: e.target.value || null })} style={{ width: 150 }} />
    </label>
  );
  return (
    <>
      <div className="hgadm-toolbar" role="group" aria-label="비교 기간 (Asia/Seoul)">
        {date("baseline_start", "기준 기간 시작")}
        {date("baseline_end", "기준 기간 끝")}
        {date("current_start", "현재 기간 시작")}
        {date("current_end", "현재 기간 끝")}
      </div>
      {q.isLoading && <LoadingState />}
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {q.data && <GrowthView g={q.data} onSkill={onSkill} />}
    </>
  );
}

function GrowthView({ g, onSkill }: { g: Growth; onSkill: (skill: string) => void }) {
  const skillColumns: Column<SkillGrowth>[] = [
    { key: "skill", header: "기술", render: (s) => <span className="hgadm-cell-mono">{s.skill_id} · {s.dimension}</span> },
    { key: "base", header: "기준", numeric: true, render: (s) => (s.baseline_mastery === null ? "—" : `${pct(s.baseline_mastery, 0)} (${s.baseline_evidence_count}건)`) },
    { key: "cur", header: "현재", numeric: true, render: (s) => `${pct(s.current_mastery, 0)} (${s.current_evidence_count}건)` },
    {
      key: "change",
      header: "변화",
      render: (s) =>
        s.status === "ok" && s.change_pp !== null ? (
          <strong>{s.change_pp > 0 ? "+" : ""}{s.change_pp.toFixed(1)}%p</strong>
        ) : (
          <span className="hgadm-cell-sub">{statusText(s.status)}{s.note ? ` — ${s.note}` : ""}</span>
        ),
    },
    { key: "strength", header: "증거 강도", render: (s) => STRENGTH_LABEL[s.evidence_strength] ?? s.evidence_strength },
    {
      key: "why",
      header: "변화 원인 (현재 기간)",
      render: (s) =>
        Object.keys(s.change_causes).length
          ? Object.entries(s.change_causes).map(([k, n]) => `${CAUSE_LABEL[k] ?? k} ${n}`).join(", ")
          : "—",
    },
    { key: "drill", header: "", render: (s) => <Button size="sm" variant="ghost" onClick={() => onSkill(s.skill_id)}>근거 보기</Button> },
  ];
  const ia = g.independent_accuracy;
  return (
    <>
      <div className="hgadm-card">
        <div className="hgadm-cell-sub">
          기준 {g.baseline_window.start} ~ {g.baseline_window.end} · 현재 {g.current_window.start} ~ {g.current_window.end} ·{" "}
          {g.current_window.timezone} · 학습자 모델 {g.learner_model_version} · 도움 기준: {g.assistance_policy}
        </div>
        <table className="hgadm-table" style={{ marginTop: 10 }}>
          <caption className="hgadm-cell-sub" style={{ textAlign: "left" }}>활동·수행·복습은 서로 다른 측정입니다</caption>
          <thead>
            <tr>
              <th scope="col">항목</th>
              <th scope="col">기준 기간</th>
              <th scope="col">현재 기간</th>
              <th scope="col">변화</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">활동 (세션 시작/완료 · 채점 시도)</th>
              <td>{g.activity.baseline.sessions_started}/{g.activity.baseline.sessions_completed} · {g.activity.baseline.attempts}</td>
              <td>{g.activity.current.sessions_started}/{g.activity.current.sessions_completed} · {g.activity.current.attempts}</td>
              <td className="hgadm-cell-sub">활동량은 성장 지표가 아님</td>
            </tr>
            <tr>
              <th scope="row"><MetricLabel metric={ia.metric} /></th>
              <td><RatioView ratio={ia.baseline} /></td>
              <td><RatioView ratio={ia.current} /></td>
              <td><ChangeView change={ia} /></td>
            </tr>
            <tr>
              <th scope="row">평균 문항 수준</th>
              <td>{g.mean_item_band.baseline?.toFixed(1) ?? "—"}</td>
              <td>{g.mean_item_band.current?.toFixed(1) ?? "—"}</td>
              <td className="hgadm-cell-sub">수준이 달라지면 정답률 비교는 제한됨</td>
            </tr>
            <tr>
              <th scope="row">도움 사용 (힌트 / 정답 공개)</th>
              <td><RatioView ratio={g.assistance.baseline.hint} compact /> / <RatioView ratio={g.assistance.baseline.reveal} compact /></td>
              <td><RatioView ratio={g.assistance.current.hint} compact /> / <RatioView ratio={g.assistance.current.reveal} compact /></td>
              <td />
            </tr>
            <tr>
              <th scope="row"><MetricLabel metric={g.reviews.current.review_success.metric} /></th>
              <td><RatioView ratio={g.reviews.baseline.review_success} /></td>
              <td><RatioView ratio={g.reviews.current.review_success} /></td>
              <td className="hgadm-cell-sub">현재 기한 지난 복습 {g.reviews.current.reviews_overdue_now}개</td>
            </tr>
            <tr>
              <th scope="row"><MetricLabel metric={g.reviews.current.delayed_retention.metric} /></th>
              <td><RatioView ratio={g.reviews.baseline.delayed_retention} /></td>
              <td><RatioView ratio={g.reviews.current.delayed_retention} /></td>
              <td className="hgadm-cell-sub">
                참여 {g.reviews.current.retention_participation.completed_on_time}/{g.reviews.current.retention_participation.due_in_window}
              </td>
            </tr>
            <tr>
              <th scope="row"><MetricLabel metric={g.reviews.current.transfer.metric} /></th>
              <td><RatioView ratio={g.reviews.baseline.transfer} /></td>
              <td><RatioView ratio={g.reviews.current.transfer} /></td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="hgadm-card">
        <h3>기술별 숙달도 변화</h3>
        <DataTable columns={skillColumns} rows={g.skills} rowKey={(s) => `${s.skill_id}:${s.dimension}`} empty="비교할 기술 기록이 없습니다." />
        <ul className="hgadm-cell-sub" style={{ marginTop: 8 }}>
          {g.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
    </>
  );
}

function EvidencePanel({ userId, track, skillId, onSkillChange }: { userId: string; track: string; skillId: string; onSkillChange: (s: string) => void }) {
  const [before, setBefore] = useState<string | undefined>(undefined);
  const q = useQuery({
    queryKey: ["admin", "learning", "evidence", userId, track, skillId, before],
    queryFn: () => learningApi.evidence(userId, { track, skill_id: skillId || undefined, before, limit: 50 }),
  });
  const columns: Column<EvidenceRow>[] = [
    { key: "at", header: "시각", render: (e) => formatDateTime(e.occurred_at) },
    { key: "skill", header: "기술", render: (e) => <span className="hgadm-cell-mono">{e.skill_id} ({e.role === "primary" ? "주" : "보조"})</span> },
    { key: "outcome", header: "결과", render: (e) => (e.outcome >= 0.5 ? "정답" : "오답") },
    {
      key: "policy",
      header: "반영 방식",
      render: (e) => (
        <span>
          <Badge tone={e.policy === "independent" ? "success" : e.policy === "assisted" ? "info" : "neutral"}>{POLICY_LABEL[e.policy] ?? e.policy}</Badge>
          {e.invalidated_at && <Badge tone="danger">콘텐츠 정정으로 무효</Badge>}
        </span>
      ),
    },
    { key: "weight", header: "가중치", numeric: true, render: (e) => e.weight.toFixed(2) },
    { key: "delta", header: "숙달도", render: (e) => (e.mastery_after === null ? "반영 안 됨" : `${pct(e.mastery_before, 0)} → ${pct(e.mastery_after, 0)}`) },
    { key: "content", header: "콘텐츠 버전", render: (e) => <span className="hgadm-cell-mono">{e.content_item_key} v{e.content_version_no} · L{e.item_band}{e.content_review_status === "legacy_unreviewed" ? " · 미검수(레거시)" : ""}</span> },
    { key: "model", header: "모델", render: (e) => e.model_version },
  ];
  return (
    <div className="hgadm-card">
      <div className="hgadm-toolbar">
        <Input aria-label="기술 ID" placeholder="기술 ID로 거르기 (예: grammar.euni_kka)" value={skillId} onChange={(e) => { setBefore(undefined); onSkillChange(e.target.value.trim()); }} style={{ width: 320 }} />
      </div>
      {q.isLoading && <LoadingState />}
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {q.data && (
        <>
          <DataTable columns={columns} rows={q.data.items} rowKey={(e) => e.evidence_id} empty="해당 조건의 학습 증거가 없습니다." />
          <div className="hgadm-toolbar">
            {before && <Button size="sm" variant="ghost" onClick={() => setBefore(undefined)}>처음으로</Button>}
            {q.data.next_before && <Button size="sm" variant="ghost" onClick={() => setBefore(q.data!.next_before!)}>이전 기록 더 보기</Button>}
          </div>
        </>
      )}
    </div>
  );
}

function TimelinePanel({ userId }: { userId: string }) {
  const [beforeSeq, setBeforeSeq] = useState<number | undefined>(undefined);
  const q = useQuery({
    queryKey: ["admin", "learning", "timeline", userId, beforeSeq],
    queryFn: () => learningApi.timeline(userId, { before_seq: beforeSeq, limit: 100 }),
  });
  const columns: Column<TimelineRow>[] = [
    { key: "at", header: "시각", render: (r) => formatDateTime(r.occurred_at) },
    { key: "event", header: "사건", render: (r) => EVENT_LABEL[r.event_name] ?? r.event_name },
    { key: "session", header: "세션", render: (r) => <span className="hgadm-cell-mono">{r.session_id ?? "—"}{r.session_revision ? ` r${r.session_revision}` : ""}</span> },
    { key: "detail", header: "세부", render: (r) => <span className="hgadm-cell-sub hgadm-cell-mono">{summarize(r.payload)}</span> },
  ];
  return (
    <div className="hgadm-card">
      {q.isLoading && <LoadingState />}
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {q.data && (
        <>
          <DataTable columns={columns} rows={q.data.items} rowKey={(r) => String(r.seq)} empty="기록된 학습 사건이 없습니다." />
          <div className="hgadm-toolbar">
            {beforeSeq && <Button size="sm" variant="ghost" onClick={() => setBeforeSeq(undefined)}>최신으로</Button>}
            {q.data.next_before_seq && <Button size="sm" variant="ghost" onClick={() => setBeforeSeq(q.data!.next_before_seq!)}>이전 기록 더 보기</Button>}
          </div>
        </>
      )}
    </div>
  );
}

function summarize(payload: Record<string, unknown>): string {
  const keys = ["correct", "evidence_policy", "skill_id", "reason", "route", "mode", "fallback_step", "outcome", "mastery_after", "cause"];
  return keys
    .filter((k) => payload[k] !== undefined && payload[k] !== null)
    .map((k) => `${k}=${String(payload[k])}`)
    .join(" · ");
}

function TraceModal({ userId, sessionId, onClose }: { userId: string; sessionId: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ["admin", "learning", "trace", userId, sessionId], queryFn: () => learningApi.sessionTrace(userId, sessionId) });
  return (
    <Modal open onClose={onClose} title="세션 추천 근거" size="xl">
      {q.isLoading && <LoadingState />}
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {q.data && <TraceView t={q.data} />}
    </Modal>
  );
}

function TraceView({ t }: { t: SessionTrace }) {
  return (
    <div>
      <Dl
        items={[
          ["세션", <span className="hgadm-cell-mono" key="s">{t.session_id}</span>],
          ["트랙 · 레벨", `${TRACK_LABEL[t.track]} · ${t.learner_band}`],
          ["정책", `${t.blueprint_version} · ${t.ranking_policy_version}`],
          ["짧아진 이유", t.shortfall_reason ?? "—"],
          ["수정 이력", t.revisions.map((r) => `r${r.revision_no}(${r.cause})`).join(" → ")],
        ]}
      />
      {t.traces.map((tr) => (
        <div className="hgadm-card" key={tr.trace_id}>
          <h4>
            {tr.kind === "customization" ? "맞춤화" : "구성"} · 후보 {tr.candidates_considered} → 적격 {tr.candidates_eligible} → 선택 {tr.selected.length}
          </h4>
          <div className="hgadm-cell-sub">
            제외 사유: {Object.entries(tr.excluded_by_reason).map(([k, n]) => `${k} ${n}`).join(", ") || "없음"} · 학습자 모델 {tr.learner_model_version} ·
            사용한 학습자 상태: {JSON.stringify(tr.learner_snapshot)}
          </div>
          <DataTable
            columns={[
              { key: "item", header: "콘텐츠", render: (s) => <span className="hgadm-cell-mono">{s.item_key}</span> },
              { key: "phase", header: "단계", render: (s) => `${s.phase}${s.review_kind !== "none" ? ` (${s.review_kind})` : ""}` },
              { key: "skill", header: "기술", render: (s) => s.primary_skill_id ?? "—" },
              { key: "score", header: "점수", numeric: true, render: (s) => s.score.toFixed(3) },
              { key: "why", header: "점수 구성", render: (s) => <span className="hgadm-cell-sub hgadm-cell-mono">{Object.entries(s.components).map(([k, v]) => `${k}=${v}`).join(" ")}</span> },
            ]}
            rows={tr.selected}
            rowKey={(s) => s.version_id}
          />
        </div>
      ))}
      <h4>시도 기록 {t.answers_included ? "" : "(답안 원문은 transcripts:read 권한 필요)"}</h4>
      <DataTable
        columns={[
          { key: "at", header: "시각", render: (a) => formatDateTime(a.graded_at) },
          { key: "no", header: "회차", numeric: true, render: (a) => a.attempt_no },
          { key: "correct", header: "결과", render: (a) => (a.correct === null ? "루브릭" : a.correct ? "정답" : "오답") },
          { key: "policy", header: "반영", render: (a) => POLICY_LABEL[a.evidence_policy] ?? a.evidence_policy },
          { key: "answer", header: "답안", render: (a) => a.answer ?? "—" },
        ]}
        rows={t.attempts}
        rowKey={(a) => a.attempt_id}
        empty="시도 기록 없음"
      />
    </div>
  );
}

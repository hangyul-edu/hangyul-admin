import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { proficiencyAdminApi } from "../../proficiencyApi";
import type { CapabilityView, DecisionView, EvidenceItem, GrowthView, ProficiencyDetail, ProficiencyTrack } from "../../proficiencyApi";
import { errorMessage } from "../../../lib/http";
import { useUrlFilters } from "../../lib/urlFilters";
import { useBackTarget } from "../../lib/navigation";
import { formatDateTime } from "../../lib/format";
import { useToast, useToastError } from "../../../hooks/toast";
import { Badge, Button, DataTable, Dl, ErrorState, Input, LoadingState, Select, Stat } from "../../components/kit";
import type { BadgeTone, Column } from "../../components/kit";
import { GrowthCell, STATUS_LABEL, levelText } from "./Proficiency";

type Tab = "overview" | "growth" | "evidence" | "history" | "correct";

const CAP_STATUS: Record<CapabilityView["status"], { text: string; tone: BadgeTone }> = {
  confirmed: { text: "확인됨", tone: "success" },
  in_progress: { text: "진행 중", tone: "info" },
  needs_reconfirmation: { text: "재확인 필요", tone: "warning" },
  not_assessed: { text: "평가 전", tone: "neutral" },
};

const DECISION_KIND: Record<string, string> = {
  promotion: "승급 확정",
  provisional_placement: "임시 배치",
  readiness_confirmed: "TOPIK 준비도 확인",
  readiness_provisional: "TOPIK 임시 준비도",
  no_change: "변동 없음",
  correction: "관리자 정정",
};

const DIMENSION: Record<string, string> = {
  task_fulfillment: "과제 수행",
  listening_interaction: "듣기·상호작용",
  language: "적절·정확한 언어",
  coherence_fluency: "일관성·유창성",
  pronunciation: "발음 명료성",
};

const MISSING: Record<string, string> = {
  independent_successes: "독립 성공 부족",
  situations: "상황 다양성 부족",
  study_days: "학습일 부족",
  delayed_check: "지연 확인 전",
  recent_contrary_evidence: "최근 반대 증거",
};

export function ProficiencyDetailPage() {
  const { userId = "" } = useParams();
  const f = useUrlFilters();
  const track = (f.value("track") || "conversation") as ProficiencyTrack;
  const back = useBackTarget({ to: "/learning/proficiency", label: "레벨 판정" });
  const [tab, setTab] = useState<Tab>("overview");
  const detail = useQuery({
    queryKey: ["admin", "proficiency", "learner", userId],
    queryFn: () => proficiencyAdminApi.learner(userId),
  });

  if (detail.isLoading) return <LoadingState />;
  if (detail.isError) return <ErrorState message={errorMessage(detail.error)} onRetry={() => detail.refetch()} />;
  const d = detail.data!;
  const tabs: [Tab, string][] = [
    ["overview", "승급 진행"],
    ["growth", "성장"],
    ["evidence", "평가 증거"],
    ["history", "판정 이력"],
  ];
  if (d.can_correct) tabs.push(["correct", "정정·재처리"]);

  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <Link to={back.to} className="hgadm-cell-sub">
            ← {back.label}
          </Link>
          <h1>{d.user.nickname ?? "(닉네임 없음)"}</h1>
          <div className="hgadm-page-head__desc">
            {d.user.email} · 정책 {d.how_calculated.policy_version} · 프레임워크 {d.how_calculated.framework_version} ·{" "}
            <Link to="/learning/proficiency-policy">판정 기준 보기</Link>
          </div>
        </div>
      </div>
      <div className="hgadm-toolbar">
        <Select aria-label="트랙" value={track} onChange={(e) => f.patch({ track: e.target.value })}>
          <option value="conversation">회화</option>
          <option value="topik">TOPIK</option>
        </Select>
      </div>
      <div className="hgadm-tabs" role="tablist">
        {tabs.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={`hgadm-tab ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "overview" && (track === "topik" ? <TopikOverview d={d} /> : <ConversationOverview d={d} />)}
      {tab === "growth" && <GrowthPanel userId={userId} track={track} />}
      {tab === "evidence" && <EvidencePanel userId={userId} track={track} canCorrect={d.can_correct} canTranscripts={d.can_read_transcripts} />}
      {tab === "history" && <HistoryPanel d={d} track={track} />}
      {tab === "correct" && d.can_correct && <CorrectionPanel userId={userId} track={track} />}
    </div>
  );
}

function IssueBadges({ d }: { d: ProficiencyDetail }) {
  const i = d.issues;
  return (
    <div className="hgadm-prof-chips">
      <Badge tone={i.technical ? "danger" : "neutral"}>기술 오류(녹음 등) {i.technical}</Badge>
      <Badge tone={i.pending_scoring ? "warning" : "neutral"}>채점 대기 {i.pending_scoring}</Badge>
      <Badge tone={i.uncertain ? "warning" : "neutral"}>불확실(신뢰 안 된 채점) {i.uncertain}</Badge>
      <Badge tone={i.integrity_flags ? "danger" : "neutral"}>무결성 의심 {i.integrity_flags}</Badge>
      <Badge tone={i.performance_gaps ? "info" : "neutral"}>실제 수행 부족 {i.performance_gaps}</Badge>
    </div>
  );
}

function ConversationOverview({ d }: { d: ProficiencyDetail }) {
  const c = d.conversation;
  const nl = c.next_level;
  const capColumns: Column<CapabilityView>[] = [
    { key: "cap", header: "필수 역량", render: (r) => <div className="hgadm-cell-main">{r.label.ko}</div> },
    { key: "status", header: "상태", render: (r) => <Badge tone={CAP_STATUS[r.status].tone}>{CAP_STATUS[r.status].text}</Badge> },
    { key: "ind", header: "독립 확인", numeric: true, render: (r) => `${r.independent_successes}/${r.required_successes}` },
    { key: "sit", header: "상황", numeric: true, render: (r) => `${r.situations}/${r.required_situations}` },
    { key: "days", header: "학습일", numeric: true, render: (r) => `${r.study_days}/${r.required_study_days}` },
    {
      key: "delayed",
      header: "지연 확인",
      render: (r) =>
        r.delayed_confirmed ? (
          <Badge tone="success">완료</Badge>
        ) : r.delayed_check_available_at ? (
          <span className="hgadm-cell-sub">{formatDateTime(r.delayed_check_available_at)} 이후</span>
        ) : (
          <span className="hgadm-cell-sub">첫 성공 전</span>
        ),
    },
    { key: "fail", header: "최근 반대 증거", numeric: true, render: (r) => (r.valid_failures ? <Badge tone="warning">{r.valid_failures}</Badge> : "0") },
    {
      key: "missing",
      header: "남은 조건",
      render: (r) => (r.missing.length ? r.missing.map((m) => MISSING[m] ?? m).join(", ") : <span className="hgadm-cell-sub">—</span>),
    },
  ];
  return (
    <>
      <div className="hgadm-grid-2">
        <div className="hgadm-card">
          <Dl
            items={[
              ["상태", <Badge key="s" tone={STATUS_LABEL[c.status].tone}>{STATUS_LABEL[c.status].text}</Badge>],
              ["확인 레벨", levelText("conversation", c.confirmed_level)],
              ["임시 배치", levelText("conversation", c.provisional_level)],
              ["다음 목표", c.at_maximum ? "최고 레벨(유지)" : levelText("conversation", c.target_level)],
              ["학습 난이도(학습자 설정)", levelText("conversation", c.study_level)],
              ["다음 추천 평가", c.next_activity.reason.ko],
              ["평가 콘텐츠 검증", c.validation_status === "unvalidated" ? "미검증(잠정 판정)" : c.validation_status],
            ]}
          />
        </div>
        <div className="hgadm-card">
          <h3 className="hgadm-card__title">평가 상태 구분</h3>
          <IssueBadges d={d} />
          {c.last_decision && (
            <>
              <h3 className="hgadm-card__title">최근 판정 설명</h3>
              <p>{c.last_decision.explanation.ko}</p>
            </>
          )}
        </div>
      </div>
      {nl && (
        <div className="hgadm-card">
          <h3 className="hgadm-card__title">레벨 {nl.level} 승급 체크리스트</h3>
          <div className="hgadm-grid-2">
            <Stat label="필수 역량 확인" value={`${nl.coverage.confirmed}/${nl.coverage.total} (${nl.coverage.pct}%)`} sub="통과 확률이 아닌 확인된 역량 비율" />
            <Stat
              label="승급 요건 충족"
              value={`${Math.round(nl.checklist.pct)}%`}
              sub={nl.ready ? "모든 필수 조건 충족" : "필수 조건이 남아 있음 — 승급 준비 완료 아님"}
            />
          </div>
          <ul className="hgadm-prof-gates">
            {nl.gates.map((g) => (
              <li key={g.gate}>
                <Badge tone={g.passed ? "success" : "neutral"}>{g.passed ? "충족" : "미충족"}</Badge> {g.label.ko}
              </li>
            ))}
            <li>
              <Badge tone={nl.integrative?.result === "passed" ? "success" : "neutral"}>
                {nl.integrative ? nl.integrative.result : "미응시"}
              </Badge>{" "}
              종합 평가 (역할극 2개 + 보완 과제)
              {nl.integrative?.reasons.length ? <span className="hgadm-cell-sub"> · {nl.integrative.reasons.join(", ")}</span> : null}
            </li>
          </ul>
          <DataTable columns={capColumns} rows={nl.capabilities} rowKey={(r) => r.capability_id} empty="필수 역량이 없습니다." />
          {nl.unseen_tasks_left === 0 && <p className="hgadm-cell-sub">이 레벨의 미노출 과제를 모두 사용했습니다 — 과제 보강이 필요합니다.</p>}
        </div>
      )}
      <DimensionTrends d={d} />
    </>
  );
}

function DimensionTrends({ d }: { d: ProficiencyDetail }) {
  if (!d.dimension_trends.length) return null;
  return (
    <div className="hgadm-card">
      <h3 className="hgadm-card__title">루브릭 차원 추이 (같은 목표 레벨·루브릭 안에서만 비교)</h3>
      <div className="hgadm-table-wrap"><table className="hgadm-table">
        <thead>
          <tr>
            <th>목표</th>
            <th>차원</th>
            <th>관찰 수</th>
            <th>점수 (0–4, 오래된 순)</th>
          </tr>
        </thead>
        <tbody>
          {d.dimension_trends.map((t) => (
            <tr key={`${t.target_level}-${t.rubric_version}-${t.dimension}`}>
              <td>
                레벨 {t.target_level} · {t.rubric_version}
              </td>
              <td>{DIMENSION[t.dimension] ?? t.dimension}</td>
              <td>{t.observations}</td>
              <td>{t.series.map((p) => `${p.score}${p.trusted ? "" : "*"}`).join(" → ")}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <p className="hgadm-cell-sub">* 신뢰되지 않은 채점(개발용·모의 채점) — 판정에 쓰이지 않습니다.</p>
    </div>
  );
}

function TopikOverview({ d }: { d: ProficiencyDetail }) {
  const t = d.topik;
  return (
    <>
      <div className="hgadm-card">
        <Dl
          items={[
            ["상태", <Badge key="s" tone={STATUS_LABEL[t.status].tone}>{STATUS_LABEL[t.status].text}</Badge>],
            ["확인 준비도", levelText("topik", t.confirmed_grade)],
            ["임시 준비도", levelText("topik", t.provisional_grade)],
            ["목표 급수(학습자 선택)", levelText("topik", t.target_grade)],
            ["근거", "앱 모의평가(미검증 양식) — 공식 TOPIK 점수 아님"],
            ["응시한 모의평가", `${t.mocks_taken}회`],
          ]}
        />
      </div>
      {(["I", "II"] as const).map((lv) => {
        const r = t.readiness[lv];
        return (
          <div key={lv} className="hgadm-card">
            <h3 className="hgadm-card__title">TOPIK {lv}</h3>
            <Dl
              items={[
                ["판정", `${r.status}${r.grade != null ? ` · ${r.grade}급` : ""}`],
                ["근거 범위", r.basis === "listening_reading_only" ? "듣기·읽기만(쓰기 미평가) — 급수 판정 안 함" : r.basis],
                ["사유", r.reasons.join(", ") || "—"],
                ["영역 점수(최근)", Object.entries(r.latest_section_scores).map(([s, v]) => `${s} ${v ?? "—"}`).join(" · ") || "—"],
                ["보완 영역(지도용 진단)", r.weak_sections.join(", ") || "—"],
              ]}
            />
          </div>
        );
      })}
      <div className="hgadm-card">
        <h3 className="hgadm-card__title">평가 상태 구분</h3>
        <IssueBadges d={d} />
      </div>
    </>
  );
}

/* ------------------------------------------------------------- growth */

function CoverageChart({ series }: { series: GrowthView["series"] }) {
  if (series.length < 2) return <p className="hgadm-cell-sub">추이를 그릴 만큼 기록이 없습니다.</p>;
  const w = 560;
  const h = 140;
  const t0 = new Date(series[0].at).getTime();
  const t1 = new Date(series[series.length - 1].at).getTime();
  // Left gutter for the axis labels, top band for the segment labels.
  const left = 40;
  const x = (at: string) => (t1 === t0 ? (w + left) / 2 : ((new Date(at).getTime() - t0) / (t1 - t0)) * (w - left - 16) + left);
  const y = (pct: number) => h - 10 - (pct / 100) * (h - 34);
  // One line per comparable segment (target level + policy). A change of
  // target or policy is a discontinuity, never drawn as a continuous line.
  const segments: GrowthView["series"][] = [];
  for (const p of series) {
    const last = segments[segments.length - 1];
    if (last && last[0].target_level === p.target_level && last[0].policy_version === p.policy_version) last.push(p);
    else segments.push([p]);
  }
  return (
    <svg className="hgadm-prof-chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="필수 역량 확인 비율 추이(목표 레벨별 구간)">
      {[0, 50, 100].map((g) => (
        <g key={g}>
          <line x1={left} x2={w} y1={y(g)} y2={y(g)} className="hgadm-prof-chart__grid" />
          <text x={left - 6} y={y(g) + 3} textAnchor="end" className="hgadm-prof-chart__label">
            {g}%
          </text>
        </g>
      ))}
      {segments.map((seg, i) => (
        <g key={i} className={`hgadm-prof-chart__seg hgadm-prof-chart__seg--${i % 3}`}>
          <polyline points={seg.map((p) => `${x(p.at)},${y(p.pct)}`).join(" ")} />
          {seg.map((p) => (
            <circle key={p.at} cx={x(p.at)} cy={y(p.pct)} r={3} />
          ))}
          <text
            x={x(seg[0].at)}
            y={12}
            textAnchor={x(seg[0].at) > w - 60 ? "end" : "start"}
            className="hgadm-prof-chart__label"
          >
            레벨 {seg[0].target_level}
          </text>
        </g>
      ))}
    </svg>
  );
}

function GrowthPanel({ userId, track }: { userId: string; track: ProficiencyTrack }) {
  const [period, setPeriod] = useState("30");
  const q = useQuery({
    queryKey: ["admin", "proficiency", "growth", userId, track, period],
    queryFn: () => proficiencyAdminApi.growth(userId, { track, period: Number(period) }),
  });
  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const g = q.data!;
  const cc = g.coverage_change;
  return (
    <>
      <div className="hgadm-toolbar">
        <Select aria-label="기간" value={period} onChange={(e) => setPeriod(e.target.value)}>
          <option value="7">7일</option>
          <option value="30">30일</option>
          <option value="90">90일</option>
        </Select>
        <span className="hgadm-cell-sub">레벨은 순서형이라 레벨 숫자의 변화율은 계산하지 않습니다. 강의·문제 수·포인트는 반영하지 않습니다.</span>
      </div>
      <div className="hgadm-grid-2">
        <div className="hgadm-card">
          <Stat
            label="필수 역량 확인 비율 변화"
            value={<GrowthCell growth={{ period_days: g.period_days, status: cc.status, change_pp: cc.change_pp, segmented: cc.segmented }} />}
            sub={
              cc.status === "ok"
                ? `${cc.baseline_pct}% → ${cc.current_pct}% (레벨 ${cc.target_level}, ${cc.policy_version})${cc.weekly_rate_pp != null ? ` · 주당 ${cc.weekly_rate_pp}%p` : ""}`
                : "기간 시작 시점의 비교 기준이 없습니다(0이 아님)."
            }
          />
          <CoverageChart series={g.series} />
        </div>
        <div className="hgadm-card">
          <Stat
            label="지연 확인 성공률(관찰값)"
            value={g.delayed_retention.rate == null ? "해당 없음" : `${Math.round(g.delayed_retention.rate * 100)}%`}
            sub={`${g.delayed_retention.numerator} / ${g.delayed_retention.denominator} (숙달 확률 아님)`}
          />
          <h3 className="hgadm-card__title">새로 확인된 역량 ({g.newly_confirmed.length})</h3>
          <ul className="hgadm-prof-list">
            {g.newly_confirmed.map((n) => (
              <li key={n.capability_id}>
                레벨 {n.level} · {n.label?.ko ?? n.capability_id} <span className="hgadm-cell-sub">{formatDateTime(n.first_confirmed_at)}</span>
              </li>
            ))}
            {!g.newly_confirmed.length && <li className="hgadm-cell-sub">없음</li>}
          </ul>
        </div>
      </div>
      <div className="hgadm-card">
        <h3 className="hgadm-card__title">비교 가능한 점수 추이</h3>
        <div className="hgadm-table-wrap"><table className="hgadm-table">
          <thead>
            <tr>
              <th>목표·루브릭·과제 유형</th>
              <th>관찰 수</th>
              <th>처음 → 마지막</th>
              <th>변화</th>
            </tr>
          </thead>
          <tbody>
            {g.score_trends.map((t) => (
              <tr key={`${t.target_level}-${t.rubric_version}-${t.task_kind}`}>
                <td>
                  레벨 {t.target_level} · {t.rubric_version} · {t.task_kind}
                </td>
                <td>{t.observations}</td>
                <td>
                  {t.first.toFixed(2)} → {t.last.toFixed(2)}
                </td>
                <td>{t.change == null ? "관찰 1회" : t.change.toFixed(2)}</td>
              </tr>
            ))}
            {!g.score_trends.length && (
              <tr>
                <td colSpan={4} className="hgadm-cell-sub">
                  기간 안의 신뢰된 채점이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table></div>
        <p className="hgadm-cell-sub">과제 변형끼리 동등화되지 않았으므로 같은 목표 레벨·루브릭·과제 유형 안에서만 비교합니다.</p>
      </div>
      <div className="hgadm-card">
        <h3 className="hgadm-card__title">기간 내 승급·배치</h3>
        <DecisionTable rows={g.promotions} track={track} />
      </div>
    </>
  );
}

/* ----------------------------------------------------------- evidence */

function EvidencePanel({ userId, track, canCorrect, canTranscripts }: { userId: string; track: ProficiencyTrack; canCorrect: boolean; canTranscripts: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const [reason, setReason] = useState("");
  const q = useQuery({
    queryKey: ["admin", "proficiency", "evidence", userId, track],
    queryFn: () => proficiencyAdminApi.evidence(userId, { track }),
  });
  const invalidate = useMutation({
    mutationFn: (id: string) => proficiencyAdminApi.invalidate(id, reason),
    onSuccess: () => {
      toast.success("증거를 무효 처리하고 다시 판정했습니다.");
      qc.invalidateQueries({ queryKey: ["admin", "proficiency"] });
    },
    onError: toastError,
  });
  if (q.isLoading) return <LoadingState />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const rows = q.data!.items;
  if (track === "topik") {
    return (
      <div className="hgadm-card">
        <div className="hgadm-table-wrap"><table className="hgadm-table">
          <thead>
            <tr>
              <th>시작</th>
              <th>양식</th>
              <th>상태</th>
              <th>결과</th>
              <th>출처</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.session_id}>
                <td>{formatDateTime(r.started_at ?? "")}</td>
                <td>{r.spec_version}</td>
                <td>{r.status}</td>
                <td>{r.result ? JSON.stringify(r.result) : "—"}</td>
                <td>맞춤 학습 · topik_mock</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    );
  }
  const columns: Column<EvidenceItem>[] = [
    { key: "at", header: "시각(학습자 날짜)", render: (r) => <div>{formatDateTime(r.occurred_at ?? "")}<div className="hgadm-cell-sub">{r.local_date}</div></div> },
    { key: "cap", header: "역량", render: (r) => <div>{r.capability_label?.ko ?? r.capability_id}<div className="hgadm-cell-sub">레벨 {r.level} · {r.situation_id}</div></div> },
    { key: "outcome", header: "결과", render: (r) => `${r.outcome}${r.rating != null ? ` (${r.rating}/4)` : ""}` },
    {
      key: "counted",
      header: "판정 반영",
      render: (r) =>
        r.counted ? (
          <Badge tone="success">독립 근거</Badge>
        ) : r.valid ? (
          <Badge tone="neutral">{r.exclusion_label?.ko ?? "유효(실패)"}</Badge>
        ) : (
          <Badge tone="warning">{r.exclusion_label?.ko ?? "제외"}</Badge>
        ),
    },
    {
      key: "scorer",
      header: "채점",
      render: (r) => (
        <div className="hgadm-cell-sub">
          {r.scorer?.provider ?? "—"} · {r.scorer?.rubric_version}
          {!r.scorer_trusted && " · 신뢰 안 됨"}
        </div>
      ),
    },
  ];
  if (canTranscripts) {
    columns.push({ key: "tr", header: "응답 원문", render: (r) => <span className="hgadm-cell-sub">{(r.transcript ?? []).join(" / ")}</span> });
  }
  if (canCorrect) {
    columns.push({
      key: "act",
      header: "",
      render: (r) =>
        r.invalidated_at ? (
          <span className="hgadm-cell-sub">무효({r.invalidation_reason})</span>
        ) : (
          <Button size="sm" disabled={reason.trim().length < 10 || invalidate.isPending} onClick={() => r.observation_id && invalidate.mutate(r.observation_id)}>
            무효 처리
          </Button>
        ),
    });
  }
  return (
    <div className="hgadm-card">
      {canCorrect && (
        <div className="hgadm-toolbar">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="무효 처리 사유(10자 이상)" style={{ width: 360 }} />
          <span className="hgadm-cell-sub">사유는 감사 기록에 남습니다.</span>
        </div>
      )}
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.observation_id ?? r.session_id} empty="평가 증거가 없습니다." />
      <p className="hgadm-cell-sub">맞춤 학습 실력 평가의 관찰만 표시됩니다. 강의·체크포인트·연습 활동은 증거로 기록되지 않습니다.</p>
    </div>
  );
}

/* ------------------------------------------------------------ history */

function DecisionTable({ rows, track }: { rows: DecisionView[]; track: ProficiencyTrack }) {
  const columns: Column<DecisionView>[] = [
    { key: "at", header: "시각", render: (r) => formatDateTime(r.decided_at) },
    {
      key: "kind",
      header: "종류",
      render: (r) => (
        <div>
          {DECISION_KIND[r.kind] ?? r.kind}
          {!r.applied && r.kind !== "no_change" && <div className="hgadm-cell-sub">미적용({r.rollout_mode})</div>}
        </div>
      ),
    },
    { key: "level", header: "레벨", render: (r) => `${levelText(track, r.from_level)} → ${levelText(track, r.to_level ?? r.from_level)}` },
    { key: "why", header: "설명", render: (r) => <span>{r.explanation.ko}{r.reason && <div className="hgadm-cell-sub">사유: {r.reason}</div>}</span> },
    { key: "policy", header: "정책", render: (r) => <span className="hgadm-cell-sub">{r.policy_version}</span> },
    { key: "reward", header: "보상", numeric: true, render: (r) => (r.reward_points ? `+${r.reward_points}` : "—") },
  ];
  return <DataTable columns={columns} rows={rows} rowKey={(r) => r.decision_id} empty="판정 기록이 없습니다." />;
}

function HistoryPanel({ d, track }: { d: ProficiencyDetail; track: ProficiencyTrack }) {
  const own = d.decisions.filter((x) => x.track === track);
  const legacy = d.level_history.filter((e) => e.track === (track === "topik" ? "track_topik" : "track_conversation"));
  return (
    <>
      <div className="hgadm-card">
        <h3 className="hgadm-card__title">실력 판정 이력</h3>
        <DecisionTable rows={own} track={track} />
      </div>
      <div className="hgadm-card">
        <h3 className="hgadm-card__title">학습 난이도 변경 이력</h3>
        <div className="hgadm-table-wrap"><table className="hgadm-table">
          <thead>
            <tr>
              <th>시각</th>
              <th>변경</th>
              <th>출처</th>
            </tr>
          </thead>
          <tbody>
            {legacy.map((e, i) => (
              <tr key={i}>
                <td>{formatDateTime(e.occurred_at)}</td>
                <td>
                  {e.from_level} → {e.to_level}
                </td>
                <td>{e.source === "auto_promote" ? <Badge tone="neutral">{e.label.ko}</Badge> : e.label.ko}</td>
              </tr>
            ))}
            {!legacy.length && (
              <tr>
                <td colSpan={3} className="hgadm-cell-sub">
                  변경 기록이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table></div>
        <p className="hgadm-cell-sub">
          &quot;기존 활동 기반 진급(레거시)&quot;은 폐지된 &quot;5문제 정답&quot; 규칙의 기록이며, 확인된 실력 레벨로 인정하지 않습니다.
        </p>
      </div>
    </>
  );
}

/* --------------------------------------------------------- correction */

function CorrectionPanel({ userId, track }: { userId: string; track: ProficiencyTrack }) {
  const qc = useQueryClient();
  const toast = useToast();
  const toastError = useToastError();
  const [confirmed, setConfirmed] = useState("");
  const [provisional, setProvisional] = useState("");
  const [reason, setReason] = useState("");
  const max = track === "topik" ? 6 : 10;
  const done = () => {
    setReason("");
    qc.invalidateQueries({ queryKey: ["admin", "proficiency"] });
  };
  const correct = useMutation({
    mutationFn: () =>
      proficiencyAdminApi.correct(userId, {
        track,
        confirmed_level: confirmed ? Number(confirmed) : null,
        provisional_level: provisional ? Number(provisional) : null,
        reason,
      }),
    onSuccess: () => {
      toast.success("정정을 기록했습니다.");
      done();
    },
    onError: toastError,
  });
  const reprocess = useMutation({
    mutationFn: () => proficiencyAdminApi.reprocess(userId, { track, reason }),
    onSuccess: (r) => {
      toast.success(`재처리했습니다: ${r.decisions.join(", ") || "변동 없음"}`);
      done();
    },
    onError: toastError,
  });
  const ok = reason.trim().length >= 10;
  return (
    <div className="hgadm-card">
      <p className="hgadm-cell-sub">
        정정은 &quot;관리자 정정&quot; 판정으로 기록되며 평가 증거가 아니고 보상도 지급되지 않습니다. 사유와 함께 감사 기록에 남습니다.
        일반적인 승급에는 관리자 승인이 필요하지 않습니다.
      </p>
      <div className="hgadm-toolbar">
        <Select aria-label="확인 레벨" value={confirmed} onChange={(e) => setConfirmed(e.target.value)}>
          <option value="">확인 레벨 없음</option>
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <option key={n} value={String(n)}>
              {levelText(track, n)}
            </option>
          ))}
        </Select>
        <Select aria-label="임시 레벨" value={provisional} onChange={(e) => setProvisional(e.target.value)}>
          <option value="">임시 레벨 없음</option>
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <option key={n} value={String(n)}>
              임시 {levelText(track, n)}
            </option>
          ))}
        </Select>
      </div>
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="사유(10자 이상)" style={{ width: "100%" }} />
      <div className="hgadm-toolbar">
        <Button variant="primary" disabled={!ok || correct.isPending} onClick={() => correct.mutate()}>
          정정 기록
        </Button>
        <Button disabled={!ok || reprocess.isPending} onClick={() => reprocess.mutate()}>
          저장된 증거로 다시 판정
        </Button>
      </div>
    </div>
  );
}

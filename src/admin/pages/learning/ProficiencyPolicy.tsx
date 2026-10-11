import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Scale, XCircle } from "lucide-react";
import { proficiencyAdminApi } from "../../proficiencyApi";
import type { Agreement } from "../../proficiencyApi";
import { errorMessage } from "../../../lib/http";
import { useAdminAuth } from "../../auth";
import { Badge, Dl, ErrorState, LoadingState } from "../../components/kit";
import { Notice, PageHero, Panel } from "../../components/insights";
import { BarList } from "../../components/learning";

/** The promotion policy's numbers, as the rule each one is. */
const POLICY_LABEL: Record<string, string> = {
  min_independent_successes: "역량마다 혼자 성공해야 하는 횟수",
  min_situations: "서로 다른 상황 수",
  min_study_days: "서로 다른 학습일 수",
  min_day_separation_hours: "다른 날로 인정하는 최소 간격 (시간)",
  delayed_check_hours: "첫 성공 뒤 다시 확인하기까지 (시간)",
  evidence_window_days: "평가 기록이 유효한 기간 (일)",
  integrative_min_role_plays: "종합 평가 역할극 수",
  integrative_min_complementary: "종합 평가 보완 과제 수",
  integrative_min_overall: "종합 평가 평균 최소 점수",
  integrative_min_role_play_core: "역할극 과제 수행·듣기 최소 점수",
  integrative_min_other_dimension: "그 밖의 평가 항목 최소 점수",
  capability_success_rating: "성공으로 보는 점수",
};
const META_KEYS = new Set(["version", "status", "checklist_version"]);

const POLICY_STATUS: Record<string, string> = {
  provisional_operating_policy: "임시 운영 기준",
};

/** Activity types, in words (the code stays beside it for support). */
const ACTIVITY_LABEL: Record<string, string> = {
  conv_capability_check: "회화 역량 확인",
  conv_delayed_check: "회화 지연 확인",
  conv_integrative: "회화 종합 평가",
  conv_placement: "회화 배치 평가",
  topik_mock: "TOPIK 모의고사",
  lecture_playback: "강의 재생",
  lecture_completion: "강의 완료",
  course_or_series_progress: "코스·시리즈 진도",
  lecture_checkpoint: "강의 체크포인트",
  lecture_checkpoint_practice_page: "체크포인트 연습",
  lecture_ai_practice: "강의 AI 연습",
  lecture_quiz: "강의 퀴즈",
  daily_quiz_or_question_bank: "오늘의 문제·문제 은행",
  adaptive_practice_item: "맞춤 학습 연습 문항",
  rewards_points_league_streak: "포인트·리그·연속 학습",
  subscription_or_purchase: "구독·결제",
  daily_goal: "하루 목표",
  ai_chat: "AI 대화",
  imported_activity: "가져온 활동",
};

function pct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

function AgreementRow({ label, a }: { label: string; a: Agreement }) {
  return (
    <tr>
      <td>{label}</td>
      <td>{a.n}</td>
      <td>{pct(a.exact)}</td>
      <td>{pct(a.adjacent)}</td>
      <td>{a.mean_abs_diff ?? "—"}</td>
    </tr>
  );
}

function ActivityChips({ codes, tone }: { codes: string[]; tone: "success" | "neutral" }) {
  return (
    <div className="hgadm-prof-chips">
      {codes.map((code) => (
        <Badge key={code} tone={tone}>
          {ACTIVITY_LABEL[code] ?? code}{" "}
          {ACTIVITY_LABEL[code] && <span className="hgadm-cell-mono" style={{ opacity: 0.6, fontSize: 11 }}>{code}</span>}
        </Badge>
      ))}
    </div>
  );
}

/** 레벨 판정 기준 — the policy actually in force, and how far it is validated. */
export function ProficiencyPolicyPage() {
  const { can } = useAdminAuth();
  const policy = useQuery({ queryKey: ["admin", "proficiency", "policy"], queryFn: proficiencyAdminApi.policy });
  const validation = useQuery({
    queryKey: ["admin", "proficiency", "validation"],
    queryFn: proficiencyAdminApi.validation,
    enabled: can("analytics:read"),
  });
  const hero = (
    <PageHero
      icon={Scale}
      eyebrow="학습 인사이트 · 기준·데이터 상태"
      title="레벨 판정 기준"
      description="회원의 레벨이 언제, 어떤 조건으로 오르는지 정한 규칙이에요. 지금 서버에 적용된 값 그대로 보여 줘요."
    />
  );
  if (policy.isLoading)
    return (
      <div>
        {hero}
        <LoadingState />
      </div>
    );
  if (policy.isError)
    return (
      <div>
        {hero}
        <ErrorState message={errorMessage(policy.error)} onRetry={() => policy.refetch()} />
      </div>
    );
  const p = policy.data!;
  const v = validation.data;
  const rules = Object.entries(p.conversation.policy).filter(([k]) => !META_KEYS.has(k));
  const meta = p.conversation.policy as Record<string, unknown>;
  return (
    <div>
      {hero}
      <Notice tone="warn" title="아직 검증 전의 기준이에요">
        숫자 기준은 모두 검증 전의 잠정 운영 정책이며 과학적으로 입증된 값이 아니에요. 자세한 설명은 운영 매뉴얼{" "}
        <code>{p.manual}</code>에 있어요.
      </Notice>

      <Panel
        title="회화 레벨이 오르는 조건"
        description={`다음 레벨의 필수 역량을 모두, 서로 다른 날과 상황에서 도움 없이 해내고 종합 평가를 통과하면 레벨이 올라가요. 정책 ${String(meta.version ?? "—")} · ${POLICY_STATUS[String(meta.status)] ?? String(meta.status ?? "—")} · 체크리스트 ${String(meta.checklist_version ?? "—")}`}
      >
        <div className="hgins-facts">
          {rules.map(([k, val]) => (
            <div className="hgins-fact" key={k}>
              <div className="hgins-fact__label">{POLICY_LABEL[k] ?? k}</div>
              <div className="hgins-fact__value">{String(val)}</div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="hgins-grid">
        <Panel
          title="회화 평가 점수 비중"
          description={
            <>
              평가 답변을 채점할 때 항목별 비중이에요 ({p.conversation.rubric_version}). 과제 은행 {p.conversation.bank_version} ·{" "}
              <Badge tone="warning">
                {p.conversation.bank_validation_status === "unvalidated" ? "교육 전문가 검증 전" : p.conversation.bank_validation_status}
              </Badge>
            </>
          }
        >
          <BarList rows={p.conversation.rubric.map((r) => ({ label: r.label, value: Math.round(r.weight * 100) }))} unit="%" />
        </Panel>
        <Panel title={`TOPIK 준비도 (${p.topik.policy_version})`} description="앱 모의고사 점수로 예상 급수를 보여 줘요. 공식 TOPIK 점수가 아니에요.">
          <Dl
            items={[
              ["점수 척도", `${p.topik.score_scale} (공식 점수 아님)`],
              ["시험지 검증", p.topik.form_validation],
              ...p.topik.specs.map(
                (s) =>
                  [
                    `${s.spec_version}${s.delivered ? "" : " (아직 제공 안 함)"}`,
                    `총점 ${s.total_max} · ${s.grade_bands.map(([g, lo, hi]) => `${g}급 ${lo}–${hi}`).join(", ")}`,
                  ] as [string, string],
              ),
            ]}
          />
        </Panel>
      </div>

      <Panel title={`레벨별로 할 수 있어야 하는 것 (${p.conversation.framework_version})`}>
        <div className="hgadm-table-wrap">
          <table className="hgadm-table">
            <thead>
              <tr>
                <th>레벨</th>
                <th>이 레벨이면 할 수 있는 것</th>
                <th>필수 역량</th>
              </tr>
            </thead>
            <tbody>
              {p.conversation.levels.map((l) => (
                <tr key={l.level}>
                  <td>
                    <strong>{l.level}</strong>
                  </td>
                  <td>{l.can_do}</td>
                  <td>{l.capabilities.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="hgins-grid">
        <Panel
          title={
            <span className="hgadm-row" style={{ gap: 6 }}>
              <CheckCircle2 size={17} color="var(--ad-success)" aria-hidden /> 레벨 판정에 쓰는 활동
            </span>
          }
          description="이 활동의 결과만 실력의 근거로 써요."
        >
          <ActivityChips codes={p.provenance.eligible_activity_types} tone="success" />
        </Panel>
        <Panel
          title={
            <span className="hgadm-row" style={{ gap: 6 }}>
              <XCircle size={17} color="var(--ad-danger)" aria-hidden /> 절대 증거가 되지 않는 활동
            </span>
          }
          description="많이 했다고 레벨이 오르지는 않아요. 활동량은 실력의 근거가 아니에요."
        >
          <ActivityChips codes={p.provenance.excluded_sources} tone="neutral" />
        </Panel>
      </div>

      {v && (
        <Panel
          title={
            <>
              채점 정확도 검증{" "}
              <Badge tone="warning">{v.status === "insufficient_validation_data" ? "검증 자료 부족" : "수집 중"}</Badge>
            </>
          }
          description={v.claim.ko}
        >
          <Dl
            items={[
              ["기준 채점 수", `전체 ${v.ratings.total} · 사람 ${v.ratings.human} · 보정용 ${v.ratings.by_split.calibration ?? 0} · 검증용 ${v.ratings.by_split.validation ?? 0}`],
              ["레벨이 오른 뒤 처음 보는 과제 성공률", `${pct(v.post_promotion.success_rate)} (관찰 ${v.post_promotion.observations}회, 레벨 오른 회원 ${v.post_promotion.promoted_learners}명)`],
              ["보정·검증 자료가 섞인 경우", `회원 ${v.leakage.learners_in_both_splits.length}명 · 과제 유형 ${v.leakage.families_in_both_splits.length}개`],
            ]}
          />
          <div className="hgadm-table-wrap" style={{ marginTop: 12 }}>
            <table className="hgadm-table">
              <thead>
                <tr>
                  <th>비교 대상</th>
                  <th>표본 수</th>
                  <th>점수 완전 일치</th>
                  <th>±1점 이내</th>
                  <th>평균 차이</th>
                </tr>
              </thead>
              <tbody>
                <AgreementRow label="사람 대 사람" a={v.human_human} />
                {Object.entries(v.model_vs_human).flatMap(([model, dims]) =>
                  Object.entries(dims).map(([dim, a]) => <AgreementRow key={`${model}-${dim}`} label={`${model} · ${dim}`} a={a} />),
                )}
                {Object.entries(v.by_background_proxy).map(([k, a]) => (
                  <AgreementRow key={`bg-${k}`} label={`국적별(대리 지표) ${k}`} a={a} />
                ))}
                {Object.entries(v.by_recording_condition).map(([k, a]) => (
                  <AgreementRow key={`rc-${k}`} label={`녹음 환경 ${k}`} a={a} />
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { proficiencyAdminApi } from "../../proficiencyApi";
import type { Agreement } from "../../proficiencyApi";
import { errorMessage } from "../../../lib/http";
import { useAdminAuth } from "../../auth";
import { Badge, Dl, ErrorState, LoadingState } from "../../components/kit";

const POLICY_LABEL: Record<string, string> = {
  version: "정책 버전",
  status: "상태",
  min_independent_successes: "역량별 최소 독립 성공",
  min_situations: "최소 상황 수",
  min_study_days: "최소 학습일 수",
  min_day_separation_hours: "학습일 구분 최소 간격(시간)",
  delayed_check_hours: "지연 확인(첫 성공 후, 시간)",
  evidence_window_days: "증거 유효 기간(일)",
  integrative_min_role_plays: "종합 평가 역할극 수(서로 다른 상황)",
  integrative_min_complementary: "종합 평가 보완 과제 수",
  integrative_min_overall: "종합 평가 가중 평균 최소",
  integrative_min_role_play_core: "역할극 과제 수행·듣기 상호작용 최소",
  integrative_min_other_dimension: "그 밖의 평가 차원 최소",
  capability_success_rating: "역량 성공으로 보는 점수",
  checklist_version: "승급 요건 체크리스트 버전",
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

/** 판정 기준·검증 — the policy actually in force, and how far it is validated. */
export function ProficiencyPolicyPage() {
  const { can } = useAdminAuth();
  const policy = useQuery({ queryKey: ["admin", "proficiency", "policy"], queryFn: proficiencyAdminApi.policy });
  const validation = useQuery({
    queryKey: ["admin", "proficiency", "validation"],
    queryFn: proficiencyAdminApi.validation,
    enabled: can("analytics:read"),
  });
  if (policy.isLoading) return <LoadingState />;
  if (policy.isError) return <ErrorState message={errorMessage(policy.error)} onRetry={() => policy.refetch()} />;
  const p = policy.data!;
  const v = validation.data;
  return (
    <div>
      <div className="hgadm-page-head">
        <div>
          <h1>판정 기준·검증</h1>
          <div className="hgadm-page-head__desc">
            지금 서버가 적용하는 판정 기준입니다. 숫자 기준은 모두 검증 전의 잠정 운영 정책이며 과학적으로 입증된 값이
            아닙니다. 상세 설명은 운영 매뉴얼 <code>{p.manual}</code>을 참고하세요.
          </div>
        </div>
      </div>

      <div className="hgadm-grid-2">
        <div className="hgadm-card">
          <h3 className="hgadm-card__title">회화 승급 정책</h3>
          <Dl items={Object.entries(p.conversation.policy).map(([k, val]) => [POLICY_LABEL[k] ?? k, String(val)])} />
        </div>
        <div className="hgadm-card">
          <h3 className="hgadm-card__title">루브릭 {p.conversation.rubric_version}</h3>
          <Dl items={p.conversation.rubric.map((r) => [r.label, `${Math.round(r.weight * 100)}%`])} />
          <p className="hgadm-cell-sub">
            과제 뱅크 {p.conversation.bank_version} ·{" "}
            <Badge tone="warning">{p.conversation.bank_validation_status === "unvalidated" ? "교육 전문가 검증 전" : p.conversation.bank_validation_status}</Badge>
          </p>
        </div>
      </div>

      <div className="hgadm-card">
        <h3 className="hgadm-card__title">레벨별 필수 역량 ({p.conversation.framework_version})</h3>
        <table className="hgadm-table">
          <thead>
            <tr>
              <th>레벨</th>
              <th>할 수 있는 것</th>
              <th>필수 역량</th>
            </tr>
          </thead>
          <tbody>
            {p.conversation.levels.map((l) => (
              <tr key={l.level}>
                <td>{l.level}</td>
                <td>{l.can_do}</td>
                <td>{l.capabilities.join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="hgadm-grid-2">
        <div className="hgadm-card">
          <h3 className="hgadm-card__title">TOPIK 준비도 ({p.topik.policy_version})</h3>
          <Dl
            items={[
              ["점수 척도", `${p.topik.score_scale} (공식 점수 아님)`],
              ["양식 검증", p.topik.form_validation],
              ...p.topik.specs.map(
                (s) =>
                  [
                    `${s.spec_version}${s.delivered ? "" : " (미제공)"}`,
                    `총점 ${s.total_max} · ${s.grade_bands.map(([g, lo, hi]) => `${g}급 ${lo}–${hi}`).join(", ")}`,
                  ] as [string, string],
              ),
            ]}
          />
        </div>
        <div className="hgadm-card">
          <h3 className="hgadm-card__title">증거로 인정하는 활동</h3>
          <p>{p.provenance.eligible_activity_types.join(", ")}</p>
          <h3 className="hgadm-card__title">절대 증거가 되지 않는 활동</h3>
          <p className="hgadm-cell-sub">{p.provenance.excluded_sources.join(", ")}</p>
        </div>
      </div>

      {v && (
        <div className="hgadm-card">
          <h3 className="hgadm-card__title">
            채점기 검증 현황 <Badge tone="warning">{v.status === "insufficient_validation_data" ? "검증 자료 부족" : "수집 중"}</Badge>
          </h3>
          <p className="hgadm-cell-sub">{v.claim.ko}</p>
          <Dl
            items={[
              ["기준 채점 수", `전체 ${v.ratings.total} · 사람 ${v.ratings.human} · 보정 ${v.ratings.by_split.calibration ?? 0} · 검증 ${v.ratings.by_split.validation ?? 0}`],
              ["승급 후 미노출 과제 성공률", `${pct(v.post_promotion.success_rate)} (관찰 ${v.post_promotion.observations}, 승급자 ${v.post_promotion.promoted_learners})`],
              ["보정·검증 분할 누수", `학습자 ${v.leakage.learners_in_both_splits.length} · 과제 유형 ${v.leakage.families_in_both_splits.length}`],
            ]}
          />
          <table className="hgadm-table">
            <thead>
              <tr>
                <th>비교</th>
                <th>n</th>
                <th>정확 일치</th>
                <th>±1 일치</th>
                <th>평균 절대 차</th>
              </tr>
            </thead>
            <tbody>
              <AgreementRow label="사람 대 사람" a={v.human_human} />
              {Object.entries(v.model_vs_human).flatMap(([model, dims]) =>
                Object.entries(dims).map(([dim, a]) => <AgreementRow key={`${model}-${dim}`} label={`${model} · ${dim}`} a={a} />),
              )}
              {Object.entries(v.by_background_proxy).map(([k, a]) => (
                <AgreementRow key={`bg-${k}`} label={`국적(대리 지표) ${k}`} a={a} />
              ))}
              {Object.entries(v.by_recording_condition).map(([k, a]) => (
                <AgreementRow key={`rc-${k}`} label={`녹음 조건 ${k}`} a={a} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

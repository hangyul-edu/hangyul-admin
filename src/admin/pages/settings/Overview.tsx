import { ChevronRight, ShieldCheck } from "lucide-react";
import type { SettingsPageData } from "../../api";
import { STATUS_TEXT, type Status } from "./model";
import { StatusDot } from "./StatusBadges";

const COUNTED: Status[] = ["active", "incomplete", "off", "not_configured"];

/** Right column with nothing selected: counts, what needs attention, and the ground rules. */
export function Overview({
  data,
  canEdit,
  onSelect,
}: {
  data: SettingsPageData;
  canEdit: boolean;
  onSelect: (id: string) => void;
}) {
  const all = data.groups.flatMap((g) => g.integrations).filter((i) => i.status !== "settings");
  const count = (s: Status) => all.filter((i) => i.status === s).length;
  const needsAttention = all.filter((i) => i.status === "incomplete");
  return (
    <div className="hgadm-cfg__panel hgadm-cfg__overview">
      <h2 className="hgadm-cfg__panel-title">한눈에 보기</h2>
      <div className="hgadm-cfg__stats">
        {COUNTED.map((s) => (
          <div key={s} className={`hgadm-cfg__stat hgadm-cfg__stat--${s}`}>
            <span className="hgadm-cfg__stat-num">{count(s)}</span>
            <span className="hgadm-cfg__stat-label">
              <StatusDot status={s} /> {STATUS_TEXT[s]}
            </span>
          </div>
        ))}
      </div>
      {needsAttention.length > 0 && (
        <div className="hgadm-cfg__attention">
          <strong>확인이 필요한 연동</strong>
          {needsAttention.map((i) => (
            <button key={i.id} type="button" className="hgadm-cfg__link" onClick={() => onSelect(i.id)}>
              {i.name} — 켜져 있지만 필수 값이 비어 있습니다 <ChevronRight size={14} aria-hidden />
            </button>
          ))}
        </div>
      )}
      <p className="hgadm-cfg__hint-line">
        <span className="hgadm-cfg__only-wide">왼쪽 목록</span>
        <span className="hgadm-cfg__only-narrow">위 목록</span>에서 항목을 고르면 키를 입력하고 연결을 테스트할 수 있습니다.
        {!canEdit && " 현재 계정은 조회만 할 수 있습니다 (settings:write 필요)."}
      </p>

      <h3 className="hgadm-cfg__subhead">알아 두기</h3>
      <ul className="hgadm-cfg__facts-list">
        <li>
          <strong>우선순위</strong> — 이 화면에서 저장한 값이 서버의 .env보다 우선하고, 둘 다 없으면 기본값을 씁니다.
        </li>
        <li>
          <strong>비밀 값</strong> — API 키와 토큰은 암호화해 저장하고 끝 네 자리만 보여 줍니다. 입력칸을 비워 두면 기존 값이
          그대로 유지됩니다.
        </li>
        <li>
          <strong>켜기/끄기</strong> — 꺼도 입력한 키는 지워지지 않습니다. 끄면 모의 동작이나 대체 수단으로 바뀝니다.
        </li>
        <li>
          <ShieldCheck size={14} strokeWidth={2} aria-hidden />{" "}
          {data.encryption_key_source === "env"
            ? "암호화 키: 서버의 SETTINGS_ENCRYPTION_KEY를 사용합니다."
            : "암호화 키가 JWT_SECRET에서 만들어집니다. 운영 서버에서는 SETTINGS_ENCRYPTION_KEY를 따로 설정하세요 (JWT_SECRET을 바꾸면 비밀 값을 다시 입력해야 합니다)."}
        </li>
      </ul>

      <h3 className="hgadm-cfg__subhead">서버 정보 (여기서 바꿀 수 없음)</h3>
      <dl className="hgadm-cfg__facts">
        <dt>실행 환경</dt>
        <dd>{data.environment.app_env}</dd>
        <dt>데이터베이스</dt>
        <dd className="hgadm-cell-mono">{data.environment.database}</dd>
      </dl>
      <p className="hgadm-cfg__muted-small">
        데이터베이스 주소, JWT_SECRET, SETTINGS_ENCRYPTION_KEY는 서버 환경 변수로만 바꿀 수 있습니다. AI 기능별 켜기/끄기와 예산은
        &lsquo;AI 운영·튜터 품질&rsquo;, 학습 알림 시각은 &lsquo;알림 설정&rsquo;에서 관리합니다.
      </p>
    </div>
  );
}

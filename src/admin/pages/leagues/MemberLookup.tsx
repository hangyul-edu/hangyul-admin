import { Link } from "react-router-dom";
import { ChevronRight, Search } from "lucide-react";
import type { AdminMemberLookupResult } from "../../api";
import { errorMessage } from "../../../lib/http";
import { Badge, EmptyState, ErrorState, LoadingState, SearchBox } from "../../components/kit";
import { TierChip } from "../../components/TierChip";
import { personDetails, personName } from "../../lib/adminIdentity";
import { leagueName, leaguePeriod } from "../../lib/leagueNames";
import { useUrlFilters } from "../../lib/urlFilters";
import { BandBadge, leaguePath } from "./parts";
import { useMemberLookup } from "./queries";

/**
 * "Which league is this person in?"
 *
 * Searching the league list by name was answering a question nobody asks —
 * there are ten leagues and they are all on screen. The question an admin
 * actually arrives with is about a person, so the search is over accounts and
 * the answer is their placement. Not being placed is an answer too, with the
 * queue it belongs to one click away.
 */
export function MemberLookup() {
  const filters = useUrlFilters();
  const term = filters.value("member");
  const query = useMemberLookup(term);

  return (
    <div className="hgadm-card hgadm-section">
      <div className="hgadm-card__head">
        <div>
          <div className="hgadm-card__title">회원 소속 리그 찾기</div>
          <div className="hgadm-cell-sub hgadm-mt-4">
            회원을 검색하면 이번 주 어느 리그에 속해 있는지 확인할 수 있습니다.
          </div>
        </div>
      </div>
      <div className="hgadm-toolbar">
        <SearchBox
          value={term}
          placeholder="회원 이름·닉네임·이메일 검색"
          onSearch={(next) => filters.patch({ member: next })}
        />
      </div>

      {term.trim().length > 0 && (
        <div className="hgadm-lookup">
          {query.isPending ? (
            <LoadingState />
          ) : query.isError ? (
            <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
          ) : query.data.items.length === 0 ? (
            <EmptyState
              icon={<Search size={28} strokeWidth={1.75} />}
              title="일치하는 회원이 없습니다"
              desc="이름·닉네임·이메일의 일부로 다시 검색해 보세요."
            />
          ) : (
            <>
              {/* Several matches are listed rather than resolved by guessing:
                  two people can share a name, and picking one silently would
                  be worse than asking. */}
              {query.data.items.length > 1 && (
                <div className="hgadm-lookup__count">
                  {query.data.total.toLocaleString()}명이 검색되었습니다. 확인할 회원을 선택하세요.
                  {query.data.truncated && " 결과가 많아 일부만 표시합니다."}
                </div>
              )}
              <div className="hgadm-lookup__list">
                {query.data.items.map((result) => (
                  <LookupResult key={result.user_id} result={result} />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** One matched account, and where it stands. */
function LookupResult({ result }: { result: AdminMemberLookupResult }) {
  const details = personDetails(result);
  return (
    <div className="hgadm-lookup__row">
      <div className="hgadm-lookup__who">
        <Link to={`/users/${encodeURIComponent(result.user_id)}`} className="hgadm-lookup__name">
          {personName(result)}
        </Link>
        {details.length > 0 && <div className="hgadm-cell-sub hgadm-truncate">{details.join(" · ")}</div>}
      </div>
      {result.assignment ? <Placement league={result.assignment} /> : <NotPlaced />}
    </div>
  );
}

function Placement({ league }: { league: NonNullable<AdminMemberLookupResult["assignment"]> }) {
  return (
    <Link className="hgadm-lookup__league" to={leaguePath(league.season_id, league.group_id)}>
      <span className="hgadm-lookup__league-name">
        {leagueName(league.tier, league.group_ordinal)}
        <TierChip tier={league.tier} />
      </span>
      <span className="hgadm-lookup__stats">
        <span className="hgadm-fact">
          <span className="hgadm-fact__label">순위</span>
          <span className="hgadm-fact__value">
            {league.rank} / {league.participants}
          </span>
        </span>
        <span className="hgadm-fact">
          <span className="hgadm-fact__label">포인트</span>
          <span className="hgadm-fact__value">{league.points.toLocaleString()}</span>
        </span>
        <BandBadge band={league.band} />
      </span>
      <span className="hgadm-lookup__period">
        {league.season_name} · {leaguePeriod(league.starts_at, league.ends_at)}
      </span>
      <ChevronRight size={18} strokeWidth={2.25} className="hgadm-lookup__chevron" />
    </Link>
  );
}

function NotPlaced() {
  return (
    <div className="hgadm-lookup__none">
      <Badge tone="warning" dot>
        미배정
      </Badge>
      <span className="hgadm-lookup__none-text">
        아직 리그에 배정되지 않았습니다. 이번 주 학습 기록이 없거나, 학습은 했지만 같은 티어에 자리가 없어 대기 중일 수
        있습니다.
      </span>
      <Link to="/leagues/unassigned" className="hgadm-lookup__link">
        리그 미배정 회원 보기
        <ChevronRight size={14} strokeWidth={2.25} />
      </Link>
    </div>
  );
}

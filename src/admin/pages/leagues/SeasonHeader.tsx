import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { AdminLeagueSeasonContext } from "../../api";
import {
  KST_ZONE,
  LEAGUE_ZONE,
  formatInZone,
  formatRemaining,
  timeRemaining,
  zoneAbbreviation,
} from "../../lib/leagueClock";

/**
 * The cycle the whole page is about, stated once above the list.
 *
 * Season and period are identical on every row of an active-league list — they
 * are what the leagues have in common, not what tells them apart — so they
 * belong here rather than repeated down two columns. The name is the member
 * app's own ("2026 가을 시즌 2주차"); the weekly key stays as small technical
 * text for support, where it is genuinely the thing you quote.
 */
export function SeasonHeader({ seasons }: { seasons: AdminLeagueSeasonContext[] }) {
  const now = useMinuteClock();
  if (seasons.length === 0) return null;
  return (
    <div className="hgadm-season">
      {seasons.map((season) => (
        <div className="hgadm-season__row" key={season.season_id}>
          <div className="hgadm-season__main">
            <div className="hgadm-season__name">
              {season.name}
              <span className="hgadm-badge hgadm-badge--success">진행 중</span>
            </div>
            <Schedule season={season} now={now} />
          </div>
          <div className="hgadm-season__stats">
            <SeasonStat label="리그" value={season.league_count} />
            <SeasonStat label="참가자" value={season.participant_count} />
            {/* Not a statistic but a queue: everybody without a league, and
                a way straight to them. Both reasons are pooled here — the
                page behind the link is what splits 휴면 from 배정 대기. */}
            <Link to="/leagues/unassigned" className="hgadm-season__waiting">
              <span className="hgadm-season__stat-label">리그 미배정</span>
              <span className="hgadm-season__stat-value">
                {season.unassigned_count.toLocaleString()}
                <ChevronRight size={16} strokeWidth={2.25} />
              </span>
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * "Now", refreshed each minute. The remaining time is the one value that goes
 * stale while the page sits open, so it is recomputed rather than fixed at
 * fetch time.
 */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function SeasonStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="hgadm-season__stat">
      <span className="hgadm-season__stat-label">{label}</span>
      <span className="hgadm-season__stat-value">{value.toLocaleString()}</span>
    </div>
  );
}

/**
 * When the week opens and closes, on both clocks.
 *
 * The league is *operated* on US Eastern time — the weeks are cut and settled
 * against those instants — so ET leads each row and is labelled as the basis,
 * with Korean time beside it because that is what the team reads. The zone
 * abbreviation comes from the instant itself, so a week that opens on EST and
 * closes on EDT says so rather than averaging the two.
 */
function Schedule({ season, now }: { season: AdminLeagueSeasonContext; now: Date }) {
  const remaining = timeRemaining(season.ends_at, now);
  const rows: [string, string][] = [
    ["시작", season.starts_at],
    ["종료", season.ends_at],
  ];
  return (
    <div className="hgadm-schedule">
      <div className="hgadm-schedule__basis">
        운영 기준 <strong>미국 동부 시간(ET)</strong>
      </div>
      {rows.map(([label, at]) => (
        <div className="hgadm-schedule__row" key={label}>
          <span className="hgadm-schedule__label">{label}</span>
          <span className="hgadm-schedule__et">
            {formatInZone(at, LEAGUE_ZONE)}
            <span className="hgadm-schedule__zone">{zoneAbbreviation(at, LEAGUE_ZONE)}</span>
          </span>
          <span className="hgadm-schedule__kst">한국 {formatInZone(at, KST_ZONE)}</span>
        </div>
      ))}
      <div className="hgadm-schedule__row">
        <span className="hgadm-schedule__label">남은 시간</span>
        <span className={`hgadm-schedule__remaining ${remaining.ended ? "is-ended" : ""}`}>
          {formatRemaining(remaining)}
        </span>
      </div>
    </div>
  );
}

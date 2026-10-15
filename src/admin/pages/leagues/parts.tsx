import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Badge } from "../../components/kit";
import type { AdminLeagueSeasonContext } from "../../api";
import { KST_ZONE, LEAGUE_ZONE, periodInZone, zoneAbbreviation } from "../../lib/leagueClock";

/**
 * A "league" in the portal is what a member competes in: 5 to 30 members
 * inside one tier of one weekly season. A season is not itself rankable — it
 * holds many groups across five tiers — so a league is identified by its
 * season *and* its group, which is why the detail route carries both.
 */
const BAND_LABEL: Record<string, string> = {
  promote: "승급권",
  maintain: "유지",
  demote: "강등권",
};

const BAND_TONE: Record<string, "success" | "neutral" | "danger"> = {
  promote: "success",
  maintain: "neutral",
  demote: "danger",
};

/** Where a member stands this week: heading up, staying, or heading down. */
export function BandBadge({ band }: { band: string }) {
  return <Badge tone={BAND_TONE[band] ?? "neutral"}>{BAND_LABEL[band] ?? band}</Badge>;
}

/** The route of one league's standings. */
export function leaguePath(seasonId: string, groupId: string): string {
  return `/leagues/${encodeURIComponent(seasonId)}/${encodeURIComponent(groupId)}`;
}

/** The back link the league sub-pages share. */
export function BackToLeagues() {
  return (
    <div className="hgadm-row hgadm-mb-4">
      <Link to="/leagues" className="hgadm-muted hgadm-row hgadm-text-sm hgadm-row--tight">
        <ArrowLeft size={14} strokeWidth={2} />
        진행 중인 리그
      </Link>
    </div>
  );
}

/**
 * The league week on both clocks, labelled.
 *
 * The league is cut on US Eastern time; every other timestamp in the portal is
 * Korean. Showing the period as a bare range beside a Korean "last studied"
 * column leaves the reader unable to tell which clock either is on — so both
 * are stated, each with its zone named.
 */
export function PeriodInBothZones({ season }: { season: AdminLeagueSeasonContext }) {
  return (
    <div className="hgadm-zones">
      <div className="hgadm-zones__row">
        <span className="hgadm-zones__label">
          리그 기간 <strong>ET</strong>
        </span>
        <span className="hgadm-zones__value">
          {periodInZone(season.starts_at, season.ends_at, LEAGUE_ZONE)}
          <span className="hgadm-schedule__zone">{zoneAbbreviation(season.starts_at, LEAGUE_ZONE)}</span>
        </span>
      </div>
      <div className="hgadm-zones__row">
        <span className="hgadm-zones__label">
          한국 시간 <strong>KST</strong>
        </span>
        <span className="hgadm-zones__value hgadm-zones__value--muted">
          {periodInZone(season.starts_at, season.ends_at, KST_ZONE)}
        </span>
      </div>
    </div>
  );
}

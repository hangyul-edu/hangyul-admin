/**
 * The tier, in the tier's own colour.
 *
 * The badge palette could only approximate the ladder — two of the five came
 * out the same "warning" amber — which defeats the point of a colour that is
 * meant to be recognised at a glance. This borrows the app's colour directly
 * and puts the text on a tint of it, so the five tiers are five colours here
 * exactly as they are in the app.
 *
 * Shared rather than per-page: the league screens and the user detail page all
 * show a tier, and a portal where the same tier was a chip in one place and a
 * raw `green` in another is a portal that looks unfinished.
 */
import { tierColor, tierName } from "../lib/leagueNames";

export function TierChip({ tier }: { tier: string }) {
  const color = tierColor(tier);
  return (
    <span
      className="hgadm-tier"
      style={
        color
          ? { color, background: `${color}1f`, borderColor: `${color}59` }
          : undefined
      }
    >
      <span className="hgadm-tier__dot" style={color ? { background: color } : undefined} />
      {tierName(tier)}
    </span>
  );
}

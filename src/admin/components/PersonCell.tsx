import type { ReactNode } from "react";
import { personDetails, personName, type NamedPerson } from "../lib/adminIdentity";

/**
 * A person in a table cell: the name, with nickname and email beneath it.
 *
 * The portal-wide convention (lib/adminIdentity): the name leads, and a long
 * address sits on the second line where it cannot displace the identity.
 * `badge` follows the name on its line (a re-registration count, say).
 * `truncate` cuts the second line to one line, for narrow columns.
 */
export function PersonCell({
  person,
  badge,
  truncate = true,
}: {
  person: NamedPerson & { nickname?: string | null };
  badge?: ReactNode;
  truncate?: boolean;
}) {
  const details = personDetails(person);
  return (
    <div>
      <div className="hgadm-cell-main">
        {personName(person)}
        {badge && <> {badge}</>}
      </div>
      {details.length > 0 && (
        <div className={truncate ? "hgadm-cell-sub hgadm-truncate" : "hgadm-cell-sub"}>{details.join(" · ")}</div>
      )}
    </div>
  );
}

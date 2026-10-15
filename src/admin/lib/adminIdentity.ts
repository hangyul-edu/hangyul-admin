/**
 * How a person is named in the admin portal.
 *
 * The name leads. A column of addresses that all share one domain is far
 * harder to scan than a column of names, and the name is what an operator
 * recognises. The email stays available wherever the extra certainty is worth
 * the space — modals, confirmations, detail views — because two people can
 * share a name and an irreversible action should not rest on that.
 *
 * Both helpers take the same loose shape so every caller can pass whatever it
 * holds: an admin account, an audit row's actor, a member record. Whatever is
 * missing simply falls through, and the last resort is an em dash rather than
 * an empty cell. A `user_id` is never displayed — internal ids stay off screen.
 */
export type NamedPerson = {
  name?: string | null;
  email?: string | null;
  user_id?: string | null;
};

function firstNonEmpty(...values: (string | null | undefined)[]): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/**
 * The compact identifier: the name, or the best thing left.
 *
 * For tables and any place a single short label has to do. An account with no
 * name shows its email rather than a blank — the row still has to identify
 * someone.
 */
export function personName(person: NamedPerson | null | undefined): string {
  if (!person) return "—";
  // An account known only by its id (deleted, or never given a name or
  // email) still reads as someone; the id itself is internal, never shown.
  return firstNonEmpty(person.name, person.email) ?? (person.user_id?.trim() ? UNNAMED_ACCOUNT : "—");
}

/** The label for an account with neither a name nor an email. */
export const UNNAMED_ACCOUNT = "(이름 없는 계정)";

/**
 * `Name (email@example.com)` — the identifier plus its proof.
 *
 * Used where being sure matters more than being brief. The parenthetical is
 * dropped when it would only repeat the label, so an account without a name
 * reads `someone@example.com`, never `someone@example.com (someone@example.com)`.
 */
export function personNameWithEmail(person: NamedPerson | null | undefined): string {
  if (!person) return "—";
  const label = personName(person);
  const email = person.email?.trim();
  return email && email !== label ? `${label} (${email})` : label;
}

/**
 * What goes under the name in a table cell: the nickname and the email,
 * leaving out whichever is already the label (an account without a name is
 * labelled by its email, which is then not printed twice).
 */
export function personDetails(person: NamedPerson & { nickname?: string | null }): string[] {
  const label = personName(person);
  return [person.nickname, person.email].filter(
    (part): part is string => Boolean(part?.trim()) && part !== label,
  );
}

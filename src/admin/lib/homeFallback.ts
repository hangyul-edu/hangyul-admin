/**
 * Where an admin without `users:read` (analyst, educator, content publisher)
 * lands instead of the dashboard, which needs that scope. Order is the order
 * the areas appear in the side navigation that such tiers can reach.
 */
const HOME_FALLBACKS: [scope: string, path: string][] = [
  ["analytics:read", "/learning"],
  ["content:read", "/courses"],
  ["commerce:read", "/plans"],
  ["ops:read", "/notices"],
];

/** The first area `can` allows, or null when the tier can reach none of them. */
export function homeFallback(can: (scope: string) => boolean): string | null {
  return HOME_FALLBACKS.find(([scope]) => can(scope))?.[1] ?? null;
}

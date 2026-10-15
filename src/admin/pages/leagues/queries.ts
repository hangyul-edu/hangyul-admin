import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../../api";

/** The league pages' server reads, with their cache keys kept in one place. */

const PAGE_SIZE = 25;

export function useActiveLeagues({ q, tier, page }: { q: string; tier: string; page: number }) {
  return useQuery({
    queryKey: ["admin", "leagues", { q, tier, page }],
    queryFn: () =>
      adminApi.listActiveLeagues({ q: q || undefined, tier: tier || undefined, page, page_size: PAGE_SIZE }),
  });
}

export function useLeague(seasonId: string, groupId: string, q: string) {
  return useQuery({
    queryKey: ["admin", "league", seasonId, groupId, { q }],
    queryFn: () => adminApi.getLeague(seasonId, groupId, { q: q || undefined }),
    enabled: Boolean(seasonId && groupId),
  });
}

export function useUnassignedMembers({
  q,
  state,
  idleLastWeek,
  page,
}: {
  q: string;
  state: string;
  idleLastWeek: boolean;
  page: number;
}) {
  return useQuery({
    queryKey: ["admin", "leagues", "unassigned", { q, state, idleLastWeek, page }],
    queryFn: () =>
      adminApi.listUnassignedMembers({
        q: q || undefined,
        state: state || undefined,
        idle_last_week: idleLastWeek ? "true" : undefined,
        page,
        page_size: PAGE_SIZE,
      }),
  });
}

/** Which league a person is in; idle until there is something to search for. */
export function useMemberLookup(term: string) {
  return useQuery({
    queryKey: ["admin", "leagues", "member-lookup", term],
    queryFn: () => adminApi.lookupMemberLeague({ q: term }),
    enabled: term.trim().length > 0,
  });
}

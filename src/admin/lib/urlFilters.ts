import { useSearchParams } from "react-router-dom";

/**
 * Filter and paging state kept in the URL.
 *
 * The admin lists put their filters in the query string so a view can be
 * linked, bookmarked and reloaded. Every list needs the same three things:
 * read a filter, read a page number, and change some filters without
 * disturbing the others.
 *
 * Changes `replace` the history entry, so filtering does not fill the back
 * stack with intermediate states.
 */
export type UrlFilters = {
  /** A filter's current value, or `fallback` when it is absent or empty. */
  value: (name: string, fallback?: string) => string;
  /** A numeric filter such as `page`, or `fallback` when unusable. */
  number: (name: string, fallback: number) => number;
  /** Apply changes; `null` or `""` removes a filter rather than blanking it. */
  patch: (changes: Record<string, string | null>) => void;
};

export function useUrlFilters(): UrlFilters {
  const [params, setParams] = useSearchParams();
  return {
    value: (name, fallback = "") => params.get(name) ?? fallback,
    number: (name, fallback) => {
      const parsed = Number(params.get(name));
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    },
    patch: (changes) => {
      const next = new URLSearchParams(params);
      for (const [name, value] of Object.entries(changes)) {
        if (value === null || value === "") next.delete(name);
        else next.set(name, value);
      }
      setParams(next, { replace: true });
    },
  };
}

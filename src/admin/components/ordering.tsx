import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { useToastError } from "../../hooks/toast";
import { Button } from "./kit";

/**
 * Display order, managed directly.
 *
 * Admins never type a "정렬 순서" number: a list is shown in the order the
 * app shows it, each row numbered by its place ("1", "2", …), and ↑ / ↓ move
 * a row one place. The move is saved at once through the item's reorder
 * endpoint (the ids of its scope, in the new order) and shown immediately;
 * if saving fails the list snaps back and the error is shown.
 */

/** The cached list a reorder rewrites — every admin list query is `{ items }`. */
type ListData<T> = { items: T[] };

/**
 * `move(scopeIds, id, -1 | 1)` swaps `id` with its neighbour inside its
 * scope (a track's courses, a course's series, …) and saves the scope's new
 * order. The cached list is rearranged in place: rows outside the scope keep
 * their slots, so a list grouped by scope does not jump around.
 */
export function useReorder<T>({
  queryKey,
  idOf,
  save,
  alsoRefresh = [],
}: {
  queryKey: QueryKey;
  idOf: (item: T) => string;
  save: (ids: string[]) => Promise<unknown>;
  /** Other queries that show the same order (e.g. a filtered copy of the list). */
  alsoRefresh?: QueryKey[];
}) {
  const qc = useQueryClient();
  const toastError = useToastError();
  const mutation = useMutation({
    mutationFn: (ids: string[]) => save(ids),
    onMutate: async (ids: string[]) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<ListData<T>>(queryKey);
      if (previous) qc.setQueryData<ListData<T>>(queryKey, { ...previous, items: placeInOrder(previous.items, ids, idOf) });
      return { previous };
    },
    onError: (error, _ids, context) => {
      if (context?.previous) qc.setQueryData(queryKey, context.previous);
      toastError(error);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey });
      for (const key of alsoRefresh) void qc.invalidateQueries({ queryKey: key });
    },
  });

  function move(scopeIds: string[], id: string, direction: -1 | 1) {
    const from = scopeIds.indexOf(id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= scopeIds.length) return;
    const ids = [...scopeIds];
    [ids[from], ids[to]] = [ids[to], ids[from]];
    mutation.mutate(ids);
  }

  return { move, saving: mutation.isPending };
}

/** Puts the scope's rows into the slots they already occupy, in `ids` order. */
function placeInOrder<T>(items: T[], ids: string[], idOf: (item: T) => string): T[] {
  const inScope = new Set(ids);
  const byId = new Map(items.map((item) => [idOf(item), item]));
  const ordered = ids.map((id) => byId.get(id)).filter((item): item is T => item !== undefined);
  let next = 0;
  return items.map((item) => (inScope.has(idOf(item)) && next < ordered.length ? ordered[next++] : item));
}

/**
 * ↑ / ↓ for one row (or ← / → for cards laid out side by side, the way the
 * app scrolls series); `name` makes the labels say which item moves.
 */
export function MoveButtons({
  name,
  index,
  count,
  onMove,
  disabled,
  axis = "vertical",
}: {
  name: string;
  index: number;
  count: number;
  onMove: (direction: -1 | 1) => void;
  disabled?: boolean;
  axis?: "vertical" | "horizontal";
}) {
  const horizontal = axis === "horizontal";
  const Back = horizontal ? ChevronLeft : ChevronUp;
  const Forward = horizontal ? ChevronRight : ChevronDown;
  return (
    <span className="hgadm-move" role="group" aria-label={`${name} 순서`}>
      <Button
        size="sm"
        variant="ghost"
        disabled={disabled || index === 0}
        onClick={(e) => {
          e.stopPropagation();
          onMove(-1);
        }}
        aria-label={`${name} ${horizontal ? "앞으로" : "위로"} 이동`}
        title={horizontal ? "한 칸 앞으로" : "한 칸 위로"}
      >
        <Back size={16} strokeWidth={2} />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={disabled || index === count - 1}
        onClick={(e) => {
          e.stopPropagation();
          onMove(1);
        }}
        aria-label={`${name} ${horizontal ? "뒤로" : "아래로"} 이동`}
        title={horizontal ? "한 칸 뒤로" : "한 칸 아래로"}
      >
        <Forward size={16} strokeWidth={2} />
      </Button>
    </span>
  );
}

/** The row's place in its list, as members see it ("1" = shown first). */
export function OrderNumber({ position }: { position: number }) {
  return (
    <span className="hgadm-order-no" aria-label={`${position}번째`}>
      {position}
    </span>
  );
}

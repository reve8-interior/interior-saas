/**
 * Move `id` one place up (-1) or down (+1) in `ids`. Returns the same array
 * when the move is impossible (already at the end, or unknown id).
 */
export function moveId(ids: string[], id: string, delta: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

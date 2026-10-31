import type { Client } from '@/lib/schemas/client';

export const UNASSIGNED_FILTER = 'unassigned';

/** Filters board clients by free-text query (name/phone/email) and designer id. */
export function filterBoardClients(
  clients: Client[],
  query: string,
  designer: string
): Client[] {
  const needle = query.trim().toLowerCase();
  return clients.filter((c) => {
    if (designer === UNASSIGNED_FILTER && c.assigned_designer_id) return false;
    if (
      designer &&
      designer !== UNASSIGNED_FILTER &&
      c.assigned_designer_id !== designer
    )
      return false;
    if (!needle) return true;
    return [c.name, ...Object.values(c.contact_info ?? {})]
      .filter(Boolean)
      .some((v) => v.toLowerCase().includes(needle));
  });
}

/** Whole days since an ISO timestamp (never negative; 0 for invalid input). */
export function daysSince(iso: string, now: Date = new Date()): number {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

/** Short "in phase" label such as "Today" or "5d". */
export function formatAge(days: number): string {
  return days <= 0 ? 'Today' : `${days}d`;
}

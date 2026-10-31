import { PHASE_ORDER } from '@/lib/constants';
import type { Client } from '@/lib/schemas/client';

export type ClientSort =
  | 'recent'
  | 'oldest'
  | 'name'
  | 'name_desc'
  | 'phase'
  | 'phase_desc';

export const CLIENT_SORT_LABELS: Record<ClientSort, string> = {
  recent: 'Recently updated',
  oldest: 'Least recently updated',
  name: 'Name A–Z',
  name_desc: 'Name Z–A',
  phase: 'Phase',
  phase_desc: 'Phase (latest first)',
};

const SORTS = Object.keys(CLIENT_SORT_LABELS) as ClientSort[];

/** Sort applied when a column header is clicked: asc, then desc, via the same key. */
export const COLUMN_SORTS = {
  name: ['name', 'name_desc'],
  phase: ['phase', 'phase_desc'],
  updated: ['recent', 'oldest'],
} as const satisfies Record<string, readonly [ClientSort, ClientSort]>;

/** Next sort when a column header is clicked: first click picks it, repeat flips it. */
export function nextColumnSort(
  column: keyof typeof COLUMN_SORTS,
  current: ClientSort
): ClientSort {
  const [first, second] = COLUMN_SORTS[column];
  return current === first ? second : first;
}

export interface ClientListParams {
  tab: 'active' | 'inactive';
  q: string;
  sort: ClientSort;
  /** Empty string means "all phases". */
  phase: string;
}

type ParamReader = { get(key: string): string | null };

/** Read list state from URL params, falling back to safe defaults. */
export function parseClientParams(params: ParamReader): ClientListParams {
  const sort = params.get('sort');
  const phase = params.get('phase') ?? '';
  return {
    tab: params.get('tab') === 'inactive' ? 'inactive' : 'active',
    q: params.get('q') ?? '',
    sort: SORTS.includes(sort as ClientSort) ? (sort as ClientSort) : 'recent',
    phase: PHASE_ORDER.includes(phase) ? phase : '',
  };
}

/** Serialise list state, omitting defaults to keep URLs short. */
export function buildClientQuery(p: ClientListParams): string {
  const out = new URLSearchParams();
  if (p.tab !== 'active') out.set('tab', p.tab);
  if (p.q.trim()) out.set('q', p.q.trim());
  if (p.sort !== 'recent') out.set('sort', p.sort);
  if (p.phase) out.set('phase', p.phase);
  return out.toString();
}

/** Filter by search text and phase, then sort. Does not mutate the input. */
export function filterSortClients(
  clients: Client[],
  { q, sort, phase }: Pick<ClientListParams, 'q' | 'sort' | 'phase'>
): Client[] {
  const needle = q.trim().toLowerCase();
  const matches = clients.filter((c) => {
    if (phase && c.current_phase !== phase) return false;
    if (!needle) return true;
    return [c.name, c.contact_info?.phone, c.contact_info?.email]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(needle));
  });
  const phaseIdx = (c: Client) => PHASE_ORDER.indexOf(c.current_phase);
  return matches.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'name_desc') return b.name.localeCompare(a.name);
    if (sort === 'phase') {
      return phaseIdx(a) - phaseIdx(b) || a.name.localeCompare(b.name);
    }
    if (sort === 'phase_desc') {
      return phaseIdx(b) - phaseIdx(a) || a.name.localeCompare(b.name);
    }
    if (sort === 'oldest') return a.updated_at.localeCompare(b.updated_at);
    return b.updated_at.localeCompare(a.updated_at);
  });
}

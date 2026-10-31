'use client';

import { type SortDir, type SortKey } from '@/lib/materials';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

// ── Sortable header ──────────────────────────────────────────────────────────
export function SortTh({
  label,
  field,
  sort,
  onSort,
}: {
  label: string;
  field: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === field;
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      aria-sort={
        active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
      }
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className="font-inherit inline-flex min-h-11 items-center gap-1 uppercase"
      >
        {label}
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </button>
    </th>
  );
}

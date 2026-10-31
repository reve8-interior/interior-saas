export interface Material {
  id: string;
  name: string;
  category: string;
  unit: string;
  unit_cost: number;
  vendor: string | null;
  updated_at: string;
}

/** A row in the import preview; cost stays text so a cleared cell is not 0. */
export interface DraftRow {
  name: string;
  category: string;
  unit: string;
  unit_cost: string;
  vendor: string | null;
}

export type SortKey = 'name' | 'category' | 'unit_cost' | 'updated_at';
export type SortDir = 'asc' | 'desc';

/** Parses a margin percent; null when blank, non-numeric or outside 0-100. */
export function parseMargin(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

/** Parses a unit cost; null when blank, non-numeric or negative. */
export function parseCost(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export interface RowIssues {
  name: boolean;
  cost: boolean;
}

/** Which required fields of an import row are missing or invalid. */
export function rowIssues(row: DraftRow): RowIssues {
  return {
    name: row.name.trim() === '',
    cost: parseCost(row.unit_cost) === null,
  };
}

export function isRowValid(row: DraftRow): boolean {
  const { name, cost } = rowIssues(row);
  return !name && !cost;
}

/** Existing values deduplicated case-insensitively, first spelling wins. */
export function distinctValues(values: string[]): string[] {
  const seen = new Map<string, string>();
  for (const v of values) {
    const t = v.trim();
    if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export function sortMaterials(
  items: Material[],
  key: SortKey,
  dir: SortDir
): Material[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    if (key === 'unit_cost') return sign * (a.unit_cost - b.unit_cost);
    if (key === 'updated_at')
      return sign * (Date.parse(a.updated_at) - Date.parse(b.updated_at));
    return (
      sign * a[key].localeCompare(b[key], undefined, { sensitivity: 'base' })
    );
  });
}

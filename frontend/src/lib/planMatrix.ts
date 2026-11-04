import { LIMIT_FIELDS } from '@/lib/planForm';
import type { PlanFields } from '@/lib/schemas/plan';

/** Plan fields that hold a whole number (or null) and can be typed into a cell. */
export type NumberKey = {
  [K in keyof PlanFields]: PlanFields[K] extends number | null ? K : never;
}[keyof PlanFields];

export type BooleanKey = {
  [K in keyof PlanFields]: PlanFields[K] extends boolean ? K : never;
}[keyof PlanFields];

export interface NumberRow {
  key: NumberKey;
  label: string;
  /** Shown when the cell is empty, which is also what an empty cell means. */
  placeholder: string;
  /** False when the API rejects null: an empty cell then saves 0. */
  nullable: boolean;
  min?: number;
  max?: number;
}

export interface BooleanRow {
  key: BooleanKey;
  label: string;
}

export interface TextRow {
  key: 'name' | 'tagline' | 'highlights';
  label: string;
  multiline: boolean;
  placeholder: string;
}

export interface MatrixSection {
  title: string;
  numbers: NumberRow[];
  booleans: BooleanRow[];
  texts?: TextRow[];
}

const limitRow = (key: NumberKey, label: string): NumberRow => ({
  key,
  label,
  placeholder: 'Unlimited',
  nullable: true,
  ...(key === 'max_image_mb' ? { min: 1, max: 100 } : {}),
});

/** Rows of the admin plan matrix, grouped the way the landing page reads. */
export const MATRIX_SECTIONS: MatrixSection[] = [
  {
    title: 'Pricing card',
    numbers: [],
    booleans: [],
    texts: [
      { key: 'name', label: 'Name', multiline: false, placeholder: '' },
      {
        key: 'tagline',
        label: 'Tagline',
        multiline: false,
        placeholder: 'None',
      },
      {
        key: 'highlights',
        label: 'Extra bullet points',
        multiline: true,
        placeholder: 'One per line',
      },
    ],
  },
  {
    title: 'Price (INR, no GST)',
    numbers: [
      {
        key: 'price_monthly_inr',
        label: 'Per month',
        placeholder: 'Free',
        nullable: true,
      },
      {
        key: 'price_yearly_inr',
        label: 'Per year',
        placeholder: 'None',
        nullable: true,
      },
    ],
    booleans: [],
  },
  {
    title: 'Limits (empty = unlimited)',
    numbers: LIMIT_FIELDS.map(({ key, label }) => limitRow(key, label)),
    booleans: [],
  },
  {
    title: 'Features',
    numbers: [],
    booleans: [
      { key: 'clean_export', label: 'Clean (no watermark) exports' },
      { key: 'branded_export', label: 'Branded exports' },
      { key: 'bulk_materials_import', label: 'Bulk materials import' },
      { key: 'priority_support', label: 'Priority support' },
    ],
  },
  {
    title: 'Website',
    numbers: [
      {
        key: 'website_templates',
        label: 'Templates',
        placeholder: '0',
        nullable: false,
        max: 100,
      },
      {
        key: 'website_max_pages',
        label: 'Max pages',
        placeholder: '0',
        nullable: false,
        max: 20,
      },
    ],
    booleans: [
      { key: 'website_enabled', label: 'Own website' },
      { key: 'website_custom_domain', label: 'Custom domain' },
      { key: 'website_remove_badge', label: 'Remove Reve8 badge' },
    ],
  },
  {
    title: 'Pricing page',
    numbers: [
      {
        key: 'sort_order',
        label: 'Order on page',
        placeholder: '0',
        nullable: false,
      },
    ],
    booleans: [
      { key: 'is_public', label: 'Show on the pricing page' },
      { key: 'is_recommended', label: 'Recommended' },
    ],
  },
];

export type CellResult =
  | { ok: true; value: number | null }
  | { ok: false; error: string };

/** Turns what was typed in a cell into the value to save, or says why not. */
export function parseCell(text: string, row: NumberRow): CellResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: row.nullable ? null : 0 };
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false, error: `${row.label} must be a whole number` };
  }
  const n = Number(trimmed);
  if (n < (row.min ?? 0) || (row.max !== undefined && n > row.max)) {
    const range =
      row.max === undefined
        ? `at least ${row.min ?? 0}`
        : `between ${row.min ?? 0} and ${row.max}`;
    return { ok: false, error: `${row.label} must be ${range}` };
  }
  return { ok: true, value: n };
}

export type TextResult =
  | { ok: true; value: string | string[] | null }
  | { ok: false; error: string };

const MAX_HIGHLIGHT = 120;

/** Turns what was typed in a text cell into the value to save, or says why not. */
export function parseText(text: string, row: TextRow): TextResult {
  const trimmed = text.trim();
  if (row.key === 'name') {
    if (!trimmed) return { ok: false, error: 'Plan name is required' };
    if (trimmed.length > 64) {
      return { ok: false, error: 'Plan name must be 64 characters or fewer' };
    }
    return { ok: true, value: trimmed };
  }
  if (row.key === 'tagline') {
    if (trimmed.length > 255) {
      return { ok: false, error: 'Tagline must be 255 characters or fewer' };
    }
    return { ok: true, value: trimmed || null };
  }
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.some((line) => line.length > MAX_HIGHLIGHT)) {
    return {
      ok: false,
      error: `Each bullet point must be ${MAX_HIGHLIGHT} characters or fewer`,
    };
  }
  return { ok: true, value: lines };
}

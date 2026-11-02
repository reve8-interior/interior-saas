import type { AdminPlan, PlanCreate } from '@/lib/schemas/plan';

/** Limits an admin can leave empty to mean unlimited. */
export const LIMIT_FIELDS = [
  { key: 'max_users', label: 'Team members' },
  { key: 'max_clients', label: 'Active clients' },
  { key: 'max_quotation_versions', label: 'Versions per quotation' },
  { key: 'max_images', label: 'Uploaded images' },
  { key: 'max_image_mb', label: 'Max image size (MB)' },
  { key: 'max_portfolio_designs', label: 'Portfolio designs' },
  { key: 'ai_credits_monthly', label: 'AI credits per month' },
] as const;

export const FLAG_FIELDS = [
  { key: 'clean_export', label: 'Clean (no watermark) exports' },
  { key: 'branded_export', label: 'Branded exports' },
  { key: 'bulk_materials_import', label: 'Bulk materials import' },
  { key: 'priority_support', label: 'Priority support' },
] as const;

type LimitKey = (typeof LIMIT_FIELDS)[number]['key'];
type FlagKey = (typeof FLAG_FIELDS)[number]['key'];

export type PlanFormState = {
  slug: string;
  name: string;
  tagline: string;
  sort_order: string;
  price_monthly_inr: string;
  price_yearly_inr: string;
  is_public: boolean;
  is_recommended: boolean;
  highlights: string; // one per line
} & Record<LimitKey, string> &
  Record<FlagKey, boolean>;

export const EMPTY_PLAN_FORM: PlanFormState = {
  slug: '',
  name: '',
  tagline: '',
  sort_order: '0',
  price_monthly_inr: '',
  price_yearly_inr: '',
  is_public: true,
  is_recommended: false,
  highlights: '',
  max_users: '',
  max_clients: '',
  max_quotation_versions: '',
  max_images: '',
  max_image_mb: '',
  max_portfolio_designs: '',
  ai_credits_monthly: '',
  clean_export: false,
  branded_export: false,
  bulk_materials_import: false,
  priority_support: false,
};

const text = (n: number | null): string => (n === null ? '' : String(n));

export function planFormFor(plan: AdminPlan | null): PlanFormState {
  if (!plan) return EMPTY_PLAN_FORM;
  return {
    slug: plan.slug,
    name: plan.name,
    tagline: plan.tagline ?? '',
    sort_order: String(plan.sort_order),
    price_monthly_inr: text(plan.price_monthly_inr),
    price_yearly_inr: text(plan.price_yearly_inr),
    is_public: plan.is_public,
    is_recommended: plan.is_recommended,
    highlights: plan.highlights.join('\n'),
    max_users: text(plan.max_users),
    max_clients: text(plan.max_clients),
    max_quotation_versions: text(plan.max_quotation_versions),
    max_images: text(plan.max_images),
    max_image_mb: text(plan.max_image_mb),
    max_portfolio_designs: text(plan.max_portfolio_designs),
    ai_credits_monthly: text(plan.ai_credits_monthly),
    clean_export: plan.clean_export,
    branded_export: plan.branded_export,
    bulk_materials_import: plan.bulk_materials_import,
    priority_support: plan.priority_support,
  };
}

/** Empty -> null (unlimited); otherwise a whole number of 0 or more, or NaN. */
function parseCount(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
}

export type PlanFormResult =
  | { ok: true; payload: PlanCreate }
  | { ok: false; error: string };

/** Validates the form and converts it to the API payload. */
export function planPayload(
  form: PlanFormState,
  editing: boolean
): PlanFormResult {
  if (!form.name.trim()) return { ok: false, error: 'Plan name is required' };
  if (!editing && !/^[a-z][a-z0-9_]{1,31}$/.test(form.slug.trim())) {
    return {
      ok: false,
      error: 'Slug: 2-32 characters, lowercase letters, digits and _',
    };
  }

  const limits: Partial<Record<LimitKey, number | null>> = {};
  for (const { key, label } of LIMIT_FIELDS) {
    const n = parseCount(form[key]);
    if (Number.isNaN(n)) {
      return {
        ok: false,
        error: `${label} must be a whole number, or empty for unlimited`,
      };
    }
    limits[key] = n;
  }
  if (
    limits.max_image_mb != null &&
    (limits.max_image_mb < 1 || limits.max_image_mb > 100)
  ) {
    return { ok: false, error: 'Max image size must be 1-100 MB' };
  }

  const monthly = parseCount(form.price_monthly_inr);
  const yearly = parseCount(form.price_yearly_inr);
  if (Number.isNaN(monthly) || Number.isNaN(yearly)) {
    return { ok: false, error: 'Prices must be whole rupees, or empty' };
  }
  const sort = parseCount(form.sort_order);
  if (sort === null || Number.isNaN(sort)) {
    return { ok: false, error: 'Order must be a whole number' };
  }

  const highlights = form.highlights
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (highlights.some((h) => h.length > 120)) {
    return {
      ok: false,
      error: 'Each highlight must be 120 characters or fewer',
    };
  }

  return {
    ok: true,
    payload: {
      slug: form.slug.trim(),
      name: form.name.trim(),
      tagline: form.tagline.trim() || null,
      sort_order: sort,
      price_monthly_inr: monthly,
      price_yearly_inr: yearly,
      is_public: form.is_public,
      is_recommended: form.is_recommended,
      highlights,
      ...limits,
      clean_export: form.clean_export,
      branded_export: form.branded_export,
      bulk_materials_import: form.bulk_materials_import,
      priority_support: form.priority_support,
    },
  };
}

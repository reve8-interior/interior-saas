import { formatLimit } from '@/lib/plans';
import type { PublicPlan } from '@/lib/schemas/plan';

const plural = (n: number | null, one: string, many: string): string =>
  `${formatLimit(n)} ${n === 1 ? one : many}`;

/** The bullet list on a pricing card: numbers first, then features. */
export function planFeatureLines(plan: PublicPlan): string[] {
  const lines = [
    plural(plan.max_users, 'team member', 'team members'),
    plural(plan.max_clients, 'active client', 'active clients'),
    plural(plan.ai_credits_monthly, 'AI credit / month', 'AI credits / month'),
    plural(
      plan.max_quotation_versions,
      'version per quotation',
      'versions per quotation'
    ),
    plural(plan.max_images, 'uploaded image', 'uploaded images'),
    plural(plan.max_portfolio_designs, 'portfolio design', 'portfolio designs'),
  ];
  if (plan.clean_export) lines.push('Clean exports');
  if (plan.branded_export) lines.push('Your branding on exports');
  if (plan.bulk_materials_import) lines.push('Bulk materials import');
  if (plan.priority_support) lines.push('Priority support');
  // Admin highlights may repeat a built-in line (e.g. "Clean exports"); keep the first.
  const seen = new Set<string>();
  return [...lines, ...plan.highlights].filter((line) => {
    const key = line.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

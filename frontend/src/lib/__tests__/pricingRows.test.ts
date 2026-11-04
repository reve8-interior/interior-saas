import { describe, expect, it } from 'vitest';
import { planFeatureLines } from '@/lib/pricingRows';
import type { PublicPlan } from '@/lib/schemas/plan';

const plan = (changes: Partial<PublicPlan>): PublicPlan => ({
  slug: 'x',
  name: 'X',
  tagline: null,
  is_recommended: false,
  price_monthly_inr: 499,
  price_yearly_inr: 4990,
  max_users: 3,
  max_clients: 25,
  max_quotation_versions: 10,
  max_images: 300,
  max_portfolio_designs: 50,
  ai_credits_monthly: 50,
  clean_export: false,
  branded_export: false,
  bulk_materials_import: false,
  priority_support: false,
  website_enabled: false,
  website_custom_domain: false,
  website_remove_badge: false,
  highlights: [],
  ...changes,
});

describe('planFeatureLines', () => {
  it('leads with the numbers and says unlimited for null limits', () => {
    const lines = planFeatureLines(plan({ max_clients: null }));
    expect(lines[0]).toBe('3 team members');
    expect(lines).toContain('Unlimited active clients');
  });

  it('uses the singular for one', () => {
    expect(planFeatureLines(plan({ max_users: 1 }))[0]).toBe('1 team member');
  });

  it('adds feature flags, then admin highlights, in order', () => {
    const lines = planFeatureLines(
      plan({ clean_export: true, priority_support: true, highlights: ['Hi'] })
    );
    expect(lines.slice(-3)).toEqual([
      'Clean exports',
      'Priority support',
      'Hi',
    ]);
    expect(lines).not.toContain('Bulk materials import');
  });

  it('lists the website only on plans that include it', () => {
    expect(planFeatureLines(plan({}))).not.toContain('Your own website');
    const lines = planFeatureLines(
      plan({ website_enabled: true, website_custom_domain: true })
    );
    expect(lines).toContain('Your own website');
    expect(lines).toContain('Custom domain for your website');
    expect(lines).not.toContain('Website without Reve8 badge');
  });

  it('drops admin highlights that duplicate a built-in line', () => {
    const lines = planFeatureLines(
      plan({ clean_export: true, highlights: ['clean exports', 'Hi'] })
    );
    expect(lines.filter((l) => /clean exports/i.test(l))).toHaveLength(1);
    expect(lines).toContain('Hi');
  });
});

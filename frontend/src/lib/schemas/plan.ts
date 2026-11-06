/** Fields an admin can edit on a plan; a null limit is unlimited. */
export interface PlanFields {
  name: string;
  tagline: string | null;
  is_public: boolean;
  is_recommended: boolean;
  sort_order: number;
  price_monthly_inr: number | null;
  price_yearly_inr: number | null;
  max_users: number | null;
  max_clients: number | null;
  max_quotation_versions: number | null;
  max_images: number | null;
  max_image_mb: number | null;
  max_portfolio_designs: number | null;
  ai_credits_monthly: number | null;
  clean_export: boolean;
  branded_export: boolean;
  bulk_materials_import: boolean;
  priority_support: boolean;
  website_enabled: boolean;
  website_templates: number;
  website_max_pages: number;
  website_custom_domain: boolean;
  website_remove_badge: boolean;
  highlights: string[];
}

export interface AdminPlan extends PlanFields {
  id: string;
  slug: string;
  razorpay_plan_id_monthly: string | null;
  razorpay_plan_price_inr: number | null;
}

export type PlanCreate = Partial<PlanFields> & { slug: string; name: string };

export type PlanUpdate = Partial<PlanFields>;

/** What the landing page may show. */
export type PublicPlan = Pick<
  AdminPlan,
  | 'slug'
  | 'name'
  | 'tagline'
  | 'is_recommended'
  | 'price_monthly_inr'
  | 'price_yearly_inr'
  | 'max_users'
  | 'max_clients'
  | 'max_quotation_versions'
  | 'max_images'
  | 'max_portfolio_designs'
  | 'ai_credits_monthly'
  | 'clean_export'
  | 'branded_export'
  | 'bulk_materials_import'
  | 'priority_support'
  | 'website_enabled'
  | 'website_custom_domain'
  | 'website_remove_badge'
  | 'highlights'
>;

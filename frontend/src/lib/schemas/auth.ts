export interface LoginResponse {
  access_token: string;
  token_type: string;
  user_id: string;
  email: string;
  role: 'superadmin' | 'admin' | 'designer' | 'viewer';
}

export interface AuthUser {
  id: string;
  email: string;
  full_name: string | null;
  roles: string[];
}

/** A plan slug, e.g. 'free', 'solo', 'studio', 'studio_pro'. */
export type Plan = string;

/** One limit with how much of it is used; a null limit is unlimited. */
export interface UsageMeter {
  key: string;
  label: string;
  used: number;
  limit: number | null;
}

/** A business's effective limits: its overrides over its plan. */
export interface PlanLimits {
  plan: Plan;
  plan_name: string;
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
}

export interface AccessStatus {
  plan: Plan;
  expires_at: string | null;
  days_left: number | null;
  warning_days: number;
  expired: boolean;
}

/** Whether AI extraction can run; a null limit means no monthly cap. */
export interface AiStatus {
  enabled: boolean;
  monthly_limit: number | null;
  remaining: number | null;
}

export interface UserMe {
  id: string;
  email: string;
  full_name: string;
  role: 'superadmin' | 'admin' | 'designer' | 'viewer';
  must_change_password: boolean;
  business_name: string | null;
  access: AccessStatus;
  ai: AiStatus;
  limits: PlanLimits | null;
  usage: UsageMeter[];
}

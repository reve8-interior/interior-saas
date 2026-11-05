import type { Plan, PlanLimits, UsageMeter } from '@/lib/schemas/auth';

export interface Business {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  is_active: boolean;
  created_at: string;
  user_count: number;
  plan: Plan;
  plan_name: string;
  ai_credit_bonus: number;
  access_expires_at: string | null;
  warning_days: number;
  /** Overrides set on this business; null follows the plan. */
  max_users: number | null;
  max_images: number | null;
  max_image_mb: number | null;
  max_clients: number | null;
  max_quotation_versions: number | null;
  max_portfolio_designs: number | null;
  /** What actually applies: overrides over the plan. */
  limits: PlanLimits | null;
  usage: UsageMeter[];
  seats_used: number;
  image_count: number;
  days_left: number | null;
  access_expired: boolean;
  has_openai_key: boolean;
  /** Only on the create response: the generated admin password, shown once. */
  temporary_password?: string | null;
  /** Only on the create response: the admin was emailed an invite link. */
  invite_sent?: boolean;
  openai_key_last4: string | null;
  openai_key_updated_at: string | null;
  openai_chat_model: string | null;
  openai_whisper_model: string | null;
}

export interface BusinessCreate {
  name: string;
  contact_email?: string | null;
  contact_phone?: string | null;
  plan?: Plan;
  access_expires_at?: string | null;
  warning_days?: number;
  ai_credit_bonus?: number;
  max_users?: number | null;
  max_images?: number | null;
  max_image_mb?: number | null;
  max_clients?: number | null;
  max_quotation_versions?: number | null;
  max_portfolio_designs?: number | null;
  admin_email?: string | null;
  admin_password?: string | null;
  admin_name?: string | null;
}

export type BusinessUpdate = Pick<
  BusinessCreate,
  | 'name'
  | 'contact_email'
  | 'contact_phone'
  | 'plan'
  | 'access_expires_at'
  | 'warning_days'
  | 'max_users'
  | 'max_images'
  | 'max_image_mb'
  | 'max_clients'
  | 'max_quotation_versions'
  | 'max_portfolio_designs'
  | 'ai_credit_bonus'
>;

export type TeamRole = 'admin' | 'designer' | 'viewer';

export interface BusinessUser {
  id: string;
  email: string;
  full_name: string | null;
  role: TeamRole;
  is_active: boolean;
  must_change_password: boolean;
  /** An emailed invite is waiting to be accepted. */
  invite_pending?: boolean;
  last_login_at: string | null;
  created_at: string;
  /** Designers only: clients they lead or can access. */
  client_count?: number | null;
}

export interface BusinessUserCreate {
  email: string;
  /** Omit to email an invite link (or have the server generate a password). */
  password?: string | null;
  full_name?: string | null;
  role?: TeamRole;
}

/** Either an invite was emailed, or a password is shown once. */
export interface IssuedAccess {
  invite_sent: boolean;
  temporary_password?: string | null;
}

export type BusinessUserCreated = BusinessUser & IssuedAccess;

export type BusinessUserUpdate = Partial<
  Pick<BusinessUser, 'email' | 'full_name' | 'role' | 'is_active'>
>;

export interface TeamOverview {
  members: BusinessUser[];
  seats_used: number;
  /** null = unlimited */
  max_users: number | null;
  seats_left: number | null;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  payload: Record<string, unknown>;
  actor_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
}

export interface AuditPage {
  items: AuditEntry[];
  total: number;
}

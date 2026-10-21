import { Plan } from '@/lib/schemas/auth';

export interface Business {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  is_active: boolean;
  created_at: string;
  user_count: number;
  plan: Plan;
  access_expires_at: string | null;
  warning_days: number;
  max_users: number | null;
  seats_used: number;
  max_images: number | null;
  max_image_mb: number | null;
  image_count: number;
  days_left: number | null;
  access_expired: boolean;
  has_openai_key: boolean;
  openai_key_last4: string | null;
  openai_key_updated_at: string | null;
  openai_model_economy: string | null;
  openai_model_balanced: string | null;
  openai_model_premium: string | null;
  openai_whisper_model: string | null;
}

export interface BusinessCreate {
  name: string;
  contact_email?: string | null;
  contact_phone?: string | null;
  plan?: Plan;
  access_expires_at?: string | null;
  warning_days?: number;
  max_users?: number | null;
  max_images?: number | null;
  max_image_mb?: number | null;
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
>;

export type TeamRole = 'admin' | 'designer' | 'viewer';

export interface BusinessUser {
  id: string;
  email: string;
  full_name: string | null;
  role: TeamRole;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
}

export interface BusinessUserCreate {
  email: string;
  password: string;
  full_name?: string | null;
  role?: TeamRole;
}

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

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

export type Plan = 'free' | 'pro';

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
}

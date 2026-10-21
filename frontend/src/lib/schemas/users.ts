export interface PortalUser {
  id: string;
  email: string;
  full_name: string;
  role: 'superadmin' | 'admin' | 'designer';
  is_active: boolean;
  created_at: string;
}

import { api } from '@/lib/api';
import { DashboardStats } from '@/lib/schemas/dashboard';

export function getDashboardStats(): Promise<DashboardStats> {
  return api.get<DashboardStats>('/dashboard/stats');
}

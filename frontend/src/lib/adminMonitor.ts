import { api } from '@/lib/api';
import {
  AdminOverview,
  BusinessAIUsage,
  BusinessClientRow,
} from '@/lib/schemas/adminMonitor';

export function getAdminOverview(): Promise<AdminOverview> {
  return api.get<AdminOverview>('/admin/overview');
}

/** Pass null for clients not assigned to any business. */
export function getBusinessClients(
  businessId: string | null
): Promise<BusinessClientRow[]> {
  const path = businessId
    ? `/admin/businesses/${businessId}/clients`
    : '/admin/unassigned/clients';
  return api.get<BusinessClientRow[]>(path);
}

export function getBusinessUsage(
  businessId: string,
  days: number
): Promise<BusinessAIUsage> {
  return api.get<BusinessAIUsage>(`/admin/businesses/${businessId}/usage`, {
    params: { days },
  });
}

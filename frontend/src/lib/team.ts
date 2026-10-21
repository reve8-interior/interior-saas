import { api } from '@/lib/api';
import {
  AuditPage,
  BusinessUser,
  BusinessUserCreate,
  BusinessUserUpdate,
  TeamOverview,
} from '@/lib/schemas/business';

export interface AuditQuery {
  limit: number;
  offset: number;
  /** Action or prefix, e.g. "team" for every team.* event. */
  action?: string;
}

/**
 * One team-management surface, two backends: a business admin manages their
 * own team (/team), the platform admin manages any business's
 * (/businesses/{id}/...). The UI is written once against this interface.
 */
export interface TeamApi {
  /** React Query key prefix, unique per business. */
  key: string[];
  overview(): Promise<TeamOverview>;
  add(body: BusinessUserCreate): Promise<BusinessUser>;
  update(userId: string, body: BusinessUserUpdate): Promise<BusinessUser>;
  /** Omit password to have the server generate one; returned once. */
  resetPassword(
    userId: string,
    password?: string
  ): Promise<{ temporary_password: string }>;
  remove(userId: string): Promise<void>;
  audit(query: AuditQuery): Promise<AuditPage>;
}

function resetBody(password?: string) {
  return { password: password || null };
}

/** The signed-in business admin's own team. */
export const ownTeamApi: TeamApi = {
  key: ['team', 'own'],
  overview: () => api.get<TeamOverview>('/team'),
  add: (body) => api.post<BusinessUser>('/team', body),
  update: (id, body) => api.patch<BusinessUser>(`/team/${id}`, body),
  resetPassword: (id, password) =>
    api.post<{ temporary_password: string }>(
      `/team/${id}/reset-password`,
      resetBody(password)
    ),
  remove: (id) => api.delete<void>(`/team/${id}`),
  audit: (q) => api.get<AuditPage>('/team/audit', { params: { ...q } }),
};

/** Platform admin view of one business's team. */
export function businessTeamApi(businessId: string): TeamApi {
  const base = `/businesses/${businessId}`;
  return {
    key: ['team', businessId],
    overview: () => api.get<TeamOverview>(`${base}/team`),
    add: (body) => api.post<BusinessUser>(`${base}/users`, body),
    update: (id, body) => api.patch<BusinessUser>(`${base}/users/${id}`, body),
    resetPassword: (id, password) =>
      api.post<{ temporary_password: string }>(
        `${base}/users/${id}/reset-password`,
        resetBody(password)
      ),
    remove: (id) => api.delete<void>(`${base}/users/${id}`),
    audit: (q) => api.get<AuditPage>(`${base}/audit`, { params: { ...q } }),
  };
}

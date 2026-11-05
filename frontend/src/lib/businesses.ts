import { api } from '@/lib/api';
import {
  Business,
  BusinessCreate,
  BusinessUpdate,
  IssuedAccess,
} from '@/lib/schemas/business';

/** Re-send the welcome email to the business admin who hasn't set up yet. */
export function resendBusinessInvite(
  id: string
): Promise<IssuedAccess & { email: string }> {
  return api.post<IssuedAccess & { email: string }>(
    `/businesses/${id}/resend-invite`,
    {}
  );
}

export function listBusinesses(): Promise<Business[]> {
  return api.get<Business[]>('/businesses');
}

export function createBusiness(body: BusinessCreate): Promise<Business> {
  return api.post<Business>('/businesses', body);
}

export function updateBusiness(
  id: string,
  body: BusinessUpdate
): Promise<Business> {
  return api.patch<Business>(`/businesses/${id}`, body);
}

export function setBusinessActive(
  id: string,
  active: boolean
): Promise<Business> {
  return api.post<Business>(
    `/businesses/${id}/${active ? 'activate' : 'deactivate'}`,
    {}
  );
}

export interface OpenAISettings {
  api_key?: string;
  chat_model?: string;
  whisper_model?: string;
}

/** Fields left out are unchanged; a model of '' resets it to the default. */
export function setBusinessOpenAI(
  id: string,
  settings: OpenAISettings
): Promise<Business> {
  return api.put<Business>(`/businesses/${id}/openai`, settings);
}

export function clearBusinessOpenAIKey(id: string): Promise<Business> {
  return api.delete<Business>(`/businesses/${id}/openai-key`);
}

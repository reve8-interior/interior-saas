import { api } from '@/lib/api';
import {
  Business,
  BusinessCreate,
  BusinessUpdate,
} from '@/lib/schemas/business';

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
  economy_model?: string;
  balanced_model?: string;
  premium_model?: string;
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

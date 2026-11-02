import { api } from '@/lib/api';
import type { Client } from '@/lib/schemas/client';

export const addSampleClient = () => api.post<Client>('/clients/sample', {});
export const deleteSampleClient = (id: string) =>
  api.delete<void>(`/clients/${id}`);

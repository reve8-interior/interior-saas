import { api } from '@/lib/api';
import type { Client, ClientAccess, MemberClients } from '@/lib/schemas/client';

export function getClientAccess(clientId: string): Promise<ClientAccess> {
  return api.get<ClientAccess>(`/clients/${clientId}/access`);
}

/** Replace the shared designers (the lead is managed separately). */
export function setClientAccess(
  clientId: string,
  memberIds: string[]
): Promise<ClientAccess> {
  return api.put<ClientAccess>(`/clients/${clientId}/access`, {
    member_ids: memberIds,
  });
}

export function setClientLead(
  clientId: string,
  leadId: string
): Promise<Client> {
  return api.put<Client>(`/clients/${clientId}`, {
    assigned_designer_id: leadId,
  });
}

export function getMemberClients(userId: string): Promise<MemberClients> {
  return api.get<MemberClients>(`/team/${userId}/clients`);
}

/** Replace the clients shared with a designer (ones they lead stay). */
export function setMemberClients(
  userId: string,
  clientIds: string[]
): Promise<MemberClients> {
  return api.put<MemberClients>(`/team/${userId}/clients`, {
    client_ids: clientIds,
  });
}

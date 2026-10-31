import type { Client } from '@/lib/schemas/client';

export interface ClientForm {
  name: string;
  phone: string;
  email: string;
  address: string;
  budget: string;
  notes: string;
}

export const EMPTY_CLIENT_FORM: ClientForm = {
  name: '',
  phone: '',
  email: '',
  address: '',
  budget: '',
  notes: '',
};

export const EMAIL_ERROR = 'Enter a valid email address';

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function clientFormFrom(client: Client): ClientForm {
  const info = client.contact_info ?? {};
  return {
    name: client.name,
    phone: info.phone ?? '',
    email: info.email ?? '',
    address: info.address ?? '',
    budget: info.budget ?? '',
    notes: client.notes ?? '',
  };
}

/** Request body shared by client create and update. */
export function clientPayload(form: ClientForm) {
  return {
    name: form.name.trim(),
    contact_info: {
      phone: form.phone,
      email: form.email,
      address: form.address,
      ...(form.budget ? { budget: form.budget } : {}),
    } as Record<string, string>,
    notes: form.notes || null,
  };
}

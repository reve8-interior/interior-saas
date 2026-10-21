import { api } from '@/lib/api';
import { UserMe } from '@/lib/schemas/auth';

export function getMe(): Promise<UserMe> {
  return api.get<UserMe>('/auth/me');
}

export function updateProfile(fullName: string): Promise<UserMe> {
  return api.patch<UserMe>('/auth/me', { full_name: fullName });
}

export function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  return api.post<void>('/auth/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  });
}

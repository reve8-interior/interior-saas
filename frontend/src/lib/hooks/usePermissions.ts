'use client';

import { getSession, isAdmin } from '@/lib/auth';

export function usePermissions() {
  const session = getSession();
  return {
    isAdmin: isAdmin(),
    role: session?.role ?? null,
    userId: session?.userId ?? null,
    hasRole: (role: string) => session?.role === role,
  };
}

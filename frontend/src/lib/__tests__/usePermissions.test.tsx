import { renderHook } from '@testing-library/react';

import { clearSession, persistSession } from '@/lib/auth';
import { usePermissions } from '@/lib/hooks/usePermissions';

const login = (role: string) =>
  persistSession({
    access_token: `h.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 600 }))}.s`,
    user_id: 'u1',
    email: 'a@b.com',
    role,
  });

beforeEach(() => clearSession());

describe('usePermissions', () => {
  it('reports nulls and no admin when logged out', () => {
    const { result } = renderHook(() => usePermissions());
    expect(result.current).toMatchObject({
      isAdmin: false,
      role: null,
      userId: null,
    });
    expect(result.current.hasRole('admin')).toBe(false);
  });

  it('reflects an admin session', () => {
    login('admin');
    const { result } = renderHook(() => usePermissions());
    expect(result.current).toMatchObject({
      isAdmin: true,
      role: 'admin',
      userId: 'u1',
    });
    expect(result.current.hasRole('admin')).toBe(true);
    expect(result.current.hasRole('designer')).toBe(false);
  });
});

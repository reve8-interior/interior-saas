import {
  clearSession,
  getAccessToken,
  getSession,
  hasRole,
  isAdmin,
  isAuthenticated,
  isSuperadmin,
  persistSession,
  signIn,
  signInAdmin,
  signOut,
} from '@/lib/auth';

const jwt = (payload: object): string => `h.${btoa(JSON.stringify(payload))}.s`;
const inMinutes = (m: number) => Math.floor(Date.now() / 1000) + m * 60;

const base = { user_id: 'u1', email: 'a@b.com', role: 'designer' };

beforeEach(() => {
  clearSession();
  vi.restoreAllMocks();
});

describe('persistSession', () => {
  it('stores the session and uses the JWT exp claim', () => {
    const exp = inMinutes(60);
    const s = persistSession({ ...base, access_token: jwt({ exp }) });
    expect(s.expiresAt).toBe(exp * 1000);
    expect(getSession()?.email).toBe('a@b.com');
    expect(document.cookie).toContain('designer_token=');
  });

  it('falls back to ~24h expiry for an unparsable token', () => {
    const s = persistSession({ ...base, access_token: 'garbage' });
    const day = 24 * 60 * 60 * 1000;
    expect(s.expiresAt).toBeGreaterThan(Date.now() + day - 5000);
    expect(s.expiresAt).toBeLessThanOrEqual(Date.now() + day);
  });
});

describe('getSession', () => {
  it('returns null when nothing is stored', () =>
    expect(getSession()).toBeNull());

  it('drops and clears an expired session', () => {
    persistSession({ ...base, access_token: jwt({ exp: inMinutes(-1) }) });
    expect(getSession()).toBeNull();
    expect(localStorage.getItem('designer_session')).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });

  it('returns null on corrupted storage', () => {
    localStorage.setItem('designer_session', '{not json');
    expect(getSession()).toBeNull();
  });
});

describe('role helpers', () => {
  const login = (role: string) =>
    persistSession({
      ...base,
      role,
      access_token: jwt({ exp: inMinutes(10) }),
    });

  it('designer is not an admin', () => {
    login('designer');
    expect(isAdmin()).toBe(false);
    expect(isSuperadmin()).toBe(false);
    expect(hasRole('designer')).toBe(true);
  });

  it('admin and superadmin are admins; only superadmin is superadmin', () => {
    login('admin');
    expect(isAdmin()).toBe(true);
    expect(isSuperadmin()).toBe(false);
    login('superadmin');
    expect(isAdmin()).toBe(true);
    expect(isSuperadmin()).toBe(true);
  });

  it('signOut removes the token and the admin state', () => {
    login('admin');
    signOut();
    expect(getAccessToken()).toBeNull();
    expect(isAdmin()).toBe(false);
  });
});

describe('signIn', () => {
  const ok = (body: object) =>
    ({ ok: true, json: async () => body }) as Response;

  it('posts credentials to /auth/login and persists the session', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(ok({ ...base, access_token: jwt({}) }));
    const s = await signIn('a@b.com', 'pw');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/auth\/login$/);
    expect(JSON.parse(init!.body as string)).toEqual({
      email: 'a@b.com',
      password: 'pw',
    });
    expect(s.userId).toBe('u1');
    expect(isAuthenticated()).toBe(true);
  });

  it('signInAdmin hits the admin endpoint', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(ok({ ...base, access_token: jwt({}) }));
    await signInAdmin('a@b.com', 'pw');
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/auth\/admin\/login$/);
  });

  it('surfaces the backend detail on failure and stores nothing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ detail: 'Account suspended' }),
    } as Response);
    await expect(signIn('a@b.com', 'x')).rejects.toThrow('Account suspended');
    expect(getSession()).toBeNull();
  });

  it('uses a generic message when the error body is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error('bad');
      },
    } as unknown as Response);
    await expect(signIn('a@b.com', 'x')).rejects.toThrow('Invalid credentials');
  });
});

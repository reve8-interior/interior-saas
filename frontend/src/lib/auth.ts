import { API_URL } from '@/lib/config';

export interface StoredSession {
  token: string;
  userId: string;
  email: string;
  role: string;
  expiresAt: number;
}

const SESSION_KEY = 'designer_session';
const TOKEN_COOKIE = 'designer_token';

function parseJwt(token: string): { exp?: number } | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    return JSON.parse(atob(payload));
  } catch {
    return null;
  }
}

function setAuthCookie(token: string, expiresAt: number) {
  if (typeof document === 'undefined') return;
  const maxAge = Math.floor(Math.max(expiresAt - Date.now(), 60_000) / 1000);
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${TOKEN_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

function clearAuthCookie() {
  if (typeof document === 'undefined') return;
  document.cookie = `${TOKEN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
}

export function persistSession(data: {
  access_token: string;
  user_id: string;
  email: string;
  role: string;
}): StoredSession {
  if (typeof window === 'undefined')
    throw new Error('Cannot persist session server-side');
  const parsed = parseJwt(data.access_token);
  const expiresAt = parsed?.exp
    ? parsed.exp * 1000
    : Date.now() + 24 * 60 * 60 * 1000;
  const session: StoredSession = {
    token: data.access_token,
    userId: data.user_id,
    email: data.email,
    role: data.role,
    expiresAt,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  setAuthCookie(data.access_token, expiresAt);
  return session;
}

export function getSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as StoredSession;
    if (session.expiresAt < Date.now()) {
      clearSession();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  return getSession()?.token ?? null;
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SESSION_KEY);
  clearAuthCookie();
}

async function signInAt(
  path: string,
  email: string,
  password: string
): Promise<StoredSession> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      (error as { detail?: string }).detail || 'Invalid credentials'
    );
  }
  const data = await response.json();
  return persistSession(data);
}

export function signIn(email: string, password: string) {
  return signInAt('/auth/login', email, password);
}

export function signInAdmin(email: string, password: string) {
  return signInAt('/auth/admin/login', email, password);
}

export function signOut() {
  clearSession();
}

export function isAuthenticated(): boolean {
  return !!getSession();
}

export function isAdmin(): boolean {
  const role = getSession()?.role;
  return role === 'admin' || role === 'superadmin';
}

export function isSuperadmin(): boolean {
  return getSession()?.role === 'superadmin';
}

export function hasRole(role: string): boolean {
  return getSession()?.role === role;
}

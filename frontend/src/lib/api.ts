import { getAccessToken } from '@/lib/auth';
import { API_URL } from '@/lib/config';

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

/** FastAPI sends `detail` as a string, or a list of objects on 422. */
function errorMessage(payload: unknown, fallback: string): string {
  const detail = (payload as { detail?: unknown })?.detail;
  if (typeof detail === 'string' && detail) return detail;
  if (Array.isArray(detail)) {
    const parts = detail.map((d: { loc?: unknown[]; msg?: string }) => {
      const field = Array.isArray(d.loc) ? d.loc.slice(1).join('.') : '';
      return field ? `${field}: ${d.msg ?? 'invalid'}` : (d.msg ?? 'invalid');
    });
    if (parts.length) return parts.join('; ');
  }
  return fallback;
}

async function resolveToken(authToken?: string | null): Promise<string | null> {
  if (authToken) return authToken;
  return getAccessToken();
}

interface RequestOptions {
  authToken?: string | null;
  params?: Record<string, string | number | boolean | null | undefined>;
  headers?: Record<string, string>;
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  method: RequestMethod = 'GET',
  data?: unknown,
  options: RequestOptions = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers ?? {}),
  };

  const token = await resolveToken(options.authToken ?? null);
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = new URL(`${API_URL}${cleanEndpoint}`);

  if (options.params) {
    Object.entries(options.params).forEach(([key, value]) => {
      if (value !== undefined && value !== null)
        url.searchParams.append(key, String(value));
    });
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => undefined);
    throw new ApiError(
      errorMessage(errorPayload, `API Error: ${response.statusText}`),
      response.status,
      errorPayload
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

export const api = {
  get: <T>(endpoint: string, options?: RequestOptions) =>
    apiRequest<T>(endpoint, 'GET', undefined, options),
  post: <T>(endpoint: string, data: unknown, options?: RequestOptions) =>
    apiRequest<T>(endpoint, 'POST', data, options),
  put: <T>(endpoint: string, data: unknown, options?: RequestOptions) =>
    apiRequest<T>(endpoint, 'PUT', data, options),
  patch: <T>(endpoint: string, data: unknown, options?: RequestOptions) =>
    apiRequest<T>(endpoint, 'PATCH', data, options),
  delete: <T>(endpoint: string, options?: RequestOptions) =>
    apiRequest<T>(endpoint, 'DELETE', undefined, options),

  /** Unauthenticated GET for public share links; throws `unavailable` on any non-2xx. */
  getPublic: async <T>(endpoint: string, unavailable: string): Promise<T> => {
    const response = await fetch(`${API_URL}${endpoint}`, {
      cache: 'no-store',
    });
    if (!response.ok)
      throw new ApiError(unavailable, response.status, undefined);
    return response.json();
  },

  postForm: async <T>(
    endpoint: string,
    formData: FormData,
    options: RequestOptions = {}
  ): Promise<T> => {
    const token = await resolveToken(options.authToken ?? null);
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const response = await fetch(`${API_URL}${cleanEndpoint}`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => undefined);
      throw new ApiError(
        errorMessage(errorPayload, `API Error: ${response.statusText}`),
        response.status,
        errorPayload
      );
    }

    return response.json();
  },
};

import type { MockInstance } from 'vitest';
import { ApiError, api, apiRequest } from '@/lib/api';
import * as auth from '@/lib/auth';

const res = (status: number, body?: unknown, statusText = ''): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => {
      if (body === undefined) throw new Error('no body');
      return body;
    },
  }) as Response;

let fetchMock: MockInstance<typeof fetch>;

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(auth, 'getAccessToken').mockReturnValue(null);
  fetchMock = vi.spyOn(globalThis, 'fetch');
});

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, init, headers: init.headers as Record<string, string> };
};

describe('apiRequest', () => {
  it('sends the stored bearer token', async () => {
    vi.spyOn(auth, 'getAccessToken').mockReturnValue('tok');
    fetchMock.mockResolvedValue(res(200, {}));
    await api.get('/x');
    expect(lastCall().headers.Authorization).toBe('Bearer tok');
  });

  it('prefers an explicit authToken over the stored one', async () => {
    vi.spyOn(auth, 'getAccessToken').mockReturnValue('stored');
    fetchMock.mockResolvedValue(res(200, {}));
    await api.get('/x', { authToken: 'explicit' });
    expect(lastCall().headers.Authorization).toBe('Bearer explicit');
  });

  it('omits Authorization when logged out', async () => {
    fetchMock.mockResolvedValue(res(200, {}));
    await api.get('/x');
    expect(lastCall().headers.Authorization).toBeUndefined();
  });

  it('normalises endpoints missing a leading slash', async () => {
    fetchMock.mockResolvedValue(res(200, {}));
    await api.get('clients');
    expect(lastCall().url).toMatch(/\/clients$/);
  });

  it('appends params, skipping null/undefined but keeping false/0', async () => {
    fetchMock.mockResolvedValue(res(200, {}));
    await api.get('/x', {
      params: { a: 1, b: null, c: undefined, d: false, e: 0 },
    });
    const q = new URL(lastCall().url).searchParams;
    expect(q.get('a')).toBe('1');
    expect(q.has('b')).toBe(false);
    expect(q.has('c')).toBe(false);
    expect(q.get('d')).toBe('false');
    expect(q.get('e')).toBe('0');
  });

  it('serialises JSON bodies and sets the method', async () => {
    fetchMock.mockResolvedValue(res(200, {}));
    await api.patch('/x', { a: 1 });
    expect(lastCall().init.method).toBe('PATCH');
    expect(lastCall().init.body).toBe('{"a":1}');
  });

  it('sends no body for DELETE', async () => {
    fetchMock.mockResolvedValue(res(204));
    await api.delete('/x');
    expect(lastCall().init.body).toBeUndefined();
  });

  it('returns undefined for 204', async () => {
    fetchMock.mockResolvedValue(res(204));
    await expect(apiRequest('/x', 'DELETE')).resolves.toBeUndefined();
  });
});

describe('error handling', () => {
  it('uses a string detail as the message and keeps status + payload', async () => {
    fetchMock.mockResolvedValue(res(409, { detail: 'Already exists' }));
    const err = await api.post('/x', {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      message: 'Already exists',
      status: 409,
      payload: { detail: 'Already exists' },
    });
  });

  it('flattens FastAPI 422 detail lists, dropping the "body" loc segment', async () => {
    fetchMock.mockResolvedValue(
      res(422, {
        detail: [
          { loc: ['body', 'email'], msg: 'invalid email' },
          { loc: ['body', 'address', 'city'], msg: 'required' },
          { msg: 'top-level problem' },
        ],
      })
    );
    await expect(api.post('/x', {})).rejects.toThrow(
      'email: invalid email; address.city: required; top-level problem'
    );
  });

  it('falls back to statusText when the body is not JSON', async () => {
    fetchMock.mockResolvedValue(res(500, undefined, 'Internal Server Error'));
    await expect(api.get('/x')).rejects.toMatchObject({
      message: 'API Error: Internal Server Error',
      status: 500,
      payload: undefined,
    });
  });

  it('falls back when detail is empty', async () => {
    fetchMock.mockResolvedValue(res(400, { detail: '' }, 'Bad Request'));
    await expect(api.get('/x')).rejects.toThrow('API Error: Bad Request');
  });

  it('propagates network failures', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api.get('/x')).rejects.toThrow('Failed to fetch');
  });
});

describe('api.postForm', () => {
  it('sends FormData without forcing a Content-Type', async () => {
    vi.spyOn(auth, 'getAccessToken').mockReturnValue('tok');
    fetchMock.mockResolvedValue(res(200, { ok: true }));
    const fd = new FormData();
    fd.append('text', 'hi');
    await api.postForm('/up', fd);
    const { init, headers } = lastCall();
    expect(init.body).toBe(fd);
    expect(headers['Content-Type']).toBeUndefined();
    expect(headers.Authorization).toBe('Bearer tok');
  });

  it('throws ApiError on failure', async () => {
    fetchMock.mockResolvedValue(res(413, { detail: 'File too large' }));
    await expect(api.postForm('/up', new FormData())).rejects.toMatchObject({
      message: 'File too large',
      status: 413,
    });
  });
});

describe('api.getPublic', () => {
  it('fetches uncached without auth and returns JSON', async () => {
    fetchMock.mockResolvedValue(res(200, { ok: 1 }));
    expect(await api.getPublic('/share/t', 'nope')).toEqual({ ok: 1 });
    expect(lastCall().init.cache).toBe('no-store');
    expect(lastCall().headers).toBeUndefined();
  });

  it('throws an ApiError with the caller message on failure', async () => {
    fetchMock.mockResolvedValue(res(404));
    await expect(api.getPublic('/share/t', 'nope')).rejects.toMatchObject({
      message: 'nope',
      status: 404,
    });
  });
});

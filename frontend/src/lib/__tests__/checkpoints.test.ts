import { api } from '@/lib/api';
import {
  checkpointNumbers,
  compareCheckpoints,
  extractFromText,
} from '@/lib/checkpoints';

vi.mock('@/lib/api', () => ({ api: { postForm: vi.fn(), post: vi.fn() } }));

const T = '2026-01-01T00:00:00Z';

describe('compareCheckpoints', () => {
  it('orders by created_at first', () =>
    expect(
      compareCheckpoints(
        { id: 'z', created_at: '2026-01-01' },
        { id: 'a', created_at: '2026-01-02' }
      )
    ).toBe(-1));

  it('distinguishes microsecond differences', () => {
    const a = { id: 'a', created_at: '2026-01-01T10:00:00.123456Z' };
    const b = { id: 'b', created_at: '2026-01-01T10:00:00.123457Z' };
    expect(compareCheckpoints(a, b)).toBe(-1);
    expect(compareCheckpoints(b, a)).toBe(1);
  });

  it('breaks ties by id and returns 0 for identical keys', () => {
    const a = { id: 'a', created_at: T };
    const b = { id: 'b', created_at: T };
    expect(compareCheckpoints(a, b)).toBe(-1);
    expect(compareCheckpoints(b, a)).toBe(1);
    expect(compareCheckpoints(a, { ...a })).toBe(0);
  });
});

describe('checkpointNumbers', () => {
  it('numbers oldest as #1 regardless of input order, without mutating input', () => {
    const input = [
      { id: 'c', created_at: '2026-03-01' },
      { id: 'a', created_at: '2026-01-01' },
      { id: 'b', created_at: '2026-02-01' },
    ];
    expect(checkpointNumbers(input)).toEqual({ a: 1, b: 2, c: 3 });
    expect(input[0].id).toBe('c');
  });

  it('returns an empty map for empty input', () =>
    expect(checkpointNumbers([])).toEqual({}));
});

describe('extractFromText', () => {
  it('posts text and tier as multipart form to the extract endpoint', async () => {
    vi.mocked(api.postForm).mockResolvedValue({});
    await extractFromText('c1', 'hello', 'premium');
    const [endpoint, fd] = vi.mocked(api.postForm).mock.calls[0];
    expect(endpoint).toBe('/clients/c1/checkpoints/extract');
    expect((fd as FormData).get('text')).toBe('hello');
    expect((fd as FormData).get('tier')).toBe('premium');
  });

  it('omits tier when not provided', async () => {
    await extractFromText('c1', 'hello');
    const fd = vi.mocked(api.postForm).mock.calls.at(-1)![1] as FormData;
    expect(fd.has('tier')).toBe(false);
  });
});

import { api } from '@/lib/api';
import {
  checkpointNumbers,
  compareCheckpoints,
  extractFromText,
  blocksAddition,
  matchesConversationFilter,
  matchesConversationQuery,
  reviewQueue,
  storedRowCount,
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
  it('posts text as multipart form to the extract endpoint', async () => {
    vi.mocked(api.postForm).mockResolvedValue({});
    await extractFromText('c1', 'hello');
    const [endpoint, fd] = vi.mocked(api.postForm).mock.calls[0];
    expect(endpoint).toBe('/clients/c1/checkpoints/extract');
    expect((fd as FormData).get('text')).toBe('hello');
  });

  it('never sends a model choice', async () => {
    await extractFromText('c1', 'hello');
    const fd = vi.mocked(api.postForm).mock.calls.at(-1)![1] as FormData;
    expect(fd.has('tier')).toBe(false);
  });
});

describe('blocksAddition', () => {
  const cp = (over: Partial<Parameters<typeof blocksAddition>[0]> = {}) => ({
    source: 'manual',
    added_to_quotation: false,
    structured_diff: {},
    ...over,
  });

  it('is true while extracted rows are waiting', () => {
    expect(
      blocksAddition(cp({ structured_diff: { line_items: [{ a: 1 }] } }))
    ).toBe(true);
  });

  it('is false once added, or when extraction found nothing', () => {
    expect(blocksAddition(cp({ added_to_quotation: true }))).toBe(false);
    expect(blocksAddition(cp({ structured_diff: { line_items: [] } }))).toBe(
      false
    );
    expect(
      blocksAddition(cp({ structured_diff: { extraction: { ran_at: 'x' } } }))
    ).toBe(false);
  });

  it('treats a legacy ai_extract conversation without items as pending', () => {
    expect(blocksAddition(cp({ source: 'ai_extract' }))).toBe(true);
    expect(blocksAddition(cp())).toBe(false);
  });
});

describe('matchesConversationFilter', () => {
  it('splits pending from added', () => {
    const pending = {
      source: 'manual',
      added_to_quotation: false,
      structured_diff: { line_items: [{ a: 1 }] },
    };
    const added = { ...pending, added_to_quotation: true };
    expect(matchesConversationFilter(pending, 'pending')).toBe(true);
    expect(matchesConversationFilter(added, 'pending')).toBe(false);
    expect(matchesConversationFilter(added, 'added')).toBe(true);
    expect(matchesConversationFilter(pending, 'all')).toBe(true);
  });
});

describe('matchesConversationQuery', () => {
  const cp = { summary_text: 'Kitchen cabinets', raw_conversation: 'use teak' };

  it('matches summary or raw text, ignoring case', () => {
    expect(matchesConversationQuery(cp, 'KITCHEN')).toBe(true);
    expect(matchesConversationQuery(cp, 'teak')).toBe(true);
    expect(matchesConversationQuery(cp, 'wardrobe')).toBe(false);
  });

  it('matches everything for a blank query', () => {
    expect(matchesConversationQuery(cp, '  ')).toBe(true);
  });
});

describe('reviewQueue', () => {
  const meeting = (id: string, created_at: string, added = false) => ({
    id,
    created_at,
    source: 'ai_extract',
    added_to_quotation: added,
    structured_diff: { line_items: [{}, {}] },
  });

  it('lists pending meetings oldest first and skips added ones', () => {
    const queue = reviewQueue([
      meeting('new', '2026-03-01'),
      meeting('done', '2026-01-01', true),
      meeting('old', '2026-02-01'),
    ]);
    expect(queue.map((m) => m.id)).toEqual(['old', 'new']);
  });
  it('counts stored rows, 0 when none are stored', () => {
    expect(storedRowCount(meeting('a', '2026-01-01'))).toBe(2);
    expect(
      storedRowCount({ source: 'ai_extract', added_to_quotation: false })
    ).toBe(0);
  });
});

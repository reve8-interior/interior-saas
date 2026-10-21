import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import { api } from '@/lib/api';
import {
  DEFAULT_LINE_ITEM_COLUMNS,
  saveLineItemColumns,
  useLineItemColumns,
} from '@/lib/lineItemColumns';

vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), put: vi.fn() } }));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('DEFAULT_LINE_ITEM_COLUMNS', () => {
  it('has unique keys', () => {
    const keys = DEFAULT_LINE_ITEM_COLUMNS.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('locks room and description as required builtins', () => {
    for (const key of ['room', 'description']) {
      const col = DEFAULT_LINE_ITEM_COLUMNS.find((c) => c.key === key);
      expect(col).toMatchObject({
        locked: true,
        required: true,
        builtin: true,
      });
    }
  });

  it('only qty and rate are numeric', () => {
    const numeric = DEFAULT_LINE_ITEM_COLUMNS.filter(
      (c) => c.type === 'number'
    );
    expect(numeric.map((c) => c.key).sort()).toEqual(['qty', 'rate']);
  });
});

describe('useLineItemColumns', () => {
  it('serves defaults while loading', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useLineItemColumns(), { wrapper });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.columns).toEqual(DEFAULT_LINE_ITEM_COLUMNS);
  });

  it('serves the backend columns once loaded', async () => {
    const custom = [{ ...DEFAULT_LINE_ITEM_COLUMNS[0], label: 'Area' }];
    vi.mocked(api.get).mockResolvedValue({ columns: custom });
    const { result } = renderHook(() => useLineItemColumns(), { wrapper });
    await waitFor(() => expect(result.current.columns).toEqual(custom));
  });

  it('saveLineItemColumns PUTs the wrapped payload', async () => {
    await saveLineItemColumns(DEFAULT_LINE_ITEM_COLUMNS);
    expect(api.put).toHaveBeenCalledWith('/settings/line-item-columns', {
      columns: DEFAULT_LINE_ITEM_COLUMNS,
    });
  });
});

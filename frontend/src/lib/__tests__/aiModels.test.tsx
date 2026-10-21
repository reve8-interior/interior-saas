import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

import { formatUsd, useModelTier, type ModelOption } from '@/lib/aiModels';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }));

const opt = (tier: ModelOption['tier'], is_default = false): ModelOption => ({
  tier,
  label: tier,
  blurb: '',
  model: `m-${tier}`,
  is_default,
  input_per_million_usd: null,
  output_per_million_usd: null,
  est_cost_per_extraction_usd: null,
});

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

describe('formatUsd', () => {
  it('shows a dash when unpriced', () => expect(formatUsd(null)).toBe('—'));
  it('shows $0 for zero', () => expect(formatUsd('0')).toBe('$0'));
  it('keeps 4 decimals below a cent', () =>
    expect(formatUsd('0.00281')).toBe('$0.0028'));
  it('uses 2 decimals otherwise', () =>
    expect(formatUsd('0.1234')).toBe('$0.12'));
});

describe('useModelTier', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(api.get).mockResolvedValue([
      opt('economy'),
      opt('balanced'),
      opt('premium', true),
    ]);
  });

  it('falls back to the backend default tier', async () => {
    const { result } = renderHook(() => useModelTier(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.tier).toBe('premium'));
  });

  it('prefers a valid saved tier over the default', async () => {
    localStorage.setItem('ai-model-tier', 'economy');
    const { result } = renderHook(() => useModelTier(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.tier).toBe('economy'));
  });

  it('ignores an invalid saved value', async () => {
    localStorage.setItem('ai-model-tier', 'ultra');
    const { result } = renderHook(() => useModelTier(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.tier).toBe('premium'));
  });

  it('setTier updates state and persists it', async () => {
    const { result } = renderHook(() => useModelTier(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.options).toHaveLength(3));
    act(() => result.current.setTier('economy'));
    expect(result.current.tier).toBe('economy');
    expect(localStorage.getItem('ai-model-tier')).toBe('economy');
  });

  it('still applies the choice when storage throws', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useModelTier(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.options).toHaveLength(3));
    act(() => result.current.setTier('balanced'));
    expect(result.current.tier).toBe('balanced');
  });

  it('defaults to balanced before options load', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useModelTier(), { wrapper: wrapper() });
    expect(result.current.tier).toBe('balanced');
  });
});

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { useSharedLink } from '../useSharedLink';

const gone = () => new ApiError('gone', 410, null);

describe('useSharedLink', () => {
  it('starts loading, then exposes the fetched view', async () => {
    const fetcher = vi.fn().mockResolvedValue({ n: 1 });
    const { result } = renderHook(() => useSharedLink('t', fetcher));
    expect(result.current.state.status).toBe('loading');
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(fetcher).toHaveBeenCalledWith('t');
  });

  it('marks permanent errors as gone and transient ones as retryable', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(gone());
    const { result } = renderHook(() => useSharedLink('t', fetcher));
    await waitFor(() =>
      expect(result.current.state).toEqual({
        status: 'unavailable',
        gone: true,
      })
    );

    fetcher.mockRejectedValueOnce(new ApiError('boom', 500, null));
    act(() => result.current.retry());
    await waitFor(() =>
      expect(result.current.state).toEqual({
        status: 'unavailable',
        gone: false,
      })
    );
  });

  it('retry returns to loading and recovers', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ n: 2 });
    const { result } = renderHook(() => useSharedLink('t', fetcher));
    await waitFor(() =>
      expect(result.current.state.status).toBe('unavailable')
    );
    act(() => result.current.retry());
    expect(result.current.state.status).toBe('loading');
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: 'ready', view: { n: 2 } })
    );
  });

  it('refetches only once on image errors to refresh signed URLs', async () => {
    const fetcher = vi.fn().mockResolvedValue({ n: 1 });
    const { result } = renderHook(() => useSharedLink('t', fetcher));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    act(() => result.current.onImageError());
    act(() => result.current.onImageError());
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });

  it('keeps showing the page when a background refetch fails', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ n: 1 })
      .mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useSharedLink('t', fetcher));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    act(() => result.current.onImageError());
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(result.current.state).toEqual({ status: 'ready', view: { n: 1 } });
  });

  it('ignores a response that arrives after unmount', async () => {
    let resolve!: (v: unknown) => void;
    const fetcher = vi.fn(() => new Promise((r) => (resolve = r)));
    const { result, unmount } = renderHook(() => useSharedLink('t', fetcher));
    unmount();
    resolve({ n: 1 });
    await Promise.resolve();
    expect(result.current.state.status).toBe('loading');
  });
});

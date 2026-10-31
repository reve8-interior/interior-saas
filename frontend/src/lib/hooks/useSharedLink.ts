'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isLinkGone } from '@/components/shared/SharedLinkError';

export type SharedLinkState<T> =
  | { status: 'loading' }
  | { status: 'unavailable'; gone: boolean }
  | { status: 'ready'; view: T };

/**
 * Loads the view behind a public share token.
 * - `retry` re-enters the loading state (for the error screen's button).
 * - `onImageError` silently refetches once, since signed image URLs expire;
 *   a failed refetch keeps the page that is already on screen.
 */
export function useSharedLink<T>(
  token: string,
  fetcher: (token: string) => Promise<T>
) {
  const [state, setState] = useState<SharedLinkState<T>>({ status: 'loading' });
  const refetched = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(
    async (background: boolean) => {
      try {
        const view = await fetcher(token);
        if (alive.current) setState({ status: 'ready', view });
      } catch (e) {
        if (!alive.current || background) return;
        setState({ status: 'unavailable', gone: isLinkGone(e) });
      }
    },
    [token, fetcher]
  );

  useEffect(() => {
    refetched.current = false;
    setState({ status: 'loading' });
    load(false);
  }, [load]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    load(false);
  }, [load]);

  const onImageError = useCallback(() => {
    if (refetched.current) return;
    refetched.current = true;
    load(true);
  }, [load]);

  return { state, retry, onImageError };
}

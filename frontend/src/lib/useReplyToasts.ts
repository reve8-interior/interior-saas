'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  ATTENTION_KEY,
  ATTENTION_POLL_MS,
  getAttention,
  newReplies,
  replyKey,
  type AttentionItem,
} from '@/lib/attention';

/**
 * Pops a toast when a customer reply arrives while the designer is working.
 * The first load only records what already exists, so opening the app never
 * replays old replies.
 */
export function useReplyToasts() {
  const router = useRouter();
  const { data } = useQuery<AttentionItem[]>({
    queryKey: ATTENTION_KEY,
    queryFn: getAttention,
    refetchInterval: ATTENTION_POLL_MS,
    refetchOnWindowFocus: true,
  });
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!data) return;
    const known = seen.current;
    seen.current = new Set([...(known ?? []), ...data.map(replyKey)]);
    if (!known) return;
    for (const item of newReplies(data, known)) {
      toast(`${item.client_name}: ${item.title}`, {
        description: item.detail ?? undefined,
        action: { label: 'View', onClick: () => router.push(item.path) },
      });
    }
  }, [data, router]);
}

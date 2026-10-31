import { api } from '@/lib/api';

export type AttentionKind =
  | 'customer_question'
  | 'customer_approved'
  | 'link_expiring'
  | 'needs_clarity';

/** One thing a designer should act on, pointing at where to resolve it. */
export interface AttentionItem {
  kind: AttentionKind;
  client_id: string;
  client_name: string;
  title: string;
  detail: string | null;
  at: string | null;
  path: string;
  /** Names the item and its state; a newer reply gets a new key. */
  key: string;
  /** The signed-in user has already seen it. */
  read: boolean;
}

export const ATTENTION_KEY = ['dashboard-attention'];
/** How often the bell checks for new customer replies. */
export const ATTENTION_POLL_MS = 60_000;

export function getAttention(): Promise<AttentionItem[]> {
  return api.get<AttentionItem[]>('/dashboard/attention');
}

/** Tell the server these items were seen; only this user's bell changes. */
export function markAttentionRead(keys: string[]): Promise<void> {
  return api.post<void>('/dashboard/attention/read', { keys });
}

/** Stable identity of a customer reply, so a poll can tell new from seen. */
export function replyKey(item: AttentionItem): string {
  return `${item.kind}|${item.path}|${item.at ?? ''}`;
}

/** Customer replies not yet in `seen`; the caller records them afterwards. */
export function newReplies(
  items: AttentionItem[],
  seen: ReadonlySet<string>
): AttentionItem[] {
  return items.filter(
    (i) =>
      (i.kind === 'customer_question' || i.kind === 'customer_approved') &&
      !seen.has(replyKey(i))
  );
}

/** Unread items per client, for badges on that client's tabs. */
export function countByClient(items: AttentionItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    if (item.read) continue;
    counts[item.client_id] = (counts[item.client_id] ?? 0) + 1;
  }
  return counts;
}

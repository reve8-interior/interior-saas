import { api } from '@/lib/api';
import { isOpenQuestion, type QuotationMessage } from '@/lib/quotationMessages';

/** A customer message plus the client it came from. */
export interface InboxMessage extends QuotationMessage {
  client_id: string;
  client_name: string;
  client_contact: Record<string, string>;
}

export const INBOX_KEY = ['dashboard-inbox'];
/** How often the sidebar badge checks for new customer messages. */
export const INBOX_POLL_MS = 60_000;

export function getInbox(): Promise<InboxMessage[]> {
  return api.get<InboxMessage[]>('/dashboard/inbox');
}

export type InboxFilter = 'open' | 'all';

export const INBOX_FILTER_LABELS: Record<InboxFilter, string> = {
  open: 'Open',
  all: 'All',
};

export function matchesInboxFilter(
  m: InboxMessage,
  filter: InboxFilter
): boolean {
  return filter === 'all' || isOpenQuestion(m);
}

/** Questions still waiting on the designer; drives the sidebar badge. */
export function openInboxCount(messages: InboxMessage[]): number {
  return messages.filter(isOpenQuestion).length;
}

/** Inbox link that opens one customer's conversation. */
export function inboxClientHref(clientId: string): string {
  return `/dashboard/inbox?client=${encodeURIComponent(clientId)}`;
}

/** One customer's messages, as a chat thread. */
export interface InboxThread {
  client_id: string;
  client_name: string;
  client_contact: Record<string, string>;
  /** Oldest first, so the thread reads top to bottom. */
  messages: InboxMessage[];
  openCount: number;
  latest: InboxMessage;
}

/**
 * Group messages by customer. Customers with open questions come first,
 * then the most recently active.
 */
export function groupByClient(messages: InboxMessage[]): InboxThread[] {
  const byClient = new Map<string, InboxMessage[]>();
  for (const m of messages) {
    const list = byClient.get(m.client_id);
    if (list) list.push(m);
    else byClient.set(m.client_id, [m]);
  }
  const threads = [...byClient.values()].map((list): InboxThread => {
    const sorted = [...list].sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    );
    const latest = sorted[sorted.length - 1];
    return {
      client_id: latest.client_id,
      client_name: latest.client_name,
      client_contact: latest.client_contact,
      messages: sorted,
      openCount: openInboxCount(sorted),
      latest,
    };
  });
  return threads.sort(
    (a, b) =>
      Number(b.openCount > 0) - Number(a.openCount > 0) ||
      b.latest.created_at.localeCompare(a.latest.created_at)
  );
}

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

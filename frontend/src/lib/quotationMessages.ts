import { api } from '@/lib/api';

/** One thing a customer sent from a shared quotation link. */
export interface QuotationMessage {
  id: string;
  version_id: string | null;
  version_number: number;
  kind: 'approved' | 'question';
  name: string;
  message: string | null;
  /** "Room · line" when the question is about one line of the quotation. */
  item_label: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by_name: string | null;
}

/** Anchor of the customer thread on the client page; links point here. */
export const CUSTOMER_MESSAGES_ID = 'customer-messages';

export const quotationMessagesKey = (clientId: string) =>
  ['quotation-messages', clientId] as const;

export function listQuotationMessages(
  clientId: string
): Promise<QuotationMessage[]> {
  return api.get<QuotationMessage[]>(`/clients/${clientId}/quotation/messages`);
}

/** Mark a question answered, or open it again. */
export function resolveQuotationMessage(
  messageId: string,
  resolved: boolean
): Promise<QuotationMessage> {
  return api.patch<QuotationMessage>(`/quotation-messages/${messageId}`, {
    resolved,
  });
}

/** A question still waiting on the designer. */
export function isOpenQuestion(m: QuotationMessage): boolean {
  return m.kind === 'question' && m.resolved_at === null;
}

export function openQuestionCount(messages: QuotationMessage[]): number {
  return messages.filter(isOpenQuestion).length;
}

/** How a line is named in a question: the customer's page and the designer's search agree on this. */
export function lineLabel(room: string, description: string): string {
  return `${room} · ${description}`;
}

/** The live line a question was about, or null when it was renamed, removed or is ambiguous. */
export function findLineIdByLabel(
  rooms: {
    room: string;
    items: { id: string; description: string; status: string }[];
  }[],
  label: string
): string | null {
  const matches = rooms
    .flatMap((r) => r.items.map((i) => ({ room: r.room, item: i })))
    .filter(
      ({ room, item }) =>
        item.status !== 'removed' && lineLabel(room, item.description) === label
    );
  return matches.length === 1 ? matches[0].item.id : null;
}

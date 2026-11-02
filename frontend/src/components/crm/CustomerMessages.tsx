'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, MessageCircleQuestion, ThumbsUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ReplyActions } from '@/components/quotation/ReplyActions';
import { api } from '@/lib/api';
import { ATTENTION_KEY } from '@/lib/attention';
import type { Client } from '@/lib/schemas/client';
import { CARD_CLS } from '@/lib/constants';
import { timeAgo } from '@/lib/dates';
import { INBOX_KEY } from '@/lib/inbox';
import { errorMessage } from '@/lib/errors';
import {
  CUSTOMER_MESSAGES_ID as SECTION_ID,
  isOpenQuestion,
  listQuotationMessages,
  openQuestionCount,
  quotationMessagesKey,
  resolveQuotationMessage,
  type QuotationMessage,
} from '@/lib/quotationMessages';

/**
 * Everything customers sent from the shared quotation link, newest first with
 * open questions on top. A question keeps the Inbox badge lit until resolved.
 * Renders nothing until a customer has written, so it never shows empty.
 */
export function CustomerMessages({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const [showEarlier, setShowEarlier] = useState(false);
  const { data: messages = [] } = useQuery({
    queryKey: quotationMessagesKey(clientId),
    queryFn: () => listQuotationMessages(clientId),
  });

  const toggle = useMutation({
    mutationFn: ({ id, resolved }: { id: string; resolved: boolean }) =>
      resolveQuotationMessage(id, resolved),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: quotationMessagesKey(clientId) });
      qc.invalidateQueries({ queryKey: ATTENTION_KEY });
      qc.invalidateQueries({ queryKey: INBOX_KEY });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const { data: client } = useQuery<Client>({
    queryKey: ['client', clientId],
    queryFn: () => api.get<Client>(`/clients/${clientId}`),
  });

  // Arriving from the inbox or a link badge: bring the thread into view.
  const hasMessages = messages.length > 0;
  useEffect(() => {
    if (hasMessages && window.location.hash === `#${SECTION_ID}`) {
      document
        .getElementById(SECTION_ID)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [hasMessages]);

  if (messages.length === 0) return null;
  const open = openQuestionCount(messages);
  // Open questions stay in view; answered ones and approvals fold away.
  const current = messages.filter(isOpenQuestion);
  const earlier = messages.filter((m) => !isOpenQuestion(m));
  const shown = showEarlier || current.length === 0 ? messages : current;

  return (
    <section
      id={SECTION_ID}
      aria-labelledby="customer-messages-heading"
      className={`${CARD_CLS} scroll-mt-32`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 id="customer-messages-heading" className="type-label">
          Customer messages
        </h2>
        <span className="text-xs tabular-nums text-dark-500 dark:text-dark-400">
          {messages.length}
        </span>
        {open > 0 ? (
          <span
            role="status"
            className="rounded-control bg-red-600 px-2 py-0.5 text-xs font-semibold text-white"
          >
            {open} open
          </span>
        ) : (
          <span className="text-xs font-medium text-green-700 dark:text-green-400">
            All resolved
          </span>
        )}
      </div>
      <ul className="divide-y divide-line">
        {shown.map((m) => (
          <MessageRow
            key={m.id}
            message={m}
            clientId={clientId}
            contact={client?.contact_info}
            busy={toggle.isPending && toggle.variables?.id === m.id}
            onToggle={(resolved) => toggle.mutate({ id: m.id, resolved })}
          />
        ))}
      </ul>
      {current.length > 0 && earlier.length > 0 && (
        <button
          type="button"
          aria-expanded={showEarlier}
          onClick={() => setShowEarlier((v) => !v)}
          className="link-action mt-3"
        >
          {showEarlier ? 'Hide earlier' : `Show ${earlier.length} earlier`}
        </button>
      )}
    </section>
  );
}

function MessageRow({
  message: m,
  clientId,
  contact,
  busy,
  onToggle,
}: {
  message: QuotationMessage;
  clientId: string;
  contact: Record<string, string> | undefined;
  busy: boolean;
  onToggle: (resolved: boolean) => void;
}) {
  const asked = m.kind === 'question';
  const open = isOpenQuestion(m);
  const Icon = !asked ? ThumbsUp : open ? MessageCircleQuestion : CheckCircle2;
  return (
    <li
      className={`flex gap-3 py-3 first:pt-0 last:pb-0 ${open ? '' : 'opacity-75'}`}
    >
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${
          open ? 'text-red-600' : 'text-green-600 dark:text-green-400'
        }`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-dark-900 dark:text-white">
          {m.name}{' '}
          <span className="font-normal text-dark-500 dark:text-dark-400">
            {asked ? 'asked' : 'approved'} on version {m.version_number} ·{' '}
            {timeAgo(m.created_at)}
          </span>
        </p>
        {m.message && (
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-dark-700 dark:text-dark-200">
            {m.message}
          </p>
        )}
        {asked && !open && (
          <p className="mt-1 text-xs text-dark-500 dark:text-dark-400">
            Resolved
            {m.resolved_by_name ? ` by ${m.resolved_by_name}` : ''}
            {m.resolved_at ? ` · ${timeAgo(m.resolved_at)}` : ''}
          </p>
        )}
        {open && (
          <div className="mt-2">
            <ReplyActions
              clientId={clientId}
              versionId={m.version_id}
              versionNumber={m.version_number}
              contact={contact}
            />
          </div>
        )}
      </div>
      {asked && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onToggle(open)}
          className={`${open ? 'btn-secondary' : 'link-action'} btn-sm shrink-0 self-start`}
        >
          {open ? 'Mark resolved' : 'Reopen'}
        </button>
      )}
    </li>
  );
}

'use client';

import { useQuery } from '@tanstack/react-query';
import { MessageCircleQuestion } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/dates';
import {
  CUSTOMER_MESSAGES_ID,
  isOpenQuestion,
  listQuotationMessages,
  quotationMessagesKey,
} from '@/lib/quotationMessages';
import type { Client } from '@/lib/schemas/client';
import { ReplyActions } from './ReplyActions';

/**
 * The newest unanswered customer question, above the quotation it is about,
 * so the designer can reply or edit without hunting through versions.
 */
export function OpenQuestionStrip({ clientId }: { clientId: string }) {
  const { data: messages = [] } = useQuery({
    queryKey: quotationMessagesKey(clientId),
    queryFn: () => listQuotationMessages(clientId),
  });
  const { data: client } = useQuery<Client>({
    queryKey: ['client', clientId],
    queryFn: () => api.get<Client>(`/clients/${clientId}`),
  });

  const open = messages.filter(isOpenQuestion);
  const [latest] = open;
  if (!latest) return null;
  return (
    <section
      aria-label="Customer question"
      className="mb-4 space-y-2 rounded-xl border border-red-200 bg-red-50 p-3 dark:border-red-500/30 dark:bg-red-500/10"
    >
      <p className="flex items-start gap-2 text-sm text-dark-900 dark:text-white">
        <MessageCircleQuestion
          className="mt-0.5 h-4 w-4 shrink-0 text-red-600"
          aria-hidden
        />
        <span className="min-w-0">
          <span className="font-semibold">
            {latest.name} asked on v{latest.version_number}
          </span>
          <span className="text-dark-600 dark:text-dark-300">
            {' · '}
            {timeAgo(latest.created_at)}
          </span>
          {latest.message && (
            <span className="block break-words text-dark-700 dark:text-dark-200">
              “{latest.message}”
            </span>
          )}
        </span>
      </p>
      <ReplyActions
        clientId={clientId}
        versionId={latest.version_id}
        versionNumber={latest.version_number}
        contact={client?.contact_info}
        canEdit={false}
      />
      {open.length > 1 && (
        <Link
          href={`/dashboard/clients/${clientId}#${CUSTOMER_MESSAGES_ID}`}
          className="link-action text-xs"
        >
          +{open.length - 1} more open
        </Link>
      )}
    </section>
  );
}

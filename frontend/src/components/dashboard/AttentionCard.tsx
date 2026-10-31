'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  MessageCircleQuestion,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import {
  ATTENTION_KEY,
  getAttention,
  type AttentionItem,
  type AttentionKind,
} from '@/lib/attention';
import { timeAgo } from '@/lib/dates';

const KIND_ICON: Record<AttentionKind, LucideIcon> = {
  customer_question: MessageCircleQuestion,
  customer_approved: CheckCircle2,
  link_expiring: Clock,
  needs_clarity: AlertTriangle,
};

const AMBER =
  'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300';
const KIND_TONE: Record<AttentionKind, string> = {
  customer_question:
    'bg-primary-100 text-primary-700 dark:bg-primary-500/20 dark:text-primary-200',
  customer_approved:
    'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  link_expiring: AMBER,
  needs_clarity: AMBER,
};

function when(item: AttentionItem): string {
  if (!item.at) return '';
  const rel = timeAgo(item.at);
  return item.kind === 'link_expiring' ? `Ends ${rel}` : rel;
}

/**
 * Everything waiting on the designer: customer replies, links about to
 * expire, rows that need clarity. Renders nothing when there is none, so an
 * empty dashboard stays quiet.
 */
export function AttentionCard() {
  const { data: all = [] } = useQuery<AttentionItem[]>({
    queryKey: ATTENTION_KEY,
    queryFn: getAttention,
  });
  const items = all.filter((i) => !i.read);
  if (items.length === 0) return null;

  return (
    <section className="surface p-5" aria-labelledby="needs-attention">
      <h2
        id="needs-attention"
        className="mb-3 font-heading text-base font-extrabold tracking-tight"
      >
        Needs your attention
        <span className="ml-2 rounded-full bg-primary-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary-700 dark:bg-primary-500/20 dark:text-primary-200">
          {items.length}
        </span>
      </h2>
      <ul className="divide-y divide-line">
        {items.map((item) => {
          const Icon = KIND_ICON[item.kind];
          return (
            <li key={`${item.kind}-${item.path}`}>
              <Link
                href={item.path}
                className="flex min-h-12 items-start gap-3 py-3 hover:text-primary-600 dark:hover:text-primary-400"
              >
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${KIND_TONE[item.kind]}`}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {item.client_name}
                    <span className="font-normal text-dark-600 dark:text-dark-300">
                      {' · '}
                      {item.title}
                    </span>
                  </span>
                  {item.detail && (
                    <span className="mt-0.5 block truncate text-xs text-dark-500 dark:text-dark-400">
                      “{item.detail}”
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-xs text-dark-500 dark:text-dark-400">
                  {when(item)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

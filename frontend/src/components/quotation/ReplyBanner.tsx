'use client';

import { CheckCircle2 } from 'lucide-react';
import { timeAgo } from '@/lib/dates';
import type { QuotationVersionSummary } from '@/lib/schemas/quotationVersion';
import { ReplyActions } from './ReplyActions';

/**
 * The customer's answer, at the top of the version it came from, with what to
 * do about it: reach them, change the quotation, or mark the version agreed.
 */
export function ReplyBanner({
  summary,
  clientId,
  contact,
  onAgree,
}: {
  summary: QuotationVersionSummary;
  clientId: string;
  contact: Record<string, string> | undefined;
  onAgree: () => void;
}) {
  if (!summary.is_shared || !summary.reply_kind) return null;
  const asked = summary.reply_kind === 'question';
  const who = summary.reply_name || 'Your customer';
  return (
    <section
      aria-label="Customer reply"
      className={`my-3 space-y-3 rounded-xl border p-4 ${
        asked
          ? 'border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10'
          : 'border-green-200 bg-green-50 dark:border-green-500/30 dark:bg-green-500/10'
      }`}
    >
      <div>
        <p className="text-sm font-semibold text-dark-900 dark:text-white">
          {who} {asked ? 'asked a question' : 'approved this version'}
          {summary.replied_at && (
            <span className="font-normal text-dark-600 dark:text-dark-300">
              {' · '}
              {timeAgo(summary.replied_at)}
            </span>
          )}
        </p>
        {summary.reply_message && (
          <p className="mt-1 whitespace-pre-wrap text-sm text-dark-800 dark:text-dark-100">
            “{summary.reply_message}”
          </p>
        )}
      </div>
      <p className="text-xs text-dark-600 dark:text-dark-300">
        {asked
          ? 'Reply to them, change the quotation if needed, then save a new version and share it. They keep the same link and see the update.'
          : 'Mark it as agreed to move the project to implementation.'}
      </p>
      <div className="flex flex-wrap gap-2">
        {!asked && !summary.is_agreed && (
          <button
            type="button"
            onClick={onAgree}
            className="btn-primary btn-sm"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            Mark as agreed
          </button>
        )}
        <ReplyActions
          clientId={clientId}
          versionId={null}
          versionNumber={0}
          contact={contact}
          canEdit={asked}
          showVersionLink={false}
          emphasis={asked}
        />
      </div>
    </section>
  );
}

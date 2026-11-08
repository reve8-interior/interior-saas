'use client';

import { Eye, Mail, MessageCircle, Pencil } from 'lucide-react';
import Link from 'next/link';

/**
 * How a designer answers a customer message: reach them, change the
 * quotation, or open the version it came from. One set of actions for every
 * place a message shows up.
 */
export function ReplyActions({
  clientId,
  versionId,
  versionNumber,
  contact,
  canEdit = true,
  showVersionLink = true,
  emphasis = true,
  itemLabel = null,
}: {
  clientId: string;
  versionId: string | null;
  versionNumber: number;
  contact: Record<string, string> | undefined;
  /** Offer "Edit quotation"; false for approvals, which need no change. */
  canEdit?: boolean;
  /** Hide the version link where the version is already on screen. */
  showVersionLink?: boolean;
  /** Style the first contact action as the primary button. */
  emphasis?: boolean;
  /** "Room · line" the question was about; Edit quotation jumps to it. */
  itemLabel?: string | null;
}) {
  const phone = (contact?.phone ?? '').replace(/\D/g, '');
  const email = contact?.email ?? '';
  const base = `/dashboard/clients/${clientId}`;
  const reach = emphasis ? 'btn-primary' : 'btn-secondary';
  const editHref = itemLabel
    ? `${base}/quotation?line=${encodeURIComponent(itemLabel)}`
    : `${base}/quotation`;
  return (
    <div className="flex flex-wrap gap-2">
      {/* Icon-only to stay compact; each carries a label for hover and screen readers. */}
      {phone ? (
        <a
          href={`https://wa.me/${phone}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="WhatsApp"
          title="WhatsApp"
          className={`${reach} btn-sm px-2.5`}
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
        </a>
      ) : (
        email && (
          <a
            href={`mailto:${email}`}
            aria-label="Email"
            title="Email"
            className={`${reach} btn-sm px-2.5`}
          >
            <Mail className="h-4 w-4" aria-hidden />
          </a>
        )
      )}
      {canEdit && (
        <Link
          href={editHref}
          aria-label={
            itemLabel ? `Edit quotation: ${itemLabel}` : 'Edit quotation'
          }
          title={
            itemLabel ? 'Edit this line in the quotation' : 'Edit quotation'
          }
          className="btn-secondary btn-sm px-2.5"
        >
          <Pencil className="h-4 w-4" aria-hidden />
        </Link>
      )}
      {showVersionLink && versionId && (
        <Link
          href={`${base}/versions?view=1&version=${versionId}`}
          aria-label={`View v${versionNumber}`}
          title={`View v${versionNumber}`}
          className="btn-secondary btn-sm px-2.5"
        >
          <Eye className="h-4 w-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}

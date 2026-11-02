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
}) {
  const phone = (contact?.phone ?? '').replace(/\D/g, '');
  const email = contact?.email ?? '';
  const base = `/dashboard/clients/${clientId}`;
  const reach = emphasis ? 'btn-primary' : 'btn-secondary';
  return (
    <div className="flex flex-wrap gap-2">
      {/* One way to reach them: WhatsApp when there is a phone, else email. */}
      {phone ? (
        <a
          href={`https://wa.me/${phone}`}
          target="_blank"
          rel="noopener noreferrer"
          className={`${reach} btn-sm`}
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          WhatsApp
        </a>
      ) : (
        email && (
          <a href={`mailto:${email}`} className={`${reach} btn-sm`}>
            <Mail className="h-4 w-4" aria-hidden />
            Email
          </a>
        )
      )}
      {canEdit && (
        <Link href={`${base}/quotation`} className="btn-secondary btn-sm">
          <Pencil className="h-4 w-4" aria-hidden />
          Edit quotation
        </Link>
      )}
      {showVersionLink && versionId && (
        <Link
          href={`${base}/versions?view=1&version=${versionId}`}
          className="btn-secondary btn-sm"
        >
          <Eye className="h-4 w-4" aria-hidden />
          View v{versionNumber}
        </Link>
      )}
    </div>
  );
}

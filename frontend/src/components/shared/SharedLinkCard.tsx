'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge, type BadgeTone } from '@/components/ui/Badge';
import {
  CopyLinkButton,
  StopSharingButton,
} from '@/components/shared/ShareControls';
import { timeAgo } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { fmtDateLong } from '@/lib/format';
import { CUSTOMER_MESSAGES_ID } from '@/lib/quotationMessages';
import {
  SHARED_LINKS_KEY,
  canExtend,
  extendLink,
  linkStatus,
  stopLink,
  type SharedLink,
  type SharedLinkKind,
} from '@/lib/sharedLinks';

const KIND_LABEL: Record<SharedLinkKind, string> = {
  designs: 'Designs',
  quotation: 'Quotation',
  portfolio: 'Portfolio',
};

const STATUS_TONE: Record<string, { tone: BadgeTone; label: string }> = {
  active: { tone: 'success', label: 'Active' },
  expired: { tone: 'danger', label: 'Expired' },
};

/** Where a link is managed in detail, if it has a home beyond the list. */
function homeOf(link: SharedLink): string {
  if (link.kind === 'portfolio') return '/dashboard/portfolio';
  const base = `/dashboard/clients/${link.client_id}`;
  return link.kind === 'quotation'
    ? `${base}/versions?view=1&version=${link.version_id}&tab=share`
    : `${base}/designs`;
}

function activity(link: SharedLink): string {
  if (link.view_count === null) return '';
  if (link.view_count === 0) return 'Not opened yet';
  const last = link.last_viewed_at ? ` · ${timeAgo(link.last_viewed_at)}` : '';
  return `Opened ${link.view_count}×${last}`;
}

/** One public link: what it shares, whether it works, what came back, and the actions on it. */
export function SharedLinkCard({
  link,
  showClient = true,
  compact = false,
}: {
  link: SharedLink;
  /** Hide "for <client>" where the surrounding page is already that client's. */
  showClient?: boolean;
  /** Tile for a grid: fills its cell, actions pinned to the bottom, replies link to the messages list. */
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: SHARED_LINKS_KEY });
  const stop = useMutation({
    mutationFn: stopLink,
    onSuccess: () => {
      refresh();
      toast.success('Sharing stopped');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const extend = useMutation({
    mutationFn: extendLink,
    onSuccess: () => {
      refresh();
      toast.success('Link extended by 30 days');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const status = STATUS_TONE[linkStatus(link)];
  const active = linkStatus(link) === 'active';
  return (
    <li className="surface flex flex-col gap-3 p-4 md:flex-row md:items-center md:gap-6">
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{KIND_LABEL[link.kind]}</Badge>
          <span className="flex items-center gap-2">
            {link.response_kind === 'approved' && (
              <Badge tone="success">Approved</Badge>
            )}
            {link.response_kind && link.response_kind !== 'approved' && (
              <Link
                href={`/dashboard/clients/${link.client_id}#${CUSTOMER_MESSAGES_ID}`}
                onClick={(e) => {
                  // Already on the client page: a same-hash link is a no-op, so scroll ourselves.
                  const target = document.getElementById(CUSTOMER_MESSAGES_ID);
                  if (compact && target) {
                    e.preventDefault();
                    target.scrollIntoView({ behavior: 'smooth' });
                  }
                }}
                className="badge bg-amber-100 font-medium text-amber-700 underline-offset-2 hover:underline dark:bg-amber-500/15 dark:text-amber-300"
              >
                View reply
              </Link>
            )}
            <Badge tone={status.tone}>{status.label}</Badge>
          </span>
          <Link
            href={homeOf(link)}
            className="text-sm font-semibold text-dark-900 hover:underline dark:text-white"
          >
            {link.title}
          </Link>
          {showClient && link.client_name && (
            <span className="text-sm text-dark-600 dark:text-dark-300">
              for {link.client_name}
            </span>
          )}
        </div>

        <p className="text-xs text-dark-500 dark:text-dark-400">
          {link.expires_at
            ? `Till ${fmtDateLong(link.expires_at)}`
            : 'No end date'}
          {link.show_prices !== null &&
            ` · Prices ${link.show_prices ? 'shown' : 'hidden'}`}
          {activity(link) && ` · ${activity(link)}`}
          {` · Made ${timeAgo(link.created_at)}`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 md:max-w-[22rem] md:shrink-0 md:justify-end">
        {active && (
          <>
            <CopyLinkButton url={link.url} iconOnly />
            <a
              href={link.url}
              target="_blank"
              rel="noreferrer"
              aria-label="Open link"
              title="Open link"
              className="icon-btn icon-btn-sm"
            >
              <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          </>
        )}
        {canExtend(link) && (
          <button
            type="button"
            onClick={() => extend.mutate(link)}
            disabled={extend.isPending}
            aria-label={active ? 'Extend 30 days' : 'Renew 30 days'}
            title={active ? 'Extend 30 days' : 'Renew 30 days'}
            className="icon-btn icon-btn-sm"
          >
            <CalendarPlus className="h-4 w-4" aria-hidden />
          </button>
        )}
        <StopSharingButton
          onConfirm={() => stop.mutate(link)}
          disabled={stop.isPending}
          iconOnly
        />
      </div>
    </li>
  );
}

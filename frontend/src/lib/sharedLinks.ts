import { api } from '@/lib/api';
import { revokeShareLink, revokePortfolioShare } from '@/lib/designs';
import {
  revokeVersionShare,
  updateVersionShareExpiry,
} from '@/lib/quotationVersions';
import { shareStatus, type ShareStatus } from '@/lib/shareStatus';

export type SharedLinkKind = 'designs' | 'quotation' | 'portfolio';

/** One public link, whatever it shares. */
export interface SharedLink {
  kind: SharedLinkKind;
  id: string;
  version_id: string | null;
  client_id: string | null;
  client_name: string | null;
  title: string;
  url: string;
  show_prices: boolean | null;
  expires_at: string | null;
  created_at: string;
  view_count: number | null;
  last_viewed_at: string | null;
  response_kind: string | null;
}

export const SHARED_LINKS_KEY = ['shared-links'];

export type LinkFilter = 'all' | 'active' | 'ending' | 'replied' | 'expired';

export const FILTER_LABELS: Record<LinkFilter, string> = {
  all: 'All',
  active: 'Active',
  ending: 'Ending soon',
  replied: 'Replied',
  expired: 'Expired',
};

const DAY_MS = 86_400_000;

export function listSharedLinks(): Promise<SharedLink[]> {
  return api.get<SharedLink[]>('/shared-links');
}

export function linkStatus(
  link: SharedLink,
  now: Date = new Date()
): ShareStatus {
  return shareStatus(link, now);
}

/** Active links whose end date falls within `days` days. */
export function isEndingSoon(
  link: SharedLink,
  now: Date = new Date(),
  days = 7
): boolean {
  if (linkStatus(link, now) !== 'active' || !link.expires_at) return false;
  return new Date(link.expires_at).getTime() - now.getTime() <= days * DAY_MS;
}

export function matchesFilter(
  link: SharedLink,
  filter: LinkFilter,
  now: Date = new Date()
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'active':
      return linkStatus(link, now) === 'active';
    case 'ending':
      return isEndingSoon(link, now);
    case 'replied':
      return link.response_kind !== null;
    case 'expired':
      return linkStatus(link, now) === 'expired';
  }
}

/** Stop a link: each kind has its own endpoint. */
export function stopLink(link: SharedLink): Promise<void> {
  switch (link.kind) {
    case 'designs':
      return revokeShareLink(link.client_id as string, link.id);
    case 'portfolio':
      return revokePortfolioShare(link.id);
    case 'quotation':
      return revokeVersionShare(link.version_id as string, link.id);
  }
}

/** Only quotation links can be moved today; other kinds are stopped and re-made. */
export const canExtend = (link: SharedLink): boolean =>
  link.kind === 'quotation';

/** Push the end 30 days past today (or its current end if later). */
export function extendLink(link: SharedLink): Promise<unknown> {
  const base = Math.max(
    Date.now(),
    link.expires_at ? new Date(link.expires_at).getTime() : 0
  );
  return updateVersionShareExpiry(
    link.version_id as string,
    link.id,
    new Date(base + 30 * DAY_MS).toISOString()
  );
}

export type ShareStatus = 'active' | 'revoked' | 'expired';

interface Expirable {
  revoked_at?: string | null;
  expires_at: string | null;
}

/** Lifecycle state of a share link; revocation outranks expiry. */
export function shareStatus(
  share: Expirable,
  now: Date = new Date()
): ShareStatus {
  if (share.revoked_at) return 'revoked';
  if (share.expires_at && new Date(share.expires_at) <= now) return 'expired';
  return 'active';
}

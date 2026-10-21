import { Badge, type BadgeTone } from '@/components/ui';
import { Business } from '@/lib/schemas/business';

export type AccessTone = 'ok' | 'warn' | 'expired' | 'none';

export function accessTone(b: Business): AccessTone {
  if (b.days_left === null) return 'none';
  if (b.access_expired) return 'expired';
  return b.days_left <= b.warning_days ? 'warn' : 'ok';
}

const BADGE_TONE: Record<Exclude<AccessTone, 'none'>, BadgeTone> = {
  ok: 'success',
  warn: 'warning',
  expired: 'danger',
};

/** Plan + time-left chip. Colour is backed by text, never colour alone. */
export function AccessBadge({ b }: { b: Business }) {
  const tone = accessTone(b);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-xs font-semibold uppercase text-dark-500 dark:text-dark-400">
        {b.plan}
      </span>
      {tone === 'none' ? (
        <span className="text-xs text-dark-500 dark:text-dark-400">
          No limit
        </span>
      ) : (
        <Badge tone={BADGE_TONE[tone]}>
          {b.access_expired ? 'Expired' : `${b.days_left}d left`}
        </Badge>
      )}
    </span>
  );
}

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <Badge tone={active ? 'success' : 'neutral'}>
      {active ? 'Active' : 'Inactive'}
    </Badge>
  );
}

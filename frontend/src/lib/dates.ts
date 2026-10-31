/**
 * End of the chosen local day as an ISO instant (date inputs carry no time).
 * Returns null for an empty or unparseable value.
 */
export function endOfDayIso(date: string): string | null {
  if (!date) return null;
  const d = new Date(`${date}T23:59:59`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const UNITS: [
  limit: number,
  unit: Intl.RelativeTimeFormatUnit,
  size: number,
][] = [
  [60, 'second', 1],
  [3600, 'minute', 60],
  [86400, 'hour', 3600],
  [2592000, 'day', 86400],
];

/**
 * "2 hours ago" / "in 3 days" for an ISO instant. Falls back to the plain
 * date past a month, and to an empty string for an unparseable value.
 */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const seconds = Math.round((then.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (const [limit, unit, size] of UNITS) {
    if (abs < limit) return rtf.format(Math.round(seconds / size), unit);
  }
  return then.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

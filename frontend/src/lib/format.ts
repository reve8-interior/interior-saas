/** Format a USD amount; sub-cent spends keep 4 decimals so they don't read as $0.00. */
export function fmtUsd(amount: number): string {
  if (amount === 0) return '$0.00';
  return `$${amount.toFixed(amount < 0.01 ? 4 : 2)}`;
}

/** Compact Indian-notation rupees: ₹1.2Cr / ₹45L / ₹12K / ₹850. */
export function fmtInr(n: number): string {
  if (n >= 1e7) return `₹${+(n / 1e7).toFixed(1)}Cr`;
  if (n >= 1e5) return `₹${+(n / 1e5).toFixed(1)}L`;
  if (n >= 1e3) return `₹${+(n / 1e3).toFixed(1)}K`;
  return `₹${n.toLocaleString('en-IN')}`;
}

/** Full-precision rupees for a rate, e.g. ₹1,250.50. */
export function fmtRate(n: number | string): string {
  return `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/** Milliseconds as a short duration: 850ms / 1.2s. */
export function fmtSpeed(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/** Locale number in Indian grouping, e.g. 12,34,567. */
export function fmtNum(n: number): string {
  return n.toLocaleString('en-IN');
}

/** Whole-rupee amount, or an em dash when absent. */
export function fmtRupees(n?: number | null): string {
  return n != null
    ? `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
    : '—';
}

/** Locale date, or an em dash when absent. */
export function fmtDate(iso?: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

/** Day + month, e.g. 5 Mar. */
export function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

/** Day + month + year, e.g. 5 Mar 2026. */
export function fmtDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Day + month + time, e.g. 5 Mar, 02:30 PM. */
export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

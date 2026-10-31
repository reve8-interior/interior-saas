'use client';

import { Users } from 'lucide-react';
import { MUTED } from './teamStyles';
export function SeatMeter({ used, max }: { used: number; max: number | null }) {
  const pct = max ? Math.min((used / max) * 100, 100) : 0;
  const full = max !== null && used >= max;
  return (
    <div className="surface space-y-2 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4" /> Team seats
        </p>
        <p className="text-sm font-bold">
          {used} / {max ?? '∞'}
        </p>
      </div>
      {max !== null && (
        <div className="h-2 overflow-hidden rounded-full bg-dark-100 dark:bg-white/10">
          <div
            className={`h-full rounded-full ${full ? 'bg-amber-500' : 'bg-primary-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      <p className={`text-xs ${MUTED}`}>
        {full
          ? 'Seat limit reached. Disable a member or contact your platform administrator for more seats.'
          : 'Only active members use a seat.'}
      </p>
    </div>
  );
}

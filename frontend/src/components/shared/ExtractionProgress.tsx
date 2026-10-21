'use client';

import { useEffect, useState } from 'react';

/** Matches the backend's per-chunk split (CHUNK_CHARS). */
const CHUNK_CHARS = 12000;
const SECONDS_PER_CHUNK = 15;
const BASE_SECONDS = 5;
const MAX_FRACTION = 0.95;
const RADIUS = 28;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const STAGES: { upTo: number; text: string }[] = [
  { upTo: 0.2, text: 'Reading your notes…' },
  { upTo: 0.5, text: 'Finding rooms and work items…' },
  { upTo: 0.8, text: 'Working out quantities and rates…' },
  { upTo: 1, text: 'Almost done — checking the results…' },
];

/**
 * Estimated progress for a single long-running extract request.
 * The server gives no live updates, so the bar is a time-based estimate
 * from the text length and never claims to be finished until it is.
 */
export function ExtractionProgress({ chars }: { chars: number }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const id = window.setInterval(
      () => setElapsed((Date.now() - started) / 1000),
      250
    );
    return () => window.clearInterval(id);
  }, []);

  const chunks = Math.max(1, Math.ceil(chars / CHUNK_CHARS));
  const expected = BASE_SECONDS + chunks * SECONDS_PER_CHUNK;
  const fraction = Math.min(MAX_FRACTION, 1 - Math.exp(-elapsed / expected));
  const stage = STAGES.find((s) => fraction <= s.upTo) ?? STAGES[3];
  const overrun = elapsed > expected * 1.5;

  const percent = Math.round(fraction * 100);
  const dash = CIRCUMFERENCE * (1 - fraction);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-4 rounded-xl bg-primary-50/60 p-4 dark:bg-dark-900/60"
    >
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Extraction progress"
        className="relative h-16 w-16 shrink-0"
      >
        <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
          <circle
            cx="32"
            cy="32"
            r={RADIUS}
            fill="none"
            strokeWidth="6"
            className="stroke-primary-100 dark:stroke-white/10"
          />
          <circle
            cx="32"
            cy="32"
            r={RADIUS}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dash}
            className="stroke-primary-500 transition-[stroke-dashoffset] duration-300 ease-out motion-reduce:transition-none"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold tabular-nums text-dark-900 dark:text-white">
          {percent}%
        </span>
      </div>
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium text-dark-900 dark:text-white">
          {overrun ? 'Still working — long notes take longer…' : stage.text}
        </p>
        <p className="text-xs text-dark-500 dark:text-dark-400">
          {Math.floor(elapsed)}s · estimated about {expected}s for{' '}
          {chunks === 1 ? 'these notes' : `${chunks} parts`}. Keep this window
          open.
        </p>
      </div>
    </div>
  );
}

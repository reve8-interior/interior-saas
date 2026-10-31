'use client';

import { useEffect, useState } from 'react';
import { DeviceShot, type Shot } from './DeviceShot';

const STEP_MS = 4200;

export interface DemoStep extends Shot {
  title: string;
  line: string;
}

/**
 * Auto-playing walkthrough: a tab per step, the step's explanation, and real screenshots on desktop and phone.
 * Advances on a timer, pauses while hovered, stays still for reduced-motion users, and any step can be clicked.
 */
export function StepPlayer({
  steps,
  url,
}: {
  steps: DemoStep[];
  /** Address shown in the browser bar. */
  url: string;
}) {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  useEffect(() => {
    if (paused || reduced) return;
    const t = setTimeout(() => setStep((s) => (s + 1) % steps.length), STEP_MS);
    return () => clearTimeout(t);
  }, [step, paused, reduced, steps.length]);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <ol className="mb-5 flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:justify-center">
        {steps.map((s, i) => {
          const active = i === step;
          return (
            <li key={s.key} className="shrink-0">
              <button
                type="button"
                onClick={() => setStep(i)}
                aria-current={active ? 'step' : undefined}
                className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors ${
                  active
                    ? 'border-brand bg-brand text-white'
                    : 'border-line text-dark-500 hover:bg-surface-2 dark:text-dark-400'
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                    active ? 'bg-white/20' : 'bg-surface-2'
                  }`}
                >
                  {i + 1}
                </span>
                {s.title}
              </button>
            </li>
          );
        })}
      </ol>

      <p
        key={step}
        className="mx-auto mb-6 min-h-[3.5rem] max-w-2xl animate-fade-in text-center text-base text-dark-500 dark:text-dark-400"
      >
        {steps[step].line}
      </p>

      <DeviceShot
        shots={steps}
        active={step}
        url={url}
        alt={steps[step].title}
      />
    </div>
  );
}

'use client';

import { Check, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLoop } from './useLoop';

/** Looping product mockups for the landing page. All names and amounts are sample data. */

const FRAME = 'surface overflow-hidden p-4 text-xs';
const MUTED = 'text-dark-500 dark:text-dark-400';
const FADE = 'transition-all duration-500';

const shown = (on: boolean): string =>
  on ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0';

function Pill({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}
    >
      {children}
    </span>
  );
}

const TONE = {
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  purple:
    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
} as const;

const CARD =
  'rounded-xl border border-line bg-primary-50/80 p-2.5 dark:bg-dark-950';

const COLUMNS: { name: string; tone: string; clients: string[] }[] = [
  { name: 'Discussion', tone: TONE.blue, clients: ['Client A'] },
  { name: 'Design', tone: TONE.purple, clients: ['Client B', 'Client C'] },
  { name: 'Quotation', tone: TONE.amber, clients: ['Client D', 'Client E'] },
  { name: 'Implementation', tone: TONE.red, clients: ['Client F'] },
];

/** The kanban pipeline: one client moves from phase to phase. */
export function PipelineMockup() {
  // One phase per column, then a hold on the last one before it starts over.
  const { ref, phase } = useLoop(COLUMNS.length + 1, 1500);
  const at = Math.min(phase, COLUMNS.length - 1);

  return (
    <div ref={ref} className={FRAME}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {COLUMNS.map(({ name, tone, clients }, col) => (
          <div key={name} className="space-y-2">
            <Pill tone={tone}>{name}</Pill>
            {clients.map((c) => (
              <div key={c} className={CARD}>
                <p className="font-semibold text-dark-900 dark:text-white">
                  {c}
                </p>
                <p className={MUTED}>Sample project</p>
              </div>
            ))}
            {/* Every column keeps a slot of the same size, so the card moving in never changes a height. */}
            <div
              className={`${CARD} relative ${FADE} ${
                col === at
                  ? '!border-primary-500 ring-2 ring-primary-500/30'
                  : 'border-dashed !bg-transparent'
              }`}
            >
              <div
                className={`${FADE} ${col === at ? 'opacity-100' : 'opacity-0'}`}
              >
                <p className="font-semibold text-dark-900 dark:text-white">
                  Mohan Reddy
                </p>
                <p className={MUTED}>3BHK flat</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const NOTES = [
  'Wants an 8 ft wardrobe in the master bedroom,',
  'a TV unit with storage in the living room,',
  'and an L-shaped modular kitchen.',
];

const EXTRACTED: [item: string, room: string][] = [
  ['Wardrobe, 8 ft', 'Master bedroom'],
  ['TV unit with storage', 'Living room'],
  ['Modular kitchen, L-shape', 'Kitchen'],
];

/**
 * Meeting notes are written, read, and the line items appear one by one, each lighting up the words it
 * came from. Phases: 0 empty, 1-3 notes, 4 reading, 5-7 items, 8 hold.
 */
export function ExtractMockup() {
  const { ref, phase } = useLoop(9, 1000);
  const reading = phase === 4;
  const itemsShown = Math.max(0, phase - 4);

  return (
    <div ref={ref} className={`${FRAME} grid gap-4 sm:grid-cols-2`}>
      <div>
        <p className="eyebrow mb-2">Meeting notes</p>
        <p className="min-h-[7.5rem] rounded-xl border border-line bg-primary-50/80 p-3 leading-relaxed text-dark-700 dark:bg-dark-950 dark:text-dark-300">
          {NOTES.map((sentence, i) => (
            <span
              key={sentence}
              className={`${FADE} ${phase > i ? 'opacity-100' : 'opacity-0'} ${
                itemsShown === i + 1
                  ? 'rounded bg-primary-100 text-primary-900 dark:bg-primary-400/20 dark:text-white'
                  : ''
              }`}
            >
              {sentence}{' '}
            </span>
          ))}
        </p>
      </div>
      <div>
        <p className="eyebrow mb-2 flex items-center gap-1">
          <Sparkles className={`h-3 w-3 ${reading ? 'animate-pulse' : ''}`} />
          {reading ? 'Reading the notes…' : 'Suggested items'}
        </p>
        <ul className="space-y-2">
          {EXTRACTED.map(([item, room], i) => (
            <li
              key={item}
              className={`flex items-center gap-2 rounded-xl border border-line px-3 py-2 ${FADE} ${shown(
                i < itemsShown
              )}`}
            >
              <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
              <span className="text-dark-900 dark:text-white">{item}</span>
              <span className={`ml-auto ${MUTED}`}>{room}</span>
            </li>
          ))}
        </ul>
        <p
          className={`mt-3 ${MUTED} ${FADE} ${shown(itemsShown >= EXTRACTED.length)}`}
        >
          You review before anything is added.
        </p>
      </div>
    </div>
  );
}

const CHANGES: [label: string, text: string, tone: string][] = [
  ['Added', 'Study table', TONE.green],
  ['Changed', 'Wardrobe: 8 ft → 10 ft', TONE.amber],
  ['Removed', 'False ceiling, hall', TONE.red],
];

/** Two quotation versions compared: v2 turns into v3 and the changes appear one at a time. */
export function VersionDiffMockup() {
  const { ref, phase } = useLoop(CHANGES.length + 2, 1100);
  const changed = Math.min(phase, CHANGES.length);

  return (
    <div ref={ref} className={FRAME}>
      <div className="mb-3 flex items-center gap-2">
        <Pill tone={TONE.blue}>v2</Pill>
        <span className={MUTED}>→</span>
        <Pill tone={TONE.green}>v3</Pill>
        <span className={`ml-auto ${MUTED}`}>
          {changed > 0
            ? `${changed} of ${CHANGES.length} changes`
            : 'Comparing…'}
        </span>
      </div>
      <ul className="space-y-2">
        {CHANGES.map(([label, text, tone], i) => (
          <li
            key={text}
            className={`flex items-center gap-2 rounded-xl border border-line px-3 py-2 ${FADE} ${shown(
              i < changed
            )}`}
          >
            <Pill tone={tone}>{label}</Pill>
            <span className="text-dark-900 dark:text-white">{text}</span>
          </li>
        ))}
      </ul>
      <p className={`mt-3 ${MUTED} ${FADE} ${shown(phase > CHANGES.length)}`}>
        Clients see only the latest version.
      </p>
    </div>
  );
}

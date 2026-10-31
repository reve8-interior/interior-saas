import { Check, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

/** Illustrative product mockups for the landing page. All names and amounts are sample data. */

const FRAME = 'surface overflow-hidden p-4 text-xs';
const MUTED = 'text-dark-500 dark:text-dark-400';

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

/** The kanban pipeline: one column per phase. */
export function PipelineMockup() {
  const columns: [string, string, string[]][] = [
    ['Discussion', TONE.blue, ['Client A']],
    ['Design', TONE.purple, ['Client B', 'Client C']],
    ['Quotation', TONE.amber, ['Client D', 'Client E']],
    ['Implementation', TONE.red, ['Client F']],
  ];
  return (
    <div className={FRAME}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {columns.map(([name, tone, clients]) => (
          <div key={name} className="space-y-2">
            <Pill tone={tone}>{name}</Pill>
            {clients.map((c) => (
              <div
                key={c}
                className="rounded-xl border border-line bg-primary-50/80 p-2.5 dark:bg-dark-950"
              >
                <p className="font-semibold text-dark-900 dark:text-white">
                  {c}
                </p>
                <p className={MUTED}>Sample project</p>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Meeting notes on the left, line items pulled from them on the right. */
export function ExtractMockup() {
  const rows = [
    ['Wardrobe, 8 ft', 'Master bedroom'],
    ['TV unit with storage', 'Living room'],
    ['Modular kitchen, L-shape', 'Kitchen'],
  ];
  return (
    <div className={`${FRAME} grid gap-4 sm:grid-cols-2`}>
      <div>
        <p className="eyebrow mb-2">Meeting notes</p>
        <p className="rounded-xl border border-line bg-primary-50/80 p-3 leading-relaxed text-dark-700 dark:bg-dark-950 dark:text-dark-300">
          Wants an 8 ft wardrobe in the master bedroom, a TV unit with storage
          in the living room, and an L-shaped modular kitchen.
        </p>
      </div>
      <div>
        <p className="eyebrow mb-2 flex items-center gap-1">
          <Sparkles className="h-3 w-3" /> Suggested items
        </p>
        <ul className="space-y-2">
          {rows.map(([item, room]) => (
            <li
              key={item}
              className="flex items-center gap-2 rounded-xl border border-line px-3 py-2"
            >
              <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />
              <span className="text-dark-900 dark:text-white">{item}</span>
              <span className={`ml-auto ${MUTED}`}>{room}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Two quotation versions side by side with the changes called out. */
export function VersionDiffMockup() {
  const changes: [string, string, string][] = [
    ['Added', 'Study table', TONE.green],
    ['Changed', 'Wardrobe: 8 ft → 10 ft', TONE.amber],
    ['Removed', 'False ceiling, hall', TONE.red],
  ];
  return (
    <div className={FRAME}>
      <div className="mb-3 flex items-center gap-2">
        <Pill tone={TONE.blue}>v2</Pill>
        <span className={MUTED}>→</span>
        <Pill tone={TONE.green}>v3</Pill>
        <span className={`ml-auto ${MUTED}`}>What changed</span>
      </div>
      <ul className="space-y-2">
        {changes.map(([label, text, tone]) => (
          <li
            key={text}
            className="flex items-center gap-2 rounded-xl border border-line px-3 py-2"
          >
            <Pill tone={tone}>{label}</Pill>
            <span className="text-dark-900 dark:text-white">{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

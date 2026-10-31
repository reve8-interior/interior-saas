'use client';

import { HelpCircle } from 'lucide-react';
import type { ExtractionQuestion } from '@/lib/checkpoints';

/**
 * What the AI could not decide from the notes, put as questions. A question
 * with a suggested sentence can be settled in one click: the sentence goes
 * into the notes and the notes are read again.
 */
export function MeetingQuestions({
  questions,
  busy,
  onUseNote,
}: {
  questions: ExtractionQuestion[];
  busy: boolean;
  onUseNote: (note: string) => void;
}) {
  if (questions.length === 0) return null;
  return (
    <section
      aria-label="Questions about these notes"
      className="rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20"
    >
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-amber-900 dark:text-amber-200">
        <HelpCircle className="h-4 w-4" aria-hidden />
        {questions.length === 1
          ? 'One thing to check in these notes'
          : `${questions.length} things to check in these notes`}
      </h3>
      <ul className="mt-2 space-y-3">
        {questions.map((q, i) => (
          <li key={i} className="text-sm text-amber-900 dark:text-amber-100">
            <p>{q.question}</p>
            {q.suggested_note ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onUseNote(q.suggested_note as string)}
                  className="btn-secondary !min-h-control !py-1 text-xs"
                >
                  Add &ldquo;{q.suggested_note}&rdquo; to the notes
                </button>
              </div>
            ) : (
              <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
                Answer it in the Notes tab, then check again.
              </p>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
        Only one room? Leave the notes as they are and use the rows below.
      </p>
    </section>
  );
}

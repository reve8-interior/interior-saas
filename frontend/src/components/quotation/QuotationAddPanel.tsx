'use client';

import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { AddFromNotes } from '@/components/checkpoints/AddFromNotes';
import { notesLockMessage } from '@/lib/aiStatus';
import { getMe } from '@/lib/profile';

/**
 * How rows get into a quotation. With AI available, notes lead because they
 * replace most of the typing; without it, hand entry leads and notes step back.
 */
export function QuotationAddPanel({
  clientId,
  hasRows,
  handLabel = 'Add rows by hand',
  handDisabled = false,
  onAddByHand,
  onNotesSaved,
}: {
  clientId: string;
  hasRows: boolean;
  handLabel?: string;
  handDisabled?: boolean;
  onAddByHand: () => void;
  onNotesSaved: (checkpointId: string) => void;
}) {
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const locked = !me || !!notesLockMessage(me.ai, me.access.plan);

  const handButton = (className: string) => (
    <button
      type="button"
      onClick={onAddByHand}
      disabled={handDisabled}
      className={className}
    >
      {handLabel}
    </button>
  );

  if (locked) {
    return hasRows ? (
      <div className="flex flex-wrap justify-end gap-2">
        {handButton('btn-primary')}
        <AddFromNotes clientId={clientId} onSaved={onNotesSaved} />
      </div>
    ) : (
      <div className="rounded-2xl border border-dashed border-line p-12 text-center">
        <p className="text-dark-500 dark:text-dark-400">
          No items yet. Add this client&apos;s rooms and rows.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {handButton('btn-primary')}
          <AddFromNotes clientId={clientId} onSaved={onNotesSaved} />
        </div>
      </div>
    );
  }

  if (hasRows) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary-500/50 bg-primary-50/70 px-4 py-3 dark:bg-primary-500/10">
        <Sparkles
          className="h-5 w-5 shrink-0 text-primary-600 dark:text-primary-300"
          aria-hidden
        />
        <p className="min-w-0 flex-1 basis-56 text-sm font-medium text-dark-900 dark:text-white">
          Client asked for changes? Paste the notes and AI drafts the updates.
        </p>
        <div className="flex flex-wrap gap-2 max-sm:w-full max-sm:[&>*]:flex-1">
          <AddFromNotes
            clientId={clientId}
            onSaved={onNotesSaved}
            className="btn-primary"
          />
          {handButton('btn-secondary')}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-primary-500/50 bg-primary-50/70 p-8 text-center dark:bg-primary-500/10 sm:p-12">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-500/15 text-primary-600 dark:text-primary-300">
        <Sparkles className="h-6 w-6" aria-hidden />
      </span>
      <h2 className="mt-4 font-heading text-xl font-extrabold tracking-tight text-dark-900 dark:text-white">
        Skip the typing: fill this quotation from your notes
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-dark-600 dark:text-dark-300">
        Paste meeting notes or a WhatsApp chat. AI drafts every room and row,
        and you check them before anything is added.
      </p>
      <div className="mt-5 flex justify-center">
        <AddFromNotes
          clientId={clientId}
          onSaved={onNotesSaved}
          className="btn-primary"
        />
      </div>
      <p className="mt-4 text-sm text-dark-600 dark:text-dark-300">
        Prefer typing?{' '}
        <button
          type="button"
          onClick={onAddByHand}
          disabled={handDisabled}
          className="inline-flex min-h-control items-center font-semibold text-primary-700 underline hover:no-underline dark:text-primary-300"
        >
          {handLabel}
        </button>
      </p>
    </div>
  );
}

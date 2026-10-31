'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { notesLockMessage } from '@/lib/aiStatus';
import { getMe } from '@/lib/profile';
import { Modal } from '@/components/ui/Modal';
import { AiExtractModal } from './AiExtractModal';

/**
 * The way into AI extraction. When AI can't run it stays visible and explains
 * why, so hand entry never depends on it.
 */
export function AddFromNotes({
  clientId,
  onSaved,
  className = 'btn-secondary',
}: {
  clientId: string;
  onSaved: (checkpointId: string) => void;
  className?: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const lockMessage = me ? notesLockMessage(me.ai, me.access.plan) : null;
  const remaining = me?.ai.remaining;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <Sparkles className="h-4 w-4" aria-hidden />
        Add from notes
        {lockMessage && me?.access.plan === 'free' && !me.ai.enabled && (
          <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-semibold text-primary-700 dark:bg-primary-500/20 dark:text-primary-200">
            Pro
          </span>
        )}
        {!lockMessage && remaining != null && (
          <span className="text-xs font-normal tabular-nums opacity-80">
            {remaining} left
          </span>
        )}
      </button>

      {open && lockMessage && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title="Fill quotations from meeting notes"
          maxWidth="md"
        >
          <p className="text-sm text-dark-600 dark:text-dark-300">
            {lockMessage}
          </p>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn-primary"
            >
              Got it
            </button>
          </div>
        </Modal>
      )}

      {open && !lockMessage && (
        <AiExtractModal
          clientId={clientId}
          onClose={() => setOpen(false)}
          onSaved={(checkpointId) => {
            setOpen(false);
            qc.invalidateQueries({ queryKey: ['me'] });
            onSaved(checkpointId);
          }}
        />
      )}
    </>
  );
}

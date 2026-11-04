'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, FileText, ScanLine, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { notesLockMessage } from '@/lib/aiStatus';
import { getMe } from '@/lib/profile';
import { Modal } from '@/components/ui/Modal';
import { FloorPlanModal } from '@/components/quotation/FloorPlanModal';
import { AiExtractModal } from './AiExtractModal';

type Flow = 'notes' | 'plan';

/**
 * The one way into AI drafting: meeting notes or a floor plan. When AI can't
 * run it stays visible and explains why, so hand entry never depends on it.
 */
export function AddWithAi({
  clientId,
  onSaved,
  className = 'btn-secondary',
}: {
  clientId: string;
  onSaved: (checkpointId: string) => void;
  className?: string;
}) {
  const qc = useQueryClient();
  const [menuOpen, setMenuOpen] = useState(false);
  const [flow, setFlow] = useState<Flow | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: getMe });
  const lockMessage = me ? notesLockMessage(me.ai, me.access.plan) : null;
  const remaining = me?.ai.remaining;

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  function choose(next: Flow) {
    setMenuOpen(false);
    setFlow(next);
  }

  function handleSaved(checkpointId: string) {
    setFlow(null);
    qc.invalidateQueries({ queryKey: ['me'] });
    onSaved(checkpointId);
  }

  return (
    <>
      <div ref={rootRef} className="relative inline-block">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className={className}
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          Add with AI
          {lockMessage && me?.access.plan === 'free' && !me.ai.enabled && (
            <span className="rounded-control bg-primary-100 px-2 py-0.5 text-xs font-semibold text-primary-700 dark:bg-primary-500/20 dark:text-primary-200">
              Pro
            </span>
          )}
          {!lockMessage && remaining != null && (
            <span className="text-xs font-normal tabular-nums opacity-80">
              {remaining} left
            </span>
          )}
          <ChevronDown className="h-4 w-4" aria-hidden />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 z-30 mt-1 w-64 rounded-xl border border-line bg-surface p-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => choose('notes')}
              className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-primary-50 dark:hover:bg-primary-500/10"
            >
              <FileText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                <span className="block text-sm font-semibold">
                  From meeting notes
                </span>
                <span className="block text-xs opacity-70">
                  Paste text, a chat or a voice note
                </span>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => choose('plan')}
              className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-primary-50 dark:hover:bg-primary-500/10"
            >
              <ScanLine className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                <span className="block text-sm font-semibold">
                  From floor plan
                </span>
                <span className="block text-xs opacity-70">
                  Upload a plan image to draft rooms and rows
                </span>
              </span>
            </button>
          </div>
        )}
      </div>

      {flow && lockMessage && (
        <Modal
          open
          onClose={() => setFlow(null)}
          title="Draft quotations with AI"
          maxWidth="md"
        >
          <p className="text-sm text-dark-600 dark:text-dark-300">
            {lockMessage}
          </p>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => setFlow(null)}
              className="btn-primary"
            >
              Got it
            </button>
          </div>
        </Modal>
      )}

      {flow === 'notes' && !lockMessage && (
        <AiExtractModal
          clientId={clientId}
          onClose={() => setFlow(null)}
          onSaved={handleSaved}
        />
      )}

      {flow === 'plan' && !lockMessage && (
        <FloorPlanModal
          clientId={clientId}
          onClose={() => setFlow(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}

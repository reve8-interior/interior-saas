'use client';

import { CheckCircle2, MessageCircleQuestion } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { INPUT_CLS } from '@/lib/constants';
import { errorMessage } from '@/lib/errors';
import { respondToSharedQuotation } from '@/lib/quotationVersions';

const NAME_KEY = 'customer-name';

function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Private mode: the customer just retypes their name next time.
  }
}

/** Lets the customer ask about one line of a shared quotation. */
export function LineQuestionButton({
  token,
  label,
}: {
  token: string;
  /** "Room · line", shown to the designer with the question. */
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const show = () => {
    setName((n) => n || savedName());
    setOpen(true);
  };

  const submit = async () => {
    if (!name.trim()) return toast.error('Please enter your name');
    if (!message.trim()) return toast.error('Please write your question');
    setBusy(true);
    try {
      await respondToSharedQuotation(token, {
        kind: 'question',
        name: name.trim(),
        message: message.trim(),
        item_label: label,
      });
      saveName(name.trim());
      setSent(true);
      setMessage('');
      setOpen(false);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not send. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-label={`Ask about ${label}`}
        title={sent ? 'Question sent. Ask another' : 'Ask about this line'}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-text/5 hover:text-brand print:hidden"
      >
        {sent ? (
          <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden />
        ) : (
          <MessageCircleQuestion className="h-4 w-4" aria-hidden />
        )}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Ask about this line"
        maxWidth="md"
      >
        <div className="space-y-3">
          <p className="rounded-control bg-surface-2 px-3 py-2 text-sm text-muted">
            {label}
          </p>
          <div>
            <label htmlFor="line-name" className="field-label">
              Your name
            </label>
            <input
              id="line-name"
              className={INPUT_CLS}
              autoComplete="name"
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="line-message" className="field-label">
              Your question
            </label>
            <textarea
              id="line-message"
              className={`${INPUT_CLS} min-h-[80px]`}
              maxLength={2000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="btn-primary"
            >
              {busy ? 'Sending…' : 'Send question'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

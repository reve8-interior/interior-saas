'use client';

import { CheckCircle2, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { INPUT_CLS } from '@/lib/constants';
import { errorMessage } from '@/lib/errors';
import { respondToSharedQuotation } from '@/lib/quotationVersions';
import type { ShareResponseKind } from '@/lib/schemas/quotationVersion';

/** Lets the customer approve a shared quotation or ask a question without an account. */
export function CustomerResponseBar({
  token,
  initialKind,
  contactEmail,
  contactPhone,
}: {
  token: string;
  initialKind: ShareResponseKind | null;
  contactEmail: string | null;
  contactPhone: string | null;
}) {
  const [sent, setSent] = useState<ShareResponseKind | null>(initialKind);
  const [open, setOpen] = useState<ShareResponseKind | null>(null);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) return toast.error('Please enter your name');
    if (open === 'question' && !message.trim())
      return toast.error('Please write your question');
    setBusy(true);
    try {
      await respondToSharedQuotation(token, {
        kind: open!,
        name: name.trim(),
        message: message.trim() || null,
      });
      setSent(open);
      setOpen(null);
    } catch (e) {
      toast.error(errorMessage(e, 'Could not send. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const reach = [contactPhone, contactEmail].filter(Boolean).join(' · ');

  return (
    <section
      aria-label="Your response"
      className="surface space-y-3 p-4 print:hidden"
    >
      {sent && (
        <p role="status" className="flex items-center gap-2 text-sm text-text">
          <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden />
          {sent === 'approved'
            ? 'Thanks. Your approval has been sent to your designer.'
            : 'Thanks. Your question has been sent to your designer.'}
        </p>
      )}
      {
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setOpen('approved')}
            className="btn-primary"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            Approve this quotation
          </button>
          <button
            type="button"
            onClick={() => setOpen('question')}
            className="btn-secondary"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            Ask a question
          </button>
        </div>
      }
      <Modal
        open={open !== null}
        onClose={() => setOpen(null)}
        title={
          open === 'approved' ? 'Approve this quotation' : 'Ask a question'
        }
        maxWidth="md"
      >
        <div className="space-y-3">
          <div>
            <label htmlFor="resp-name" className="field-label">
              Your name
            </label>
            <input
              id="resp-name"
              className={INPUT_CLS}
              autoComplete="name"
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="resp-message" className="field-label">
              {open === 'question' ? 'Your question' : 'Comment (optional)'}
            </label>
            <textarea
              id="resp-message"
              className={`${INPUT_CLS} min-h-[80px]`}
              maxLength={2000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(null)}
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
              {busy
                ? 'Sending…'
                : open === 'approved'
                  ? 'Send approval'
                  : 'Send question'}
            </button>
          </div>
        </div>
      </Modal>
      {reach && (
        <p className="text-xs text-muted">Or contact your designer: {reach}</p>
      )}
    </section>
  );
}

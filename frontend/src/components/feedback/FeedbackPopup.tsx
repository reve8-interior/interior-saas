'use client';

import { Button } from '@/components/ui';
import { errorMessage } from '@/lib/errors';
import {
  getNextPrompt,
  isDueForPrompt,
  loadLastShown,
  randomDelay,
  saveLastShown,
  submitFeedback,
} from '@/lib/feedback';
import { FeedbackPrompt } from '@/lib/schemas/feedback';
import { useMutation } from '@tanstack/react-query';
import { Star, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

interface FeedbackPopupProps {
  userId: string;
}

/**
 * Asks about one random feature, now and then: stars, then an optional
 * multiple-choice follow-up. Shown after a random pause and at most once per
 * cooldown, so it stays an occasional nudge rather than a nag.
 */
export function FeedbackPopup({ userId }: FeedbackPopupProps) {
  const [prompt, setPrompt] = useState<FeedbackPrompt | null>(null);
  const [rating, setRating] = useState(0);
  const [choice, setChoice] = useState<string | null>(null);

  useEffect(() => {
    if (!isDueForPrompt(loadLastShown(userId))) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const next = await getNextPrompt();
        if (cancelled || !next) return;
        saveLastShown(userId);
        setPrompt(next);
      } catch {
        // A failed lookup just skips this round.
      }
    }, randomDelay());
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [userId]);

  const mutation = useMutation({
    mutationFn: () =>
      submitFeedback({
        feature: prompt?.feature ?? '',
        rating,
        choice,
      }),
    onSuccess: () => {
      toast.success('Thanks for the feedback!');
      setPrompt(null);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (!prompt) return null;

  return (
    <section
      role="dialog"
      aria-label="Quick feedback"
      className="surface fixed bottom-[calc(env(safe-area-inset-bottom)+6.5rem)] left-4 right-4 z-40 max-h-[70dvh] max-w-sm space-y-3 overflow-y-auto p-4 sm:bottom-6 sm:left-auto sm:right-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">
            {prompt.title}
          </p>
          <h2 className="mt-1 text-sm font-extrabold tracking-tight">
            {prompt.question}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setPrompt(null)}
          aria-label="Dismiss feedback"
          className="icon-btn -m-2"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex gap-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onClick={() => setRating(n)}
            className="icon-btn"
          >
            <Star
              className={`h-6 w-6 ${
                n <= rating
                  ? 'fill-amber-400 text-amber-400'
                  : 'text-dark-400 dark:text-dark-500'
              }`}
            />
          </button>
        ))}
      </div>

      {rating > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted">
            {prompt.choice_question}{' '}
            <span className="font-normal text-faint">(optional)</span>
          </p>
          <div className="flex flex-wrap gap-2" role="radiogroup">
            {prompt.options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={choice === o.value}
                onClick={() => setChoice(choice === o.value ? null : o.value)}
                className={`chip min-h-9 ${
                  choice === o.value
                    ? 'border-brand bg-brand/10 text-accent-text'
                    : 'hover:border-brand/45'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              isLoading={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              Send
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

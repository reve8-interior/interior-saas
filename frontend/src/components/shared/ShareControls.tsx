'use client';

import { Check, Copy, Mail, MessageCircle, Share2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { INPUT_CLS } from '@/lib/constants';

export async function copyLink(url: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Link copied');
  } catch {
    toast.error('Copy failed — select the link and copy it manually');
  }
}

const PRESETS: { label: string; days: number | null }[] = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: 'No expiry', days: null },
];

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

const presetValue = (days: number | null): string => {
  if (days === null) return '';
  const d = new Date();
  d.setDate(d.getDate() + days);
  return isoDay(d);
};

/** A sensible default for new links: a month, so forgotten links don't live forever. */
export const defaultExpiry = (): string => presetValue(30);

/** Expiry as quick presets plus a custom date; value is a YYYY-MM-DD string or ''. */
export function ExpiryPicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-xs text-dark-500 dark:text-dark-300"
      >
        Link expires
      </label>
      <div
        className="mb-2 flex flex-wrap gap-2"
        role="group"
        aria-label="Expiry presets"
      >
        {PRESETS.map(({ label, days }) => {
          const target = presetValue(days);
          return (
            <button
              key={label}
              type="button"
              aria-pressed={value === target}
              onClick={() => onChange(target)}
              className="filter-chip"
            >
              {label}
            </button>
          );
        })}
      </div>
      <input
        id={id}
        type="date"
        min={isoDay(new Date())}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT_CLS} max-w-48`}
      />
      <p className="mt-1 text-xs text-dark-500 dark:text-dark-400">
        {value
          ? `Stops working after ${new Date(`${value}T23:59:59`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}, 23:59 your time.`
          : 'The link keeps working until you stop sharing.'}
      </p>
    </div>
  );
}

/** Copy / WhatsApp / Email / native-share actions for a freshly created link. */
export function SendLinkPanel({
  url,
  message,
  subject,
}: {
  url: string;
  message: string;
  subject: string;
}) {
  const [copied, setCopied] = useState(false);
  const canNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const nativeShare = async () => {
    try {
      await navigator.share({ title: subject, text: message, url });
    } catch {
      // Dismissing the share sheet rejects; nothing to report.
    }
  };

  return (
    <section
      aria-label="Link created"
      className="space-y-3 rounded-lg border border-primary-200 bg-primary-50/50 p-3 dark:border-primary-500/40 dark:bg-primary-600/10"
    >
      <p className="break-all font-mono text-xs text-dark-700 dark:text-dark-300">
        {url}
      </p>
      <div className="flex flex-wrap gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${message} ${url}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          WhatsApp
        </a>
        {canNativeShare && (
          <button type="button" onClick={nativeShare} className="btn-secondary">
            <Share2 className="h-4 w-4" aria-hidden />
            More…
          </button>
        )}
        <a
          href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${message}\n${url}`)}`}
          className="btn-secondary"
        >
          <Mail className="h-4 w-4" aria-hidden />
          Email
        </a>
        <button
          type="button"
          onClick={() => {
            copyLink(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="btn-secondary"
        >
          {copied ? (
            <Check className="h-4 w-4" aria-hidden />
          ) : (
            <Copy className="h-4 w-4" aria-hidden />
          )}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </section>
  );
}

/** "Stop sharing" that asks first: the customer loses access immediately. */
export function StopSharingButton({
  onConfirm,
  disabled,
}: {
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        disabled={disabled}
        className="btn-secondary text-red-600 dark:text-red-400"
      >
        Stop sharing
      </button>
    );
  }
  return (
    <span
      role="group"
      aria-label="Confirm stop sharing"
      className="flex items-center gap-2"
    >
      <span className="text-xs text-dark-600 dark:text-dark-300">
        Anyone with the link loses access.
      </span>
      <button
        type="button"
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
        disabled={disabled}
        className="min-h-control rounded-full bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
      >
        Stop
      </button>
      <button
        type="button"
        onClick={() => setAsking(false)}
        className="btn-secondary"
      >
        Keep
      </button>
    </span>
  );
}

'use client';

import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { INPUT_CLS } from '@/lib/constants';
import { checkSlug, slugify } from '@/lib/site';
import { publicSiteUrl } from '@/lib/siteUrl';
import { errorMessage } from '@/lib/errors';
import { useEffect, useState } from 'react';

const DEBOUNCE_MS = 400;

type CheckState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'unavailable'; message: string };

interface SlugFieldProps {
  /** The saved slug, if any. */
  value: string | null;
  saving: boolean;
  onSave: (slug: string) => void;
  /** Withdraw the saved address; the control is hidden when omitted. */
  onClear?: () => void;
  clearing?: boolean;
  /** Free gallery sites go live as soon as an address is saved. */
  publicOnSave?: boolean;
}

/** Slug input with a live preview of the public URL and a debounced availability check. */
export function SlugField({
  value,
  saving,
  onSave,
  onClear,
  clearing = false,
  publicOnSave = false,
}: SlugFieldProps) {
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [input, setInput] = useState(value ?? '');
  const [check, setCheck] = useState<CheckState>({ status: 'idle' });
  const slug = slugify(input);
  const unchanged = slug === (value ?? '');

  useEffect(() => {
    setInput(value ?? '');
  }, [value]);

  useEffect(() => {
    if (!slug || unchanged) {
      setCheck({ status: 'idle' });
      return;
    }
    setCheck({ status: 'checking' });
    let cancelled = false;
    const timer = setTimeout(() => {
      checkSlug(slug)
        .then((res) => {
          if (cancelled) return;
          setCheck(
            res.available
              ? { status: 'available' }
              : {
                  status: 'unavailable',
                  message: res.reason ?? 'Already taken',
                }
          );
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          setCheck({
            status: 'unavailable',
            message: errorMessage(err, "Couldn't check this address"),
          });
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [slug, unchanged]);

  const canSave = check.status === 'available' && !saving;

  return (
    <div className="space-y-2">
      <label htmlFor="site-slug" className="label-text">
        Your web address
      </label>
      <div className="flex gap-2">
        <input
          id="site-slug"
          className={INPUT_CLS}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={60}
          autoComplete="off"
          placeholder="your-studio"
        />
        <button
          type="button"
          className="btn-primary shrink-0"
          disabled={!canSave}
          onClick={() => onSave(slug)}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
      {slug && (
        <p data-testid="slug-preview" className="break-all text-sm">
          {publicSiteUrl(slug)}
        </p>
      )}
      {publicOnSave && (
        <p className="text-xs text-dark-500">
          This address is public as soon as you save it.
        </p>
      )}
      <div aria-live="polite" className="min-h-5 text-sm">
        {check.status === 'checking' && (
          <span className="text-dark-500">Checking…</span>
        )}
        {check.status === 'available' && (
          <span className="text-green-600">Available</span>
        )}
        {check.status === 'unavailable' && (
          <span className="text-red-600">{check.message}</span>
        )}
      </div>
      {onClear && value && (
        <>
          <button
            type="button"
            className="text-sm text-red-600 underline"
            onClick={() => setConfirmingClear(true)}
          >
            Remove public address
          </button>
          <ConfirmDeleteModal
            isOpen={confirmingClear}
            isLoading={clearing}
            title="Remove public address"
            description="Your public link will stop working. You can choose an address again later."
            confirmLabel="Remove"
            onCancel={() => setConfirmingClear(false)}
            onConfirm={() => {
              setConfirmingClear(false);
              onClear();
            }}
          />
        </>
      )}
    </div>
  );
}

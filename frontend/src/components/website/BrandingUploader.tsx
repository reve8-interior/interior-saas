'use client';

import { errorMessage } from '@/lib/errors';
import { uploadBranding } from '@/lib/site';
import type { BrandingKind } from '@/lib/schemas/site';
import { ChangeEvent, useState } from 'react';
import { toast } from 'sonner';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface BrandingUploaderProps {
  kind: BrandingKind;
  label: string;
  currentUrl: string | null;
  onUploaded: (url: string) => void;
}

/** Logo or hero image picker: checks the file type, uploads at once and previews the result. */
export function BrandingUploader({
  kind,
  label,
  currentUrl,
  onUploaded,
}: BrandingUploaderProps) {
  const [busy, setBusy] = useState(false);
  const inputId = `branding-${kind}`;

  async function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Use a JPG, PNG or WebP image');
      return;
    }
    setBusy(true);
    try {
      const { url } = await uploadBranding(kind, file);
      onUploaded(url);
      toast.success(`${label} updated`);
    } catch (err) {
      toast.error(errorMessage(err, `Couldn't upload the ${label}`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <span className="label-text">{label}</span>
      <div
        className={`flex items-center justify-center overflow-hidden rounded-xl border border-dashed border-dark-300 dark:border-white/15 ${
          kind === 'hero' ? 'aspect-[16/6]' : 'h-24 w-24'
        }`}
      >
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={currentUrl}
            alt={`${label} preview`}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="text-xs text-dark-500">None yet</span>
        )}
      </div>
      <label htmlFor={inputId} className="btn-secondary inline-flex">
        {busy ? 'Uploading…' : currentUrl ? 'Replace' : 'Upload'}
      </label>
      <input
        id={inputId}
        type="file"
        accept={ALLOWED_TYPES.join(',')}
        className="sr-only"
        disabled={busy}
        onChange={onChange}
      />
    </div>
  );
}

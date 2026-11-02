'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Eye, EyeOff, Link2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { shareStatus } from '@/lib/shareStatus';
import { ATTENTION_KEY } from '@/lib/attention';
import { endOfDayIso } from '@/lib/dates';
import { INPUT_CLS } from '@/lib/constants';
import { fmtDateLong } from '@/lib/format';
import {
  createVersionShare,
  listVersionShares,
  moveShareLink,
  revokeVersionShare,
  updateVersionShareExpiry,
} from '@/lib/quotationVersions';
import type {
  QuotationShare,
  QuotationVersionSummary,
} from '@/lib/schemas/quotationVersion';
import { errorMessage } from '@/lib/errors';
import {
  StopSharingButton,
  copyLink,
  CopyLinkButton,
  defaultExpiry,
} from '@/components/shared/ShareControls';
import { Modal } from '@/components/ui/Modal';
import { useSharedVersion } from './KeepLinkToggle';
import { imageCount } from './PanelParts';

const STATUS_BADGE = {
  active:
    'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300',
  expired:
    'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300',
  revoked: 'bg-surface-2 text-muted',
} as const;

const STATUS_LABEL = {
  active: 'Link is on',
  expired: 'Link expired',
  revoked: 'Link stopped',
} as const;

/**
 * The customer link for one version, in a popup: create it, copy it, extend
 * or stop it. Only one version is shared at a time.
 */
export function ShareModal({
  clientId,
  version,
  open,
  onClose,
}: {
  clientId: string;
  version: QuotationVersionSummary;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [showPrices, setShowPrices] = useState(false);
  const [expires, setExpires] = useState(defaultExpiry);
  const sharesKey = ['quotation-shares', version.id];
  // Which version is shared (and its reply) shows on the versions list and Inbox.
  const refresh = () => {
    qc.invalidateQueries({ queryKey: sharesKey });
    qc.invalidateQueries({ queryKey: ['quotation-versions'] });
    qc.invalidateQueries({ queryKey: ATTENTION_KEY });
  };

  const { data: shares = [] } = useQuery<QuotationShare[]>({
    queryKey: sharesKey,
    queryFn: () => listVersionShares(version.id),
  });

  // The customer already has a link, on another version: move it here rather
  // than offer to create a second one.
  const sharedVersion = useSharedVersion(clientId);
  const elsewhere =
    sharedVersion && sharedVersion.id !== version.id ? sharedVersion : null;
  const moveHere = !!elsewhere && shares.length === 0;
  // Shown so the link can be copied without moving it first.
  const { data: currentShares = [] } = useQuery<QuotationShare[]>({
    queryKey: ['quotation-shares', elsewhere?.id],
    queryFn: () => listVersionShares(elsewhere!.id),
    enabled: moveHere,
  });
  const currentLink = currentShares[0];
  const move = useMutation({
    mutationFn: () => moveShareLink(elsewhere!.id, version.id),
    onSuccess: () => {
      refresh();
      toast.success(`Your customer's link now shows version ${version.number}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const create = useMutation({
    mutationFn: () =>
      createVersionShare(version.id, {
        show_prices: showPrices,
        // The date input has no time; expire at the end of that day.
        expires_at: endOfDayIso(expires),
      }),
    onSuccess: (share) => {
      refresh();
      copyLink(share.url);
      setExpires(defaultExpiry());
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const stop = useMutation({
    mutationFn: (shareId: string) => revokeVersionShare(version.id, shareId),
    onSuccess: () => {
      refresh();
      toast.success('Link deleted. It no longer opens.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  // Push the end date 30 days past today (or its current end if later), which
  // also revives an expired link under the same URL.
  const extend = useMutation({
    mutationFn: (share: QuotationShare) => {
      const base = Math.max(
        Date.now(),
        share.expires_at ? new Date(share.expires_at).getTime() : 0
      );
      return updateVersionShareExpiry(
        version.id,
        share.id,
        new Date(base + 30 * 86_400_000).toISOString()
      );
    },
    onSuccess: (share) => {
      qc.invalidateQueries({ queryKey: sharesKey });
      toast.success(`Link now works till ${fmtDateLong(share.expires_at!)}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  // Same settings, fresh URL: handy for sending to a second person.
  const duplicate = useMutation({
    mutationFn: (share: QuotationShare) =>
      createVersionShare(version.id, {
        show_prices: share.show_prices,
        // An expired source gets a fresh 30 days rather than a never-expiring link.
        expires_at: !share.expires_at
          ? null
          : new Date(share.expires_at) > new Date()
            ? share.expires_at
            : new Date(Date.now() + 30 * 86_400_000).toISOString(),
      }),
    onSuccess: (share) => {
      refresh();
      copyLink(share.url);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const today = new Date().toISOString().slice(0, 10);
  const images = imageCount(version.room_designs);

  const choice = (on: boolean, title: string, hint: string) => {
    const selected = showPrices === on;
    const Icon = on ? Eye : EyeOff;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={() => setShowPrices(on)}
        className={`flex flex-1 items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors ${
          selected
            ? 'border-primary-500 bg-primary-50 dark:bg-primary-600/20'
            : 'border-line hover:border-primary-300 dark:border-line'
        }`}
      >
        <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <span>
          <span className="block text-sm font-semibold text-dark-900 dark:text-white">
            {title}
          </span>
          <span className="block text-xs text-dark-600 dark:text-dark-300">
            {hint}
          </span>
        </span>
      </button>
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Share version ${version.number}`}
      maxWidth="xl"
    >
      <div className="space-y-8">
        {!version.is_active && (
          <p className="rounded-xl bg-orange-100 p-3 text-sm text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
            This version is inactive. Its links do not open. Activate it to
            share.
          </p>
        )}
        {moveHere && (
          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-dark-900 dark:text-white">
              Your customer already has a link
            </h4>
            <p className="text-sm text-dark-600 dark:text-dark-300">
              It shows version {elsewhere.number} now. Show version{' '}
              {version.number} on the same link: they keep the link, see this
              version, and the link&apos;s prices and end date stay as they are.
            </p>
            {currentLink && (
              <div className="space-y-2 rounded-xl bg-surface-2 p-4">
                <p className="break-all font-mono text-xs text-dark-700 dark:text-dark-300">
                  {currentLink.url}
                </p>
                <CopyLinkButton url={currentLink.url} />
              </div>
            )}
          </section>
        )}
        <section className={moveHere ? 'hidden' : 'space-y-5'}>
          <h4 className="text-sm font-semibold text-dark-900 dark:text-white">
            Create a link for your customer
          </h4>

          <div
            role="radiogroup"
            aria-label="Prices"
            className="flex flex-col gap-3 sm:flex-row"
          >
            {choice(
              false,
              'Hide prices',
              'Customer sees items and sizes only.'
            )}
            {choice(
              true,
              'Show prices',
              'Customer also sees rate, amount and total.'
            )}
          </div>

          <div>
            <label className="field-label" htmlFor="share-expiry">
              Link works till (optional)
            </label>
            <input
              id="share-expiry"
              type="date"
              min={today}
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
              className={`${INPUT_CLS} max-w-48`}
            />
          </div>

          <p className="text-sm text-dark-600 dark:text-dark-300">
            Customer will see: version {version.number}, {images} image
            {images === 1 ? '' : 's'}, prices {showPrices ? 'shown' : 'hidden'}.
          </p>
          <p className="text-sm text-dark-600 dark:text-dark-300">
            Only one version is shared at a time. If another version is already
            shared, its link moves to this one, so your customer keeps the same
            link and sees the update.
          </p>
        </section>

        <section className={moveHere ? 'hidden' : 'space-y-3'}>
          <h4 className="text-sm font-semibold text-dark-900 dark:text-white">
            Links for this version
          </h4>
          {shares.length === 0 ? (
            <p className="text-sm text-dark-500 dark:text-dark-400">
              No link yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {shares.map((share) => {
                const status = shareStatus(share);
                return (
                  <li
                    key={share.id}
                    className="space-y-3 rounded-xl bg-surface-2 p-4 dark:border-line"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`badge font-medium ${STATUS_BADGE[status]}`}
                      >
                        {STATUS_LABEL[status]}
                      </span>
                      <span className="text-dark-500 dark:text-dark-400">
                        {share.show_prices ? 'Prices shown' : 'Prices hidden'}
                        {' · '}
                        {share.expires_at
                          ? `Till ${fmtDateLong(share.expires_at)}`
                          : 'No end date'}
                        {' · '}
                        Made {fmtDateLong(share.created_at)}
                      </span>
                    </div>
                    <p className="text-xs text-dark-600 dark:text-dark-300">
                      {share.view_count === 0
                        ? 'Not opened yet'
                        : `Opened ${share.view_count}×${
                            share.last_viewed_at
                              ? ` · last ${fmtDateLong(share.last_viewed_at)}`
                              : ''
                          }`}
                    </p>
                    <p className="break-all font-mono text-xs text-dark-700 dark:text-dark-300">
                      {share.url}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {status === 'active' && (
                        <>
                          <CopyLinkButton url={share.url} />
                          <a
                            href={share.url}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-secondary"
                          >
                            <ExternalLink className="h-4 w-4" aria-hidden />
                            See what customer sees
                          </a>
                        </>
                      )}
                      {(status === 'expired' || share.expires_at) && (
                        <button
                          type="button"
                          onClick={() => extend.mutate(share)}
                          disabled={extend.isPending}
                          className="btn-secondary"
                        >
                          {status === 'expired'
                            ? 'Renew 30 days'
                            : 'Extend 30 days'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => duplicate.mutate(share)}
                        disabled={duplicate.isPending || !version.is_active}
                        className="btn-secondary"
                      >
                        Duplicate link
                      </button>
                      {status === 'active' ? (
                        <StopSharingButton
                          onConfirm={() => stop.mutate(share.id)}
                          disabled={stop.isPending}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => stop.mutate(share.id)}
                          disabled={stop.isPending}
                          className="btn-secondary text-red-600 dark:text-red-400"
                        >
                          Delete link
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <button type="button" onClick={onClose} className="btn-secondary">
            Close
          </button>
          {moveHere ? (
            <button
              type="button"
              onClick={() => move.mutate()}
              disabled={move.isPending || !version.is_active}
              className="btn-primary"
            >
              <Link2 className="h-4 w-4" aria-hidden />
              {move.isPending
                ? 'Updating…'
                : `Show version ${version.number} on this link`}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => create.mutate()}
              disabled={create.isPending || !version.is_active}
              className="btn-primary"
            >
              <Link2 className="h-4 w-4" aria-hidden />
              {create.isPending ? 'Creating…' : 'Create link and copy'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

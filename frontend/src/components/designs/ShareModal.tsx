'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { shareStatus } from '@/lib/shareStatus';
import { endOfDayIso } from '@/lib/dates';
import { Modal } from '@/components/ui/Modal';
import {
  defaultExpiry,
  ExpiryPicker,
  SendLinkPanel,
  StopSharingButton,
  CopyLinkButton,
} from '@/components/shared/ShareControls';
import {
  createShareLink,
  listShareLinks,
  revokeShareLink,
} from '@/lib/designs';
import type { ShareLink } from '@/lib/schemas/design';
import { fmtDate } from '@/lib/format';
import { errorMessage } from '@/lib/errors';

interface ShareModalProps {
  clientId: string;
  /** Images chosen on the page; the link covers exactly these. */
  designIds: string[];
  onClose: () => void;
}

/** Create and manage the public view-only links for a client's designs. */
export function ShareModal({ clientId, designIds, onClose }: ShareModalProps) {
  const qc = useQueryClient();
  const [showPrices, setShowPrices] = useState(false);
  const [expires, setExpires] = useState(defaultExpiry);

  const { data: links = [] } = useQuery<ShareLink[]>({
    queryKey: ['share-links', clientId],
    queryFn: () => listShareLinks(clientId),
  });

  // The customer's stable link: sharing again updates it instead of adding one.
  const current = links.find((l) => l.readable && shareStatus(l) === 'active');

  // Start from the link's own settings so updating it changes only the images.
  useEffect(() => {
    if (!current) return;
    setShowPrices(current.show_prices);
    setExpires(
      current.expires_at
        ? new Date(current.expires_at).toLocaleDateString('en-CA')
        : ''
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const refresh = () =>
    qc.invalidateQueries({ queryKey: ['share-links', clientId] });

  const create = useMutation({
    mutationFn: () =>
      createShareLink(clientId, {
        design_ids: designIds,
        show_prices: showPrices,
        // The date input has no time; expire at the end of that day.
        expires_at: endOfDayIso(expires),
      }),
    onSuccess: (link) => {
      refresh();
      toast.success(
        link.id === current?.id
          ? 'Link updated. The customer keeps the same link.'
          : 'Link created'
      );
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeShareLink(clientId, id),
    onSuccess: () => {
      refresh();
      toast.success('Sharing stopped');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Share with customer"
      description="Anyone with the link can view the images. They cannot edit anything."
      maxWidth="xl"
    >
      <div className="space-y-6">
        <section className="space-y-3">
          <h3 className="type-label">{current ? 'Update link' : 'New link'}</h3>

          <p className="text-sm text-dark-700 dark:text-dark-300">
            {designIds.length} image{designIds.length === 1 ? '' : 's'} selected
          </p>
          {current && (
            <p className="text-xs text-dark-500 dark:text-dark-400">
              The customer already has a link. Updating it changes the images
              they see; the link itself stays the same.
            </p>
          )}

          <div>
            <label
              htmlFor="share-show-prices"
              className="flex items-center gap-2 text-sm text-dark-800 dark:text-dark-200"
            >
              <input
                id="share-show-prices"
                type="checkbox"
                checked={showPrices}
                onChange={(e) => setShowPrices(e.target.checked)}
              />
              Show rates to the customer
            </label>
            <p className="mt-1 text-xs text-dark-500 dark:text-dark-400">
              Off by default: the customer sees images and notes only.
            </p>
          </div>

          <ExpiryPicker
            id="share-expiry"
            value={expires}
            onChange={setExpires}
          />

          <button
            type="button"
            onClick={() => create.mutate()}
            disabled={create.isPending || designIds.length === 0}
            className="btn-primary"
          >
            <Link2 className="h-4 w-4" />
            {create.isPending
              ? current
                ? 'Updating…'
                : 'Creating…'
              : current
                ? 'Update link'
                : 'Create link'}
          </button>
        </section>

        {current && (
          <SendLinkPanel
            url={current.url}
            message="Here are the designs we discussed:"
            subject="Your designs"
          />
        )}

        <section className="space-y-2">
          <h3 className="type-label">Existing links</h3>
          {links.length === 0 ? (
            <p className="text-sm text-dark-500 dark:text-dark-400">
              No links yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {links.map((link) => {
                const status = shareStatus(link);
                return (
                  <li
                    key={link.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-dark-200 p-3 text-sm dark:border-dark-700"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs text-dark-700 dark:text-dark-300">
                        {link.url}
                      </p>
                      <p className="mt-0.5 text-xs text-dark-500 dark:text-dark-400">
                        {`Created ${fmtDate(link.created_at)} · `}
                        {status === 'active'
                          ? link.expires_at
                            ? `Expires ${fmtDate(link.expires_at)}`
                            : 'No expiry'
                          : status === 'revoked'
                            ? 'Sharing stopped'
                            : 'Expired'}
                        {' · '}
                        {link.design_ids
                          ? `${link.design_ids.length} image(s)`
                          : 'All images'}
                        {' · '}
                        {link.show_prices ? 'Rates shown' : 'Rates hidden'}
                      </p>
                    </div>
                    {status === 'active' && (
                      <div className="flex shrink-0 gap-2">
                        <CopyLinkButton url={link.url} iconOnly />
                        <StopSharingButton
                          onConfirm={() => revoke.mutate(link.id)}
                          disabled={revoke.isPending}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Link2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { INPUT_CLS } from '@/lib/constants';
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

function linkStatus(link: ShareLink): 'active' | 'revoked' | 'expired' {
  if (link.revoked_at) return 'revoked';
  if (link.expires_at && new Date(link.expires_at) <= new Date())
    return 'expired';
  return 'active';
}

/** Create and manage the public view-only links for a client's designs. */
export function ShareModal({ clientId, designIds, onClose }: ShareModalProps) {
  const qc = useQueryClient();
  const [showPrices, setShowPrices] = useState(false);
  const [expires, setExpires] = useState('');

  const { data: links = [] } = useQuery<ShareLink[]>({
    queryKey: ['share-links', clientId],
    queryFn: () => listShareLinks(clientId),
  });

  const refresh = () =>
    qc.invalidateQueries({ queryKey: ['share-links', clientId] });

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Copy failed — select the link and copy it manually');
    }
  };

  const create = useMutation({
    mutationFn: () =>
      createShareLink(clientId, {
        design_ids: designIds,
        show_prices: showPrices,
        // The date input has no time; expire at the end of that day.
        expires_at: expires
          ? new Date(`${expires}T23:59:59`).toISOString()
          : null,
      }),
    onSuccess: (link) => {
      refresh();
      copy(link.url);
      setExpires('');
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

  const today = new Date().toISOString().slice(0, 10);

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
          <h3 className="text-xs font-semibold uppercase tracking-wider text-dark-500 dark:text-dark-400">
            New link
          </h3>

          <p className="text-sm text-dark-700 dark:text-dark-300">
            {designIds.length} image{designIds.length === 1 ? '' : 's'} selected
          </p>

          <label className="flex items-center gap-2 text-sm text-dark-800 dark:text-dark-200">
            <input
              type="checkbox"
              checked={showPrices}
              onChange={(e) => setShowPrices(e.target.checked)}
            />
            Show rates to the customer
          </label>

          <div>
            <label className="mb-1 block text-xs text-dark-500 dark:text-dark-300">
              Expires on (optional)
            </label>
            <input
              type="date"
              min={today}
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
              className={`${INPUT_CLS} max-w-48`}
            />
          </div>

          <button
            type="button"
            onClick={() => create.mutate()}
            disabled={create.isPending || designIds.length === 0}
            className="btn-primary"
          >
            <Link2 className="h-4 w-4" />
            {create.isPending ? 'Creating…' : 'Create & copy link'}
          </button>
        </section>

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-dark-500 dark:text-dark-400">
            Existing links
          </h3>
          {links.length === 0 ? (
            <p className="text-sm text-dark-500 dark:text-dark-400">
              No links yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {links.map((link) => {
                const status = linkStatus(link);
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
                        <button
                          type="button"
                          onClick={() => copy(link.url)}
                          aria-label="Copy link"
                          className="btn-secondary px-2.5"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => revoke.mutate(link.id)}
                          disabled={revoke.isPending}
                          className="btn-secondary text-red-600 dark:text-red-400"
                        >
                          Stop sharing
                        </button>
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

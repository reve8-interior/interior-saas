'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Mail, MessageCircle, Share2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { INPUT_CLS } from '@/lib/constants';
import {
  createPortfolioShare,
  listPortfolioShares,
  revokePortfolioShare,
} from '@/lib/designs';
import type { PortfolioShare } from '@/lib/schemas/design';
import { fmtDate } from '@/lib/format';
import { errorMessage } from '@/lib/errors';

interface PortfolioShareModalProps {
  /** Designs chosen on the page; the link covers exactly these. */
  designIds: string[];
  onClose: () => void;
}

const SHARES_KEY = ['portfolio-shares'];
const MESSAGE = 'Take a look at our design portfolio:';

function shareStatus(share: PortfolioShare): 'active' | 'revoked' | 'expired' {
  if (share.revoked_at) return 'revoked';
  if (share.expires_at && new Date(share.expires_at) <= new Date())
    return 'expired';
  return 'active';
}

/** Pick portfolio designs, set an expiry, then send the link on. */
export function PortfolioShareModal({
  designIds,
  onClose,
}: PortfolioShareModalProps) {
  const qc = useQueryClient();
  const [expires, setExpires] = useState('');
  const [created, setCreated] = useState<PortfolioShare | null>(null);

  const { data: shares = [] } = useQuery<PortfolioShare[]>({
    queryKey: SHARES_KEY,
    queryFn: listPortfolioShares,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: SHARES_KEY });

  const create = useMutation({
    mutationFn: () =>
      createPortfolioShare({
        design_ids: designIds,
        // The date input has no time; expire at the end of that day.
        expires_at: expires
          ? new Date(`${expires}T23:59:59`).toISOString()
          : null,
      }),
    onSuccess: (share) => {
      refresh();
      setCreated(share);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokePortfolioShare(id),
    onSuccess: (_, id) => {
      refresh();
      if (created?.id === id) setCreated(null);
      toast.success('Sharing stopped');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied');
    } catch {
      toast.error('Copy failed — select the link and copy it manually');
    }
  };

  // Opens the phone's native share sheet (WhatsApp, Mail, ...) when present.
  const canNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const nativeShare = async (url: string) => {
    try {
      await navigator.share({ title: 'Design portfolio', text: MESSAGE, url });
    } catch {
      // Dismissing the share sheet rejects; nothing to report.
    }
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <Modal
      open
      onClose={onClose}
      title="Share portfolio"
      description="Optionally set an expiry, then generate and send the link."
      maxWidth="xl"
    >
      <div className="space-y-6">
        <section className="space-y-3">
          <p className="text-sm text-dark-700 dark:text-dark-300">
            {designIds.length} design{designIds.length === 1 ? '' : 's'}{' '}
            selected
          </p>

          <div>
            <label className="mb-1 block text-xs text-dark-500 dark:text-dark-300">
              Expires on (optional)
            </label>
            <input
              type="date"
              min={today}
              value={expires}
              onChange={(e) => {
                setCreated(null);
                setExpires(e.target.value);
              }}
              className={`${INPUT_CLS} max-w-48`}
            />
          </div>

          <button
            type="button"
            onClick={() => create.mutate()}
            disabled={create.isPending || designIds.length === 0}
            className="btn-primary"
          >
            {create.isPending ? 'Generating…' : 'Generate link'}
          </button>
        </section>

        {created && (
          <section className="space-y-3 rounded-lg border border-primary-200 bg-primary-50/50 p-3 dark:border-primary-500/40 dark:bg-primary-600/10">
            <p className="break-all font-mono text-xs text-dark-700 dark:text-dark-300">
              {created.url}
            </p>
            <div className="flex flex-wrap gap-2">
              {canNativeShare && (
                <button
                  type="button"
                  onClick={() => nativeShare(created.url)}
                  className="btn-primary"
                >
                  <Share2 className="h-4 w-4" />
                  Share
                </button>
              )}
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`${MESSAGE} ${created.url}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
              <a
                href={`mailto:?subject=${encodeURIComponent('Design portfolio')}&body=${encodeURIComponent(`${MESSAGE}\n${created.url}`)}`}
                className="btn-secondary"
              >
                <Mail className="h-4 w-4" />
                Email
              </a>
              <button
                type="button"
                onClick={() => copy(created.url)}
                className="btn-secondary"
              >
                <Copy className="h-4 w-4" />
                Copy
              </button>
            </div>
          </section>
        )}

        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-dark-500 dark:text-dark-400">
            Existing links
          </h3>
          {shares.length === 0 ? (
            <p className="text-sm text-dark-500 dark:text-dark-400">
              No links yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {shares.map((share) => {
                const status = shareStatus(share);
                return (
                  <li
                    key={share.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-dark-200 p-3 text-sm dark:border-dark-700"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs text-dark-700 dark:text-dark-300">
                        {share.url}
                      </p>
                      <p className="mt-0.5 text-xs text-dark-500 dark:text-dark-400">
                        {status === 'active'
                          ? share.expires_at
                            ? `Expires ${fmtDate(share.expires_at)}`
                            : 'No expiry'
                          : status === 'revoked'
                            ? 'Sharing stopped'
                            : 'Expired'}
                        {' · '}
                        {share.design_ids.length} design(s)
                      </p>
                    </div>
                    {status === 'active' && (
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="button"
                          onClick={() => copy(share.url)}
                          aria-label="Copy link"
                          className="btn-secondary px-2.5"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => revoke.mutate(share.id)}
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

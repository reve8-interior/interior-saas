'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
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
  /** Only list and stop existing links; no new link is created. */
  manageOnly?: boolean;
  onClose: () => void;
}

const SHARES_KEY = ['portfolio-shares'];
const MESSAGE = 'Take a look at our design portfolio:';

/** Pick portfolio designs, set an expiry, then send the link on. */
export function PortfolioShareModal({
  designIds,
  manageOnly = false,
  onClose,
}: PortfolioShareModalProps) {
  const qc = useQueryClient();
  const [expires, setExpires] = useState(defaultExpiry);
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
        expires_at: endOfDayIso(expires),
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

  return (
    <Modal
      open
      onClose={onClose}
      title={manageOnly ? 'Shared links' : 'Share portfolio'}
      description={
        manageOnly
          ? 'Copy or stop the portfolio links you have sent.'
          : 'Optionally set an expiry, then generate and send the link.'
      }
      maxWidth="xl"
    >
      <div className="space-y-6">
        {!manageOnly && (
          <>
            <section className="space-y-3">
              <p className="text-sm text-dark-700 dark:text-dark-300">
                {designIds.length} design{designIds.length === 1 ? '' : 's'}{' '}
                selected
              </p>

              <ExpiryPicker
                id="portfolio-expiry"
                value={expires}
                onChange={setExpires}
              />

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
              <SendLinkPanel
                url={created.url}
                message={MESSAGE}
                subject="Design portfolio"
              />
            )}
          </>
        )}

        <section className="space-y-2">
          <h3 className="type-label">Existing links</h3>
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
                        <CopyLinkButton url={share.url} iconOnly />
                        <StopSharingButton
                          onConfirm={() => revoke.mutate(share.id)}
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

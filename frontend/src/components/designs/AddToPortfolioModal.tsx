'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { SkeletonImage } from '@/components/ui/SkeletonImage';
import { api } from '@/lib/api';
import { listDesigns, setDesignInPortfolio } from '@/lib/designs';
import { errorMessage } from '@/lib/errors';
import type { Client } from '@/lib/schemas/client';
import type { Design } from '@/lib/schemas/design';

/** Pick a client, then add any of its designs to the portfolio. */
export function AddToPortfolioModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [clientId, setClientId] = useState('');

  // Same key as the clients list, so this is usually already cached.
  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['clients', false],
    queryFn: () => api.get<Client[]>('/clients'),
  });
  const { data: designs = [], isLoading } = useQuery<Design[]>({
    queryKey: ['designs', clientId],
    queryFn: () => listDesigns(clientId),
    enabled: clientId !== '',
  });

  const add = useMutation({
    mutationFn: (design: Design) =>
      setDesignInPortfolio(clientId, design.id, true),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolio-designs'] });
      qc.invalidateQueries({ queryKey: ['designs', clientId] });
      toast.success('Added to portfolio');
    },
    onError: (e) => toast.error(errorMessage(e, 'Failed to add design')),
  });

  const addable = designs.filter((d) => !d.in_portfolio && d.image_url);

  return (
    <Modal
      open
      onClose={onClose}
      title="Add designs to portfolio"
      description="Choose a client, then the designs to showcase."
      maxWidth="xl"
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="portfolio-client" className="field-label">
            Client
          </label>
          <select
            id="portfolio-client"
            className="field"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          >
            <option value="">Select a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {clientId !== '' &&
          (isLoading ? (
            <p className="text-sm text-dark-500 dark:text-dark-400">Loading…</p>
          ) : addable.length === 0 ? (
            <p className="text-sm text-dark-500 dark:text-dark-400">
              Every design of this client is already in the portfolio, or it has
              none yet.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {addable.map((d) => (
                <li key={d.id} className="surface space-y-2 p-2">
                  <SkeletonImage
                    loading="lazy"
                    src={(d.thumb_url ?? d.image_url) as string}
                    alt={d.title || 'Design'}
                    className="h-24 w-full rounded object-cover"
                  />
                  <p className="truncate text-xs font-medium">
                    {d.title || 'Untitled'}
                  </p>
                  <button
                    type="button"
                    onClick={() => add.mutate(d)}
                    disabled={add.isPending}
                    className="btn-secondary w-full text-xs"
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          ))}

        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="btn-primary">
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}

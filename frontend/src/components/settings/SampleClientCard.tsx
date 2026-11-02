'use client';

import { Button } from '@/components/ui';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { CARD_CLS } from '@/lib/constants';
import { useSampleClient } from '@/lib/useSampleClient';
import Link from 'next/link';
import { useState } from 'react';

/** Load a fully filled-in demo client to explore, or delete it again. */
export function SampleClientCard() {
  const { sample, load, remove } = useSampleClient();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className={`${CARD_CLS} space-y-3`}>
      <h2 className="font-heading text-lg font-extrabold tracking-tight">
        Sample client
      </h2>
      <p className="text-sm text-muted">
        A demo client with notes, two designs, two quotation versions, shared
        links and customer messages. Load it to explore the app, then delete it
        when you&apos;re done.
      </p>
      {sample ? (
        <div className="flex flex-wrap gap-3">
          <Link
            href={`/dashboard/clients/${sample.id}`}
            className="btn-secondary"
          >
            Open sample client
          </Link>
          <Button variant="danger-subtle" onClick={() => setConfirming(true)}>
            Delete sample client
          </Button>
        </div>
      ) : (
        <Button isLoading={load.isPending} onClick={() => load.mutate()}>
          Load sample client
        </Button>
      )}
      <ConfirmDeleteModal
        isOpen={confirming}
        isLoading={remove.isPending}
        title="Delete sample client"
        description="This removes the sample client and everything in it. Your real clients are not affected."
        confirmLabel="Delete sample"
        onConfirm={() =>
          sample &&
          remove.mutate(sample.id, { onSuccess: () => setConfirming(false) })
        }
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

'use client';

import { Button } from '@/components/ui';
import { Modal } from '@/components/ui/Modal';
import { useSampleClient } from '@/lib/useSampleClient';
import {
  loadWelcomeSeen,
  saveWelcomeSeen,
  shouldShowWelcome,
} from '@/lib/welcome';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

/**
 * Greets a designer whose account has no clients and offers the sample client.
 * Asked once per user, whichever way they answer.
 */
export function WelcomePrompt({ userId }: { userId: string }) {
  const pathname = usePathname();
  const { clientCount, load } = useSampleClient();
  const [seen, setSeen] = useState(() => loadWelcomeSeen(userId));

  const answer = () => {
    saveWelcomeSeen(userId);
    setSeen(true);
  };

  return (
    <Modal
      open={shouldShowWelcome(pathname, clientCount, seen)}
      onClose={answer}
      title="Welcome to reve8"
      description="Your studio is empty, so here's a head start."
      maxWidth="md"
    >
      <p className="text-sm text-muted">
        Load a sample client with meeting notes, two designs, quotation
        versions, shared links and customer messages, so you can try every
        screen with real-looking data.
      </p>
      <p className="mt-2 text-sm text-muted">
        Delete it any time from Settings; your own clients are never affected.
      </p>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={answer} disabled={load.isPending}>
          Start from scratch
        </Button>
        <Button
          isLoading={load.isPending}
          onClick={() =>
            load.mutate(undefined, { onSuccess: answer, onError: answer })
          }
        >
          Load sample client
        </Button>
      </div>
    </Modal>
  );
}

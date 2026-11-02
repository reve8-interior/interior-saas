'use client';

import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';

export interface IssuedCredentials {
  email: string;
  password: string;
}

/** Shows a generated temporary password once, with a one-click copy of the email and password. */
export function IssuedCredentialsModal({
  credentials,
  onClose,
}: {
  credentials: IssuedCredentials | null;
  onClose: () => void;
}) {
  function copy(c: IssuedCredentials) {
    navigator.clipboard
      .writeText(
        `Email: ${c.email}
Temporary password: ${c.password}`
      )
      .then(() => toast.success('Copied email and password'))
      .catch(() => toast.error('Copy failed'));
  }

  return (
    <Modal
      open={credentials !== null}
      onClose={onClose}
      title="Share these sign-in details"
      description="The password is shown only once. They must change it on first login."
      maxWidth="md"
    >
      {credentials && (
        <div className="space-y-4">
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="type-label">Email</dt>
              <dd className="break-all">{credentials.email}</dd>
            </div>
            <div>
              <dt className="type-label">Temporary password</dt>
              <dd>
                <code className="rounded-lg bg-dark-100 px-2 py-1 font-mono dark:bg-dark-900/60">
                  {credentials.password}
                </code>
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => copy(credentials)}
            >
              <Copy className="h-4 w-4" aria-hidden /> Copy email &amp; password
            </button>
            <button type="button" className="btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

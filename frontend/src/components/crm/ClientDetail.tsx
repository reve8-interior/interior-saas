'use client';

import { ErrorState, ListSkeleton } from '@/components/ui';
import type { ReactNode } from 'react';
import { api } from '@/lib/api';
import {
  EMAIL_ERROR,
  clientFormFrom,
  clientPayload,
  isValidEmail,
} from '@/lib/clientForm';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';
import { toast } from 'sonner';
import {
  PHASE_LABELS,
  PHASE_ORDER,
  PHASE_COLORS,
  CARD_CLS,
  INPUT_CLS,
} from '@/lib/constants';
import type { Client } from '@/lib/schemas/client';
import { Modal } from '@/components/ui/Modal';
import { CustomerMessages } from '@/components/crm/CustomerMessages';
import { NextStepCard } from '@/components/crm/NextStepCard';
import { SharedLinkCard } from '@/components/shared/SharedLinkCard';
import {
  SHARED_LINKS_KEY,
  listSharedLinks,
  type SharedLink,
} from '@/lib/sharedLinks';

const PHASE_DOT: Record<string, string> = {
  discussion: 'bg-blue-500',
  design: 'bg-purple-500',
  quotation: 'bg-amber-500',
  implementation: 'bg-orange-500',
  completed: 'bg-green-500',
};

const sectionLabel = 'type-label';

const CONTACT_DISPLAY: Record<string, string> = {
  email: 'Email',
  phone: 'Phone',
  address: 'Address',
  budget: 'Budget',
  project_type: 'Project Type',
  property_type: 'Property Type',
  area_sqft: 'Area (sq ft)',
};

interface EditModalProps {
  client: Client;
  onClose: () => void;
  onSaved: () => void;
}

function EditClientModal({ client, onClose, onSaved }: EditModalProps) {
  const uid = useId();
  const [emailError, setEmailError] = useState('');
  const [form, setForm] = useState(() => clientFormFrom(client));

  const mutation = useMutation({
    mutationFn: () => api.put(`/clients/${client.id}`, clientPayload(form)),
    onSuccess: () => {
      toast.success('Client updated');
      onSaved();
      onClose();
    },
    onError: () => toast.error('Failed to update client'),
  });

  const set =
    (k: keyof typeof form) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >
    ) =>
      setForm((p) => ({ ...p, [k]: e.target.value }));

  return (
    <Modal open onClose={onClose} title="Edit Client" maxWidth="md">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (form.email && !isValidEmail(form.email)) {
            setEmailError(EMAIL_ERROR);
            return;
          }
          setEmailError('');
          mutation.mutate();
        }}
        className="space-y-3"
      >
        {[
          {
            label: 'Name *',
            key: 'name' as const,
            placeholder: 'Client name',
            required: true,
          },
          {
            label: 'Phone',
            key: 'phone' as const,
            placeholder: '+91 98765 43210',
          },
          {
            label: 'Email',
            key: 'email' as const,
            placeholder: 'client@example.com',
          },
          {
            label: 'Address',
            key: 'address' as const,
            placeholder: 'Project address',
          },
        ].map(({ label, key, placeholder, required }) => (
          <div key={key}>
            <label
              htmlFor={`${uid}-${key}`}
              className="mb-1 block text-xs font-medium text-dark-600 dark:text-dark-300"
            >
              {label}
            </label>
            <input
              id={`${uid}-${key}`}
              required={required}
              type={key === 'email' ? 'email' : 'text'}
              aria-invalid={key === 'email' && emailError ? true : undefined}
              value={form[key]}
              onChange={set(key)}
              placeholder={placeholder}
              className={INPUT_CLS}
            />
            {key === 'email' && emailError && (
              <p role="alert" className="mt-1 text-xs text-red-600">
                {emailError}
              </p>
            )}
          </div>
        ))}

        <div>
          <label
            htmlFor={`${uid}-budget`}
            className="mb-1 block text-xs font-medium text-dark-600 dark:text-dark-300"
          >
            Budget
          </label>
          <select
            id={`${uid}-budget`}
            value={form.budget}
            onChange={set('budget')}
            className={INPUT_CLS}
          >
            <option value="">— unset —</option>
            <option value="low">Low</option>
            <option value="mid">Mid</option>
            <option value="high">High</option>
          </select>
        </div>

        <div>
          <label
            htmlFor={`${uid}-notes`}
            className="mb-1 block text-xs font-medium text-dark-600 dark:text-dark-300"
          >
            Notes
          </label>
          <textarea
            id={`${uid}-notes`}
            value={form.notes}
            onChange={set('notes')}
            rows={3}
            placeholder="Any notes..."
            className={INPUT_CLS}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary flex-1"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!form.name.trim() || mutation.isPending}
            className="btn-primary flex-1"
          >
            {mutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

interface ClientDetailProps {
  clientId: string;
  /** Extra card shown beside the client info (e.g. team access). */
  aside?: ReactNode;
}

export function ClientDetail({ clientId, aside }: ClientDetailProps) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const {
    data: client,
    isLoading,
    refetch,
  } = useQuery<Client>({
    queryKey: ['client', clientId],
    queryFn: () => api.get<Client>(`/clients/${clientId}`),
  });

  const phaseMutation = useMutation({
    mutationFn: ({ phase }: { phase: string; previous?: string }) =>
      api.put(`/clients/${clientId}/phase`, { phase }),
    onSuccess: (_data, { phase, previous }) => {
      qc.invalidateQueries({ queryKey: ['client', clientId] });
      qc.invalidateQueries({ queryKey: ['clients'] });
      toast.success(`Phase set to ${PHASE_LABELS[phase] ?? phase}`, {
        action: previous
          ? {
              label: 'Undo',
              onClick: () => phaseMutation.mutate({ phase: previous }),
            }
          : undefined,
      });
    },
    onError: () => toast.error('Failed to update phase'),
  });

  const { data: allLinks = [] } = useQuery<SharedLink[]>({
    queryKey: SHARED_LINKS_KEY,
    queryFn: listSharedLinks,
  });
  const links = allLinks.filter((l) => l.client_id === clientId);

  if (isLoading) {
    return (
      <ListSkeleton rows={2} rowClassName="h-24" className="space-y-3 p-4" />
    );
  }

  if (!client) {
    return (
      <ErrorState onRetry={() => refetch()}>
        Couldn&apos;t load this client.{' '}
        <Link href="/dashboard/clients" className="underline">
          Back to clients
        </Link>
      </ErrorState>
    );
  }

  const base = `/dashboard/clients/${clientId}`;
  const phaseIdx = PHASE_ORDER.indexOf(client.current_phase);
  const nextPhase = PHASE_ORDER[phaseIdx + 1];
  const contactEntries = Object.entries(client.contact_info || {}).filter(
    ([, v]) => v
  );

  const handleSaved = () => {
    qc.invalidateQueries({ queryKey: ['client', clientId] });
    qc.invalidateQueries({ queryKey: ['clients'] });
  };

  return (
    <div className="space-y-3 p-4">
      <NextStepCard clientId={clientId} />

      {/* Phase tracker: a segmented bar; the current phase named above it, every segment a tap target */}
      <div className={CARD_CLS}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className={sectionLabel}>Project phase</p>
            <span
              className={`badge ${PHASE_COLORS[client.current_phase] ?? ''}`}
            >
              {PHASE_LABELS[client.current_phase] ?? client.current_phase}
            </span>
            <span className="text-xs tabular-nums text-dark-500 dark:text-dark-400">
              {phaseIdx + 1} of {PHASE_ORDER.length}
            </span>
          </div>
          {nextPhase && (
            <button
              type="button"
              disabled={phaseMutation.isPending}
              onClick={() =>
                phaseMutation.mutate({
                  phase: nextPhase,
                  previous: client.current_phase,
                })
              }
              className="btn-secondary btn-sm"
            >
              Move to {PHASE_LABELS[nextPhase] ?? nextPhase} →
            </button>
          )}
        </div>
        <ol className="flex gap-1.5">
          {PHASE_ORDER.map((phase, i) => {
            const isActive = i === phaseIdx;
            const reached = i <= phaseIdx;
            return (
              <li key={phase} className="min-w-0 flex-1">
                <button
                  type="button"
                  aria-label={`Set phase to ${PHASE_LABELS[phase] ?? phase}`}
                  aria-current={isActive ? 'step' : undefined}
                  disabled={phaseMutation.isPending}
                  onClick={() =>
                    !isActive &&
                    phaseMutation.mutate({
                      phase,
                      previous: client.current_phase,
                    })
                  }
                  className="group flex min-h-11 w-full flex-col justify-center gap-1.5 text-left"
                >
                  <span
                    className={`h-2 rounded-full transition-colors ${
                      reached
                        ? PHASE_DOT[phase]
                        : 'bg-line-strong group-hover:bg-dark-300'
                    } ${isActive ? 'ring-2 ring-brand/40 ring-offset-2 ring-offset-surface' : ''}`}
                  />
                  <span
                    className={`hidden truncate text-xs sm:block ${
                      isActive
                        ? 'font-semibold text-dark-900 dark:text-white'
                        : 'text-dark-500 dark:text-dark-400'
                    }`}
                  >
                    {PHASE_LABELS[phase] ?? phase}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-3">
        {/* Main column: what needs doing. Source order is the mobile order. */}
        <div className="space-y-3 lg:col-span-2">
          <CustomerMessages clientId={clientId} />
          <section aria-labelledby="client-links-heading" className="space-y-3">
            <h2 id="client-links-heading" className={sectionLabel}>
              Shared links
            </h2>
            {links.length === 0 ? (
              <p className="text-xs text-dark-500 dark:text-dark-400">
                Nothing shared with this client yet. Share designs from the
                Designs tab or a quotation version from Quotation.
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {links.map((link) => (
                  <SharedLinkCard
                    key={`${link.kind}-${link.id}`}
                    link={link}
                    showClient={false}
                    compact
                  />
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Side column: reference details */}
        <div className="space-y-3">
          <div className={CARD_CLS}>
            <div className="mb-3 flex items-center justify-between">
              <p className={sectionLabel}>Client Info</p>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="flex min-h-11 items-center gap-1 rounded-lg px-3 text-xs text-dark-500 hover:bg-primary-50 hover:text-primary-600 dark:text-dark-400 dark:hover:bg-white/[0.06] dark:hover:text-primary-400"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </button>
            </div>
            {contactEntries.length > 0 ? (
              <div className="space-y-2">
                {contactEntries.map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-sm">
                    <span className="w-28 shrink-0 text-dark-500 dark:text-dark-400">
                      {CONTACT_DISPLAY[k] ?? k}
                    </span>
                    <span className="min-w-0 break-words font-medium text-dark-900 dark:text-white">
                      {k === 'phone' ? (
                        <a
                          href={`tel:${v}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {v}
                        </a>
                      ) : k === 'email' ? (
                        <a
                          href={`mailto:${v}`}
                          className="underline-offset-2 hover:underline"
                        >
                          {v}
                        </a>
                      ) : (
                        v
                      )}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-dark-500 dark:text-dark-400">
                No contact info yet.{' '}
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="font-semibold text-primary-600 hover:underline dark:text-primary-400"
                >
                  Add details
                </button>
              </p>
            )}

            {client.notes && (
              <div className="mt-3 border-t border-line pt-3 dark:border-line">
                <p className={`${sectionLabel} mb-1`}>Notes</p>
                <p className="whitespace-pre-wrap text-sm text-dark-700 dark:text-dark-200">
                  {client.notes}
                </p>
              </div>
            )}
          </div>
          {aside}
        </div>
      </div>

      {editing && (
        <EditClientModal
          client={client}
          onClose={() => setEditing(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

'use client';

import { ListSkeleton } from '@/components/ui';
import type { ReactNode } from 'react';
import { api } from '@/lib/api';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  PHASE_LABELS,
  PHASE_ORDER,
  CARD_CLS,
  INPUT_CLS,
} from '@/lib/constants';
import type { Client } from '@/lib/schemas/client';
import { Modal } from '@/components/ui/Modal';
import { NextStepCard } from '@/components/crm/NextStepCard';

const PHASE_DOT: Record<string, string> = {
  discussion: 'bg-blue-500',
  design: 'bg-purple-500',
  quotation: 'bg-amber-500',
  implementation: 'bg-orange-500',
  completed: 'bg-green-500',
};

const sectionLabel =
  'text-xs font-semibold uppercase tracking-wider text-dark-500 dark:text-dark-400';

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
  const [form, setForm] = useState({
    name: client.name,
    phone: client.contact_info?.phone ?? '',
    email: client.contact_info?.email ?? '',
    address: client.contact_info?.address ?? '',
    budget: client.contact_info?.budget ?? '',
    notes: client.notes ?? '',
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.put(`/clients/${client.id}`, {
        name: form.name,
        contact_info: {
          phone: form.phone,
          email: form.email,
          address: form.address,
          ...(form.budget ? { budget: form.budget } : {}),
        },
        notes: form.notes || null,
      }),
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
        onSubmit={(e) => {
          e.preventDefault();
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
            <label className="mb-1 block text-xs font-medium text-dark-600 dark:text-dark-300">
              {label}
            </label>
            <input
              required={required}
              value={form[key]}
              onChange={set(key)}
              placeholder={placeholder}
              className={INPUT_CLS}
            />
          </div>
        ))}

        <div>
          <label className="mb-1 block text-xs font-medium text-dark-600 dark:text-dark-300">
            Budget
          </label>
          <select
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
          <label className="mb-1 block text-xs font-medium text-dark-600 dark:text-dark-300">
            Notes
          </label>
          <textarea
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
            disabled={!form.name || mutation.isPending}
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

  const { data: client, isLoading } = useQuery<Client>({
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

  if (isLoading) {
    return (
      <ListSkeleton rows={2} rowClassName="h-24" className="space-y-3 p-4" />
    );
  }

  if (!client) return null;

  const phaseIdx = PHASE_ORDER.indexOf(client.current_phase);
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

      {/* Phase tracker */}
      <div className={CARD_CLS}>
        <p className={`${sectionLabel} mb-3`}>Project Phase</p>
        <div className="flex items-center">
          {PHASE_ORDER.map((phase, i) => {
            const isActive = i === phaseIdx;
            const isDone = i < phaseIdx;
            return (
              <div key={phase} className="flex flex-1 items-center">
                <button
                  onClick={() =>
                    phase !== client.current_phase &&
                    phaseMutation.mutate({
                      phase,
                      previous: client.current_phase,
                    })
                  }
                  className={`flex min-h-11 flex-1 flex-col items-center justify-center gap-1 transition-opacity ${isActive || isDone ? 'opacity-100' : 'opacity-35'}`}
                >
                  <div
                    className={`h-3 w-3 rounded-full transition-all ${
                      isActive
                        ? PHASE_DOT[phase] +
                          ' ring-2 ring-primary-400 ring-offset-2 ring-offset-white dark:ring-offset-dark-800'
                        : isDone
                          ? 'bg-green-500'
                          : 'bg-gray-300 dark:bg-dark-600'
                    }`}
                  />
                  <span
                    className={`max-w-full truncate px-0.5 text-xs font-medium capitalize ${isActive ? 'text-dark-900 dark:text-white' : 'text-dark-500 dark:text-dark-400'}`}
                  >
                    {phase}
                  </span>
                </button>
                {i < PHASE_ORDER.length - 1 && (
                  <div
                    className={`h-px flex-1 ${i < phaseIdx ? 'bg-green-500' : 'bg-gray-300 dark:bg-dark-600'}`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-2">
        <div className="space-y-3">
          <div className={CARD_CLS}>
            <div className="mb-3 flex items-center justify-between">
              <p className={sectionLabel}>Client Info</p>
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-dark-500 hover:bg-primary-50 hover:text-primary-600 dark:text-dark-400 dark:hover:bg-white/[0.06] dark:hover:text-primary-400"
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
                      {v}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-dark-500 dark:text-dark-400">
                No contact info yet.
              </p>
            )}

            {client.notes && (
              <div className="mt-3 border-t border-line pt-3 dark:border-primary-300/15">
                <p className={`${sectionLabel} mb-1`}>Notes</p>
                <p className="whitespace-pre-wrap text-sm text-dark-700 dark:text-dark-200">
                  {client.notes}
                </p>
              </div>
            )}
          </div>
        </div>
        {aside}
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

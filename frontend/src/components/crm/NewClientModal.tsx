'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { INPUT_CLS } from '@/lib/constants';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

const EMPTY_FORM = {
  name: '',
  phone: '',
  email: '',
  address: '',
  budget: '',
  notes: '',
};

export function NewClientModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY_FORM);

  const mutation = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>('/clients', {
        name: form.name,
        contact_info: {
          phone: form.phone,
          email: form.email,
          address: form.address,
          ...(form.budget ? { budget: form.budget } : {}),
        },
        notes: form.notes || null,
      }),
    onSuccess: ({ id }) => {
      toast.success('Client created');
      onCreated();
      onClose();
      // Straight into the new client's workspace: the next step is always there.
      router.push(`/dashboard/clients/${id}`);
    },
    onError: () => toast.error('Failed to create client'),
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
    <Modal open onClose={onClose} title="New Client" maxWidth="md">
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
            <option value="">— select —</option>
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
            placeholder="Any initial notes..."
            className={INPUT_CLS}
          />
        </div>

        {/* Footer */}
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
            {mutation.isPending ? 'Creating…' : 'Create Client'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

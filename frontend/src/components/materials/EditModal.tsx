'use client';

import { Modal, ModalFooter } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { type Material, parseCost } from '@/lib/materials';
import { useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '@/lib/errors';
import {
  MaterialFields,
  MaterialForm,
} from '@/components/materials/MaterialFields';

// ── Edit modal ────────────────────────────────────────────────────────────────
export function EditModal({
  material,
  onClose,
  onSaved,
}: {
  material: Material;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<MaterialForm>({
    name: material.name,
    category: material.category,
    unit: material.unit,
    unit_cost: String(material.unit_cost),
    vendor: material.vendor ?? '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const cost = parseCost(form.unit_cost);

  const save = async () => {
    if (cost === null) return;
    setIsSaving(true);
    try {
      await api.put(`/materials/${material.id}`, {
        ...form,
        unit_cost: cost,
        vendor: form.vendor || null,
      });
      toast.success('Material updated');
      onSaved();
      onClose();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Failed to update material'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Edit Material" maxWidth="md">
      <div className="space-y-4">
        <MaterialFields
          form={form}
          required={false}
          onChange={(k, v) => setForm((p) => ({ ...p, [k]: v }))}
        />
        <ModalFooter
          onCancel={onClose}
          onConfirm={save}
          confirmLabel="Save Changes"
          loading={isSaving}
          disabled={!form.name.trim() || cost === null}
        />
      </div>
    </Modal>
  );
}

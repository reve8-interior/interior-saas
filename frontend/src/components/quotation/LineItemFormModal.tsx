'use client';

import {
  extraFormFrom,
  formFromItem,
  toLineItemPayload,
  validateLineItemForm,
  type LineItemFormState,
} from '@/lib/lineItemForm';
import { getMaterials, type Material } from '@/lib/quotation';
import type {
  LineItemCreate,
  LineItemStatus,
  LineItemUpdate,
  QuotationLineItem,
} from '@/lib/schemas/quotation';
import { type LineItemColumnDef } from '@/lib/lineItemColumns';
import { SimpleModal } from '@/components/shared/SimpleModal';
import { useQuery } from '@tanstack/react-query';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { INPUT_CLS } from '@/lib/constants';
import { fmtRupees } from '@/lib/format';
import {
  STATUS_OPTIONS,
  UNIT_OPTIONS,
} from '@/components/quotation/quotationStyles';

export function LineItemFormModal({
  title,
  rooms,
  customCols,
  item,
  pending,
  onClose,
  onSubmit,
}: {
  title: string;
  rooms: string[];
  customCols: LineItemColumnDef[];
  item?: QuotationLineItem;
  pending: boolean;
  onClose: () => void;
  onSubmit: (payload: LineItemCreate & LineItemUpdate) => void;
}) {
  const [form, setForm] = useState<LineItemFormState>(() =>
    formFromItem(item, {})
  );
  const [extraForm, setExtraForm] = useState<Record<string, string>>(() =>
    extraFormFrom(item, customCols)
  );
  const [error, setError] = useState<string | null>(null);
  const initialSnapshot = useRef(JSON.stringify([form, extraForm]));
  const requestClose = () => {
    const dirty = JSON.stringify([form, extraForm]) !== initialSnapshot.current;
    if (dirty && !window.confirm('Discard your unsaved changes?')) return;
    onClose();
  };
  const { data: materials = [] } = useQuery<Material[]>({
    queryKey: ['materials'],
    queryFn: () => getMaterials(),
  });

  const set = (field: keyof LineItemFormState) => (value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const materialLabel = (m: Material) =>
    `${m.name} (${m.category}) · ₹${m.unit_cost.toLocaleString('en-IN')}/${m.unit}`;
  const [materialQuery, setMaterialQuery] = useState('');
  useEffect(() => {
    // Show the saved material's name when editing an existing line.
    const current = materials.find((m) => m.id === form.material_id);
    if (current) setMaterialQuery(materialLabel(current));
  }, [materials]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Typing filters the list; an exact pick links the material and prefills the line. */
  const chooseMaterial = (value: string) => {
    setMaterialQuery(value);
    const match = materials.find((m) => materialLabel(m) === value);
    if (!match) {
      if (value === '') setForm((f) => ({ ...f, material_id: '' }));
      return;
    }
    setForm((f) => ({
      ...f,
      material_id: match.id,
      unit: match.unit,
      rate: String(match.unit_cost),
      description: f.description || match.name,
    }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const problem = validateLineItemForm(form, customCols, extraForm);
    setError(problem);
    if (problem) return;
    onSubmit(toLineItemPayload(form, customCols, extraForm, Boolean(item)));
  };

  return (
    <SimpleModal title={title} onClose={requestClose} size="lg">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Room *">
            <input
              className={INPUT_CLS}
              list="quotation-rooms"
              value={form.room}
              onChange={(e) => set('room')(e.target.value)}
              placeholder="Living Room"
            />
            <datalist id="quotation-rooms">
              {rooms.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </Field>
          <Field label="Unit *">
            <select
              className={INPUT_CLS}
              value={form.unit}
              onChange={(e) => set('unit')(e.target.value)}
            >
              {(UNIT_OPTIONS.includes(form.unit)
                ? UNIT_OPTIONS
                : [...UNIT_OPTIONS, form.unit]
              ).map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Material (type to search your library)">
          <input
            className={INPUT_CLS}
            list="quotation-materials"
            value={materialQuery}
            placeholder="Start typing a material name…"
            onChange={(e) => chooseMaterial(e.target.value)}
          />
          <datalist id="quotation-materials">
            {materials.map((m) => (
              <option key={m.id} value={materialLabel(m)} />
            ))}
          </datalist>
          {form.material_id && (
            <p className="mt-1 text-xs text-dark-500 dark:text-dark-400">
              Rate, unit and description filled from the library. You can still
              edit them.
            </p>
          )}
        </Field>

        <Field label="Description *">
          <input
            className={INPUT_CLS}
            value={form.description}
            onChange={(e) => set('description')(e.target.value)}
            placeholder="TV Unit Back Panel"
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={'Dimension (e.g. 6\'3"x1\'6")'}>
            <input
              className={INPUT_CLS}
              value={form.raw_dimension}
              onChange={(e) => set('raw_dimension')(e.target.value)}
              placeholder={"5'x3'"}
            />
          </Field>
          <Field label="Qty">
            <input
              className={INPUT_CLS}
              inputMode="decimal"
              value={form.qty}
              onChange={(e) => set('qty')(e.target.value)}
              placeholder="4"
            />
          </Field>
          <Field label="Rate (₹)">
            <input
              className={INPUT_CLS}
              inputMode="decimal"
              value={form.rate}
              onChange={(e) => set('rate')(e.target.value)}
              placeholder="450"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Negotiated Price (₹)">
            <input
              className={INPUT_CLS}
              inputMode="decimal"
              value={form.negotiated_price}
              onChange={(e) => set('negotiated_price')(e.target.value)}
              placeholder="Leave empty if not renegotiated"
            />
          </Field>
          <Field label="Est. Time">
            <input
              className={INPUT_CLS}
              value={form.est_time}
              onChange={(e) => set('est_time')(e.target.value)}
              placeholder="e.g. 2 weeks"
            />
          </Field>
          {item && (
            <Field label="Status">
              <select
                className={INPUT_CLS}
                value={form.status}
                onChange={(e) =>
                  set('status')(e.target.value as LineItemStatus)
                }
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        {customCols.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {customCols.map((c) => (
              <Field key={c.key} label={c.required ? `${c.label} *` : c.label}>
                <input
                  className={INPUT_CLS}
                  inputMode={c.type === 'number' ? 'decimal' : undefined}
                  value={extraForm[c.key] ?? ''}
                  onChange={(e) =>
                    setExtraForm((prev) => ({
                      ...prev,
                      [c.key]: e.target.value,
                    }))
                  }
                />
              </Field>
            ))}
          </div>
        )}

        <Field label="Remarks">
          <textarea
            className={`${INPUT_CLS} min-h-[70px]`}
            value={form.remarks}
            onChange={(e) => set('remarks')(e.target.value)}
            placeholder="e.g. Needs clarity on 3 nos side tables"
          />
        </Field>

        {!form.raw_dimension.trim() &&
          form.qty.trim() !== '' &&
          form.rate.trim() !== '' &&
          !isNaN(Number(form.qty) * Number(form.rate)) && (
            <p
              aria-live="polite"
              className="text-sm font-medium text-dark-900 dark:text-white"
            >
              Initial price: {fmtRupees(Number(form.qty) * Number(form.rate))}{' '}
              <span className="font-normal text-dark-500 dark:text-dark-400">
                (qty × rate)
              </span>
            </p>
          )}
        {form.raw_dimension.trim() !== '' && (
          <p className="text-xs text-dark-500 dark:text-dark-400">
            With a dimension, price = sqft × rate, worked out when you save.
          </p>
        )}
        <p className="text-xs text-dark-500 dark:text-dark-500">
          Price is derived automatically: dimension → sqft × rate, or qty ×
          rate. Unreadable dimensions flag the item for clarification.
        </p>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1 max-sm:[&>*]:flex-1">
          <button
            type="button"
            onClick={requestClose}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button type="submit" disabled={pending} className="btn-primary">
            {pending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </SimpleModal>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

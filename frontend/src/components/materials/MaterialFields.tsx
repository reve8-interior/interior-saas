'use client';

import { useId } from 'react';
import { INPUT_CLS } from '@/lib/constants';

export type Tab = 'manual' | 'excel' | 'ai';

export const TAB_LABELS: { key: Tab; label: string }[] = [
  { key: 'manual', label: 'One at a time' },
  { key: 'excel', label: 'From Excel' },
  { key: 'ai', label: 'From a photo' },
];

export const CATEGORY_LIST = 'material-categories';
export const UNIT_LIST = 'material-units';

export interface MaterialForm {
  name: string;
  category: string;
  unit: string;
  unit_cost: string;
  vendor: string;
}

export const MANUAL_EMPTY: MaterialForm = {
  name: '',
  category: '',
  unit: 'sqft',
  unit_cost: '',
  vendor: '',
};

/** Shared datalists so Category and Unit suggest existing spellings. */
export function ValueLists({
  categories,
  units,
}: {
  categories: string[];
  units: string[];
}) {
  return (
    <>
      <datalist id={CATEGORY_LIST}>
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id={UNIT_LIST}>
        {units.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
    </>
  );
}

/** The five material fields, used by both the add and edit forms. */
export function MaterialFields({
  form,
  onChange,
  required,
}: {
  form: MaterialForm;
  onChange: (key: keyof MaterialForm, value: string) => void;
  required: boolean;
}) {
  const uid = useId();
  const star = required ? ' *' : '';
  const fields: {
    key: keyof MaterialForm;
    label: string;
    placeholder: string;
    list?: string;
    inputMode?: 'decimal';
  }[] = [
    { key: 'name', label: `Name${star}`, placeholder: 'Plywood 18mm' },
    {
      key: 'category',
      label: `Category${star}`,
      placeholder: 'plywood',
      list: CATEGORY_LIST,
    },
    { key: 'unit', label: 'Unit', placeholder: 'sqft', list: UNIT_LIST },
    {
      key: 'unit_cost',
      label: `Unit Cost (₹)${star}`,
      placeholder: '85',
      inputMode: 'decimal',
    },
    { key: 'vendor', label: 'Vendor', placeholder: 'ABC Traders' },
  ];
  return (
    <div className="flex flex-col gap-3">
      {fields.map(({ key, label, placeholder, list, inputMode }) => (
        <div key={key}>
          <label htmlFor={`${uid}-${key}`} className="field-label">
            {label}
          </label>
          <input
            id={`${uid}-${key}`}
            value={form[key]}
            onChange={(e) => onChange(key, e.target.value)}
            placeholder={placeholder}
            list={list}
            inputMode={inputMode}
            autoComplete="off"
            className={INPUT_CLS}
          />
        </div>
      ))}
    </div>
  );
}

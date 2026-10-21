'use client';

import { LoadingRegion, Skeleton } from '@/components/ui';
import { TopBarActions } from '@/components/layout/TopBarActions';
import {
  LineItemColumnDef,
  fetchLineItemColumns,
  saveLineItemColumns,
} from '@/lib/lineItemColumns';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Check,
  GripVertical,
  Loader2,
  Lock,
  Plus,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

const inputCls =
  'w-full rounded-xl border border-line bg-white/80 px-3 py-2 text-sm text-dark-900 transition-colors focus:border-secondary-600 focus:outline-none focus:ring-2 focus:ring-secondary-600/30 dark:border-primary-300/15 dark:bg-dark-900/60 dark:text-white';

/** Edits are saved this long after the last change, so typing isn't saved per keystroke. */
const AUTOSAVE_DELAY_MS = 600;

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^([0-9])/, 'c$1')
    .slice(0, 30);
}

/** Accessible on/off switch with a 44px touch row. */
function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        checked
          ? 'bg-gradient-to-r from-primary-600 to-secondary-600'
          : 'bg-dark-300 dark:bg-white/15'
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : ''
        }`}
      />
    </button>
  );
}

function SaveStatus({
  state,
  onRetry,
}: {
  state: SaveState;
  onRetry: () => void;
}) {
  if (state === 'error') {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1.5 rounded-full border border-red-300 bg-red-50 px-3.5 py-1.5 text-sm font-semibold text-red-700 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-300"
      >
        <AlertCircle className="h-4 w-4" /> Not saved · Retry
      </button>
    );
  }
  return (
    <span
      role="status"
      aria-live="polite"
      className="chip !border-transparent !bg-transparent !px-1 text-sm font-medium"
    >
      {state === 'saving' ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" /> Saving…
        </>
      ) : (
        <>
          <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
          {state === 'saved' ? 'Saved' : 'Saves automatically'}
        </>
      )}
    </span>
  );
}

export default function ColumnSetupPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['line-item-columns'],
    queryFn: fetchLineItemColumns,
  });

  const [draft, setDraft] = useState<LineItemColumnDef[] | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<'text' | 'number'>('text');
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const draftRef = useRef<LineItemColumnDef[] | null>(null);
  const savedJson = useRef<string>('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (data?.columns && draft === null) {
      savedJson.current = JSON.stringify(data.columns);
      setDraft(data.columns);
    }
  }, [data, draft]);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const saveMutation = useMutation({
    mutationFn: (columns: LineItemColumnDef[]) => saveLineItemColumns(columns),
    onMutate: () => setSaveState('saving'),
    onSuccess: (result, sent) => {
      savedJson.current = JSON.stringify(result.columns);
      qc.setQueryData(['line-item-columns'], result);
      // Keep any newer edits made while this request was in flight.
      if (JSON.stringify(draftRef.current) === JSON.stringify(sent)) {
        setDraft(result.columns);
      }
      setSaveState('saved');
    },
    onError: (e: Error) => {
      setSaveState('error');
      toast.error(e.message || 'Failed to save columns');
    },
  });

  const { mutate: save } = saveMutation;

  // Autosave: any change to the draft is persisted shortly after it settles.
  useEffect(() => {
    if (!draft || JSON.stringify(draft) === savedJson.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(draft), AUTOSAVE_DELAY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [draft, save]);

  // Leaving the page with an unsaved edit still saves it.
  useEffect(
    () => () => {
      const pending = draftRef.current;
      if (pending && JSON.stringify(pending) !== savedJson.current) {
        void saveLineItemColumns(pending).then((r) =>
          qc.setQueryData(['line-item-columns'], r)
        );
      }
    },
    [qc]
  );

  const retry = useCallback(() => {
    if (draftRef.current) save(draftRef.current);
  }, [save]);

  if (!draft) {
    return (
      <LoadingRegion className="max-w-3xl space-y-3">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </LoadingRegion>
    );
  }

  const update = (idx: number, patch: Partial<LineItemColumnDef>) =>
    setDraft((prev) =>
      prev ? prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)) : prev
    );

  const remove = (idx: number) =>
    setDraft((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev));

  function addColumn() {
    const label = newLabel.trim();
    if (!label) {
      toast.error('Enter a column name first');
      return;
    }
    const key = slugify(label);
    if (!key) {
      toast.error('Column name must contain letters or digits');
      return;
    }
    if (draft!.some((c) => c.key === key)) {
      toast.error(`A column with key "${key}" already exists`);
      return;
    }
    setDraft((prev) => [
      ...(prev ?? []),
      {
        key,
        label,
        type: newType,
        required: false,
        builtin: false,
        enabled: true,
        locked: false,
      },
    ]);
    setNewLabel('');
    setNewType('text');
  }

  return (
    <div className="space-y-5">
      <TopBarActions>
        <SaveStatus state={saveState} onRetry={retry} />
      </TopBarActions>

      <div className="max-w-3xl space-y-4">
        <p className="text-sm leading-relaxed text-dark-500 dark:text-dark-400">
          These columns appear on conversation AI extracts and the quotation.
          <span className="font-semibold"> Mandatory</span> columns must be
          filled before a conversation item can be added to the quotation.
          Disabled columns are hidden everywhere. Room and Description are
          locked — they identify an item when conversations merge.
        </p>

        {/* Add a column first on phones: it's the main action, and it saves on its own */}
        <div className="surface space-y-3 p-4 sm:flex sm:items-end sm:gap-3 sm:space-y-0">
          <label className="block flex-1">
            <span className="label-text !mb-1">New column name</span>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addColumn()}
              className={inputCls}
              placeholder="e.g. Brand, Finish, Warranty"
              enterKeyHint="done"
            />
          </label>
          <div className="flex items-end gap-3">
            <label className="block flex-1 sm:flex-none">
              <span className="label-text !mb-1">Type</span>
              <select
                value={newType}
                onChange={(e) =>
                  setNewType(e.target.value as 'text' | 'number')
                }
                className={inputCls}
              >
                <option value="text">text</option>
                <option value="number">number</option>
              </select>
            </label>
            <button
              type="button"
              onClick={addColumn}
              className="btn-primary h-11 shrink-0 px-5"
            >
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
        </div>

        {/* Phones: one card per column */}
        <ul className="space-y-3 md:hidden">
          {draft.map((col, idx) => (
            <li key={col.key} className="surface space-y-3 p-4">
              <div className="flex items-center gap-2">
                {col.locked && (
                  <Lock
                    className="h-4 w-4 shrink-0 text-dark-400"
                    aria-label="Locked"
                  />
                )}
                <input
                  value={col.label}
                  onChange={(e) => update(idx, { label: e.target.value })}
                  className={`${inputCls} font-semibold`}
                  aria-label="Column name"
                />
                {!col.builtin && (
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-dark-500 hover:bg-red-50 hover:text-red-500 dark:text-dark-400 dark:hover:bg-red-500/10"
                    aria-label={`Remove ${col.label}`}
                  >
                    <Trash2 className="h-[18px] w-[18px]" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-dark-500 dark:text-dark-400">
                <span className="font-mono">{col.key}</span>
                {col.builtin && <span className="chip !py-0.5">builtin</span>}
                {col.builtin ? (
                  <span className="chip !py-0.5">{col.type}</span>
                ) : (
                  <select
                    value={col.type}
                    onChange={(e) =>
                      update(idx, { type: e.target.value as 'text' | 'number' })
                    }
                    aria-label="Column type"
                    className="rounded-full border border-line bg-white/80 px-3 py-1 text-xs dark:border-primary-300/15 dark:bg-dark-900/60"
                  >
                    <option value="text">text</option>
                    <option value="number">number</option>
                  </select>
                )}
              </div>
              <div className="divide-y divide-line rounded-2xl border border-line dark:divide-primary-300/10 dark:border-primary-300/10">
                <div className="flex min-h-12 items-center justify-between px-3.5">
                  <span className="text-sm font-medium text-dark-800 dark:text-dark-100">
                    Mandatory
                  </span>
                  <Toggle
                    checked={col.required}
                    disabled={col.locked}
                    onChange={(v) => update(idx, { required: v })}
                    label={`${col.label} mandatory`}
                  />
                </div>
                <div className="flex min-h-12 items-center justify-between px-3.5">
                  <span className="text-sm font-medium text-dark-800 dark:text-dark-100">
                    Show
                  </span>
                  <Toggle
                    checked={col.enabled}
                    disabled={col.locked}
                    onChange={(v) => update(idx, { enabled: v })}
                    label={`${col.label} visible`}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>

        {/* Tablet / desktop: compact table */}
        <div className="surface hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                {['', 'Column', 'Key', 'Type', 'Mandatory', 'Show', ''].map(
                  (h, i) => (
                    <th key={i} className="px-3 py-2.5 text-left">
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-line dark:divide-primary-300/10">
              {draft.map((col, idx) => (
                <tr key={col.key}>
                  <td className="w-8 px-3 py-2 text-dark-400">
                    {col.locked ? (
                      <Lock className="h-3.5 w-3.5" />
                    ) : (
                      <GripVertical className="h-3.5 w-3.5" />
                    )}
                  </td>
                  <td className="min-w-[160px] px-3 py-2">
                    <input
                      value={col.label}
                      onChange={(e) => update(idx, { label: e.target.value })}
                      className={inputCls}
                      aria-label="Column name"
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-dark-500 dark:text-dark-400">
                    {col.key}
                    {col.builtin && (
                      <span className="chip ml-1 !px-2 !py-0 text-[10px]">
                        builtin
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {col.builtin ? (
                      <span className="text-xs text-dark-500 dark:text-dark-400">
                        {col.type}
                      </span>
                    ) : (
                      <select
                        value={col.type}
                        onChange={(e) =>
                          update(idx, {
                            type: e.target.value as 'text' | 'number',
                          })
                        }
                        className={inputCls}
                        aria-label="Column type"
                      >
                        <option value="text">text</option>
                        <option value="number">number</option>
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-center">
                      <Toggle
                        checked={col.required}
                        disabled={col.locked}
                        onChange={(v) => update(idx, { required: v })}
                        label={`${col.label} mandatory`}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-center">
                      <Toggle
                        checked={col.enabled}
                        disabled={col.locked}
                        onChange={(v) => update(idx, { enabled: v })}
                        label={`${col.label} visible`}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!col.builtin && (
                      <button
                        type="button"
                        onClick={() => remove(idx)}
                        className="rounded-full p-2 text-dark-500 hover:bg-red-50 hover:text-red-500 dark:text-dark-400 dark:hover:bg-red-500/10"
                        aria-label={`Remove ${col.label}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs leading-relaxed text-dark-500 dark:text-dark-400">
          Changes save automatically. Removing a custom column hides it and
          stops validating it; values already stored on quotation items are
          kept.
        </p>
      </div>
    </div>
  );
}

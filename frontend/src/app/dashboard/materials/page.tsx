'use client';

import { ListSkeleton, LoadingRegion, Skeleton } from '@/components/ui';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { api } from '@/lib/api';
import {
  type Material,
  type SortDir,
  type SortKey,
  distinctValues,
  sortMaterials,
} from '@/lib/materials';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Search, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { fmtRate } from '@/lib/format';
import { errorMessage } from '@/lib/errors';
import { MarginConfig } from '@/components/materials/types';
import { ValueLists } from '@/components/materials/MaterialFields';
import { ImportModal } from '@/components/materials/ImportModal';
import { EditModal } from '@/components/materials/EditModal';
import { AddMarginRow, MarginRow } from '@/components/materials/MarginRows';
import { SortTh } from '@/components/materials/SortTh';
import { INPUT_CLS } from '@/lib/constants';

// ── Page ──────────────────────────────────────────────────────────────────────
export default function MaterialsPage() {
  const qc = useQueryClient();
  const [showImport, setShowImport] = useState(false);
  const [editTarget, setEditTarget] = useState<Material | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Material | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: 'name',
    dir: 'asc',
  });

  const { data: materials = [], isLoading } = useQuery<Material[]>({
    queryKey: ['materials'],
    queryFn: () => api.get<Material[]>('/materials'),
  });

  const { data: margins = [] } = useQuery<MarginConfig[]>({
    queryKey: ['margins'],
    queryFn: () => api.get<MarginConfig[]>('/margins'),
  });

  const upsertMargin = useMutation({
    mutationFn: ({
      category,
      margin_percent,
    }: {
      category: string | null;
      margin_percent: number;
    }) => api.put('/margins', { category, margin_percent }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['margins'] }),
    onError: (e) => toast.error(errorMessage(e, 'Failed to update margin')),
  });

  const deleteMaterial = useMutation({
    mutationFn: (id: string) => api.delete(`/materials/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['materials'] });
      toast.success('Deleted');
      setDeleteTarget(null);
    },
    onError: (e) => toast.error(errorMessage(e, 'Failed to delete')),
  });

  const categories = distinctValues(materials.map((m) => m.category));
  const units = distinctValues(materials.map((m) => m.unit));

  const q = search.toLowerCase();
  const filtered = sortMaterials(
    materials.filter(
      (m) =>
        (categoryFilter === null ||
          m.category.toLowerCase() === categoryFilter.toLowerCase()) &&
        (!q ||
          m.name.toLowerCase().includes(q) ||
          m.category.toLowerCase().includes(q) ||
          (m.vendor ?? '').toLowerCase().includes(q) ||
          String(m.unit_cost).includes(q) ||
          m.unit.toLowerCase().includes(q))
    ),
    sort.key,
    sort.dir
  );

  const toggleSort = (key: SortKey) =>
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    );

  const invalidateMaterials = () =>
    qc.invalidateQueries({ queryKey: ['materials'] });

  if (isLoading) {
    return (
      <LoadingRegion label="Loading materials" className="space-y-6">
        <Skeleton className="h-24 rounded-2xl" />
        <ListSkeleton rows={6} rowClassName="h-14" className="space-y-2" />
      </LoadingRegion>
    );
  }

  const filtering = search !== '' || categoryFilter !== null;
  const emptyText = filtering
    ? 'No materials match your filters.'
    : 'No materials yet. Click + Add Material to get started.';

  return (
    <div className="space-y-6">
      <ValueLists categories={categories} units={units} />

      {/* Margins */}
      <div className="space-y-3">
        <h2 className="type-label">Margin Configuration</h2>
        <div className="surface space-y-3 p-4">
          <div className="space-y-2">
            {margins.map((m) => (
              <MarginRow
                key={m.id}
                label={m.category ?? 'Global (default)'}
                value={m.margin_percent}
                onSave={async (margin_percent) => {
                  await upsertMargin.mutateAsync({
                    category: m.category,
                    margin_percent,
                  });
                }}
              />
            ))}
            {margins.length === 0 && (
              <p className="text-sm text-dark-500 dark:text-dark-400">
                No margin config. Global default is 15%.
              </p>
            )}
          </div>
          <AddMarginRow
            onAdd={async (category, margin_percent) => {
              await upsertMargin.mutateAsync({ category, margin_percent });
              toast.success(`Margin added for ${category}`);
            }}
          />
        </div>
      </div>

      {/* Materials table */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="type-label">Materials Rates Table</h2>
          <div className="flex w-full items-center gap-3 sm:w-auto">
            {/* Search — full width on mobile */}
            <div className="relative min-w-0 flex-1 sm:flex-none">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-500 dark:text-dark-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search materials…"
                aria-label="Search materials"
                className="field !py-2 !pl-9 !pr-10 sm:!w-64"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-dark-500 hover:text-dark-700 dark:text-dark-400"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowImport(true)}
              className="btn-primary shrink-0 whitespace-nowrap"
            >
              + Add Material
            </button>
          </div>
        </div>

        {categories.length > 1 && (
          <div
            role="group"
            aria-label="Filter by category"
            className="flex flex-wrap gap-2"
          >
            {[null, ...categories].map((c) => {
              const active = categoryFilter === c;
              return (
                <button
                  key={c ?? 'all'}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategoryFilter(c)}
                  className="filter-chip"
                >
                  {c ?? 'All'}
                </button>
              );
            })}
          </div>
        )}

        <p
          aria-live="polite"
          className="text-xs text-dark-500 dark:text-dark-400"
        >
          {filtering
            ? `${filtered.length} of ${materials.length} materials`
            : `${materials.length} material${materials.length === 1 ? '' : 's'}`}
        </p>

        <div className="flex items-center gap-2 md:hidden">
          <label
            htmlFor="materials-sort"
            className="text-xs text-dark-500 dark:text-dark-400"
          >
            Sort by
          </label>
          <select
            id="materials-sort"
            value={`${sort.key}:${sort.dir}`}
            onChange={(e) => {
              const [key, dir] = e.target.value.split(':');
              setSort({ key: key as SortKey, dir: dir as SortDir });
            }}
            className={`${INPUT_CLS} flex-1`}
          >
            <option value="name:asc">Name A–Z</option>
            <option value="name:desc">Name Z–A</option>
            <option value="category:asc">Category</option>
            <option value="unit_cost:asc">Cost, low to high</option>
            <option value="unit_cost:desc">Cost, high to low</option>
            <option value="updated_at:desc">Recently updated</option>
          </select>
        </div>

        <ul className="space-y-3 md:hidden">
          {filtered.map((m) => (
            <li key={m.id} className="surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words font-bold text-dark-900 dark:text-white">
                    {m.name}
                  </p>
                  <span className="badge mt-1 bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300">
                    {m.category}
                  </span>
                </div>
                <div className="flex shrink-0 items-center">
                  <button
                    onClick={() => setEditTarget(m)}
                    className="rounded-full p-3 text-dark-500 hover:bg-primary-50 hover:text-primary-600 dark:text-dark-400 dark:hover:bg-white/10"
                    aria-label={`Edit ${m.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(m)}
                    className="rounded-full p-3 text-dark-500 hover:bg-red-50 hover:text-red-500 dark:text-dark-400 dark:hover:bg-red-500/10"
                    aria-label={`Delete ${m.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-3">
                <div>
                  <dt className="field-label">Cost</dt>
                  <dd className="text-sm font-extrabold tabular-nums text-dark-900 dark:text-white">
                    {fmtRate(m.unit_cost)}
                  </dd>
                </div>
                <div>
                  <dt className="field-label">Unit</dt>
                  <dd className="text-sm text-dark-700 dark:text-dark-300">
                    {m.unit}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="field-label">Vendor</dt>
                  <dd className="truncate text-sm text-dark-700 dark:text-dark-300">
                    {m.vendor ?? '—'}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="surface p-8 text-center text-sm text-dark-500 dark:text-dark-400">
              {emptyText}
            </li>
          )}
        </ul>

        <div className="surface hidden overflow-x-auto md:block">
          <table className="data-table">
            <thead>
              <tr>
                <SortTh
                  label="Name"
                  field="name"
                  sort={sort}
                  onSort={toggleSort}
                />
                <SortTh
                  label="Category"
                  field="category"
                  sort={sort}
                  onSort={toggleSort}
                />
                <th>Unit</th>
                <SortTh
                  label="Cost"
                  field="unit_cost"
                  sort={sort}
                  onSort={toggleSort}
                />
                <th>Vendor</th>
                <SortTh
                  label="Updated"
                  field="updated_at"
                  sort={sort}
                  onSort={toggleSort}
                />
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr
                  key={m.id}
                  className="hover:bg-primary-50/70 dark:hover:bg-white/[0.06]"
                >
                  <td className="font-medium text-dark-900 dark:text-white">
                    {m.name}
                  </td>
                  <td className="text-dark-500 dark:text-dark-400">
                    {m.category}
                  </td>
                  <td className="text-dark-500 dark:text-dark-400">{m.unit}</td>
                  <td className="font-medium tabular-nums text-dark-900 dark:text-white">
                    {fmtRate(m.unit_cost)}
                  </td>
                  <td className="text-dark-500 dark:text-dark-400">
                    {m.vendor ?? '—'}
                  </td>
                  <td className="whitespace-nowrap text-xs text-dark-500 dark:text-dark-400">
                    {new Date(m.updated_at).toLocaleDateString()}
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditTarget(m)}
                        className="rounded-full p-2 text-dark-500 hover:bg-primary-50 hover:text-primary-600 dark:text-dark-400 dark:hover:bg-white/10 dark:hover:text-primary-400"
                        aria-label={`Edit ${m.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(m)}
                        className="rounded-full p-2 text-dark-500 hover:bg-red-50 hover:text-red-500 dark:text-dark-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                        aria-label={`Delete ${m.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="!py-12 text-center text-dark-500 dark:text-dark-400"
                  >
                    {emptyText}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onSaved={invalidateMaterials}
        />
      )}

      {editTarget && (
        <EditModal
          material={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={invalidateMaterials}
        />
      )}

      <ConfirmDeleteModal
        isOpen={!!deleteTarget}
        isLoading={deleteMaterial.isPending}
        title="Delete Material"
        description={`Delete "${deleteTarget?.name}"? Quotation lines or designs that use it may be affected. This cannot be undone.`}
        onConfirm={() => deleteTarget && deleteMaterial.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

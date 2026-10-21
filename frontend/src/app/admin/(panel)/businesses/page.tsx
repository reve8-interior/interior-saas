'use client';

import {
  AccessBadge,
  StatusBadge,
  accessTone,
} from '@/components/admin/AccessBadge';
import { BusinessFormModal } from '@/components/admin/BusinessFormModal';
import { isSuperadmin } from '@/lib/auth';
import { listBusinesses } from '@/lib/businesses';
import { Business } from '@/lib/schemas/business';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PageLoader } from '@/components/ui';

type Filter = 'all' | 'active' | 'inactive' | 'attention';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'inactive', label: 'Inactive' },
  { id: 'attention', label: 'Needs attention' },
];

const needsAttention = (b: Business) =>
  accessTone(b) === 'warn' || accessTone(b) === 'expired';

const contactOf = (b: Business) =>
  [b.contact_email, b.contact_phone].filter(Boolean).join(' · ') || '—';

export default function BusinessesPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    if (!isSuperadmin()) {
      router.replace('/admin/login');
      return;
    }
    setAllowed(true);
  }, [router]);

  const { data: businesses = [], isLoading } = useQuery({
    queryKey: ['businesses'],
    queryFn: listBusinesses,
    enabled: allowed,
  });

  if (!allowed) return null;

  const q = search.trim().toLowerCase();
  const rows = businesses.filter((b) => {
    if (filter === 'active' && !b.is_active) return false;
    if (filter === 'inactive' && b.is_active) return false;
    if (filter === 'attention' && !needsAttention(b)) return false;
    return !q || `${b.name} ${contactOf(b)}`.toLowerCase().includes(q);
  });

  const open = (b: Business) => router.push(`/admin/businesses/${b.id}`);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-500 dark:text-dark-400" />
          <input
            className="field !pl-9"
            placeholder="Search businesses"
            aria-label="Search businesses"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="snap-strip !gap-0 sm:order-last sm:ml-auto">
          <div
            role="tablist"
            aria-label="Filter businesses"
            className="seg shrink-0"
          >
            {FILTERS.map((f) => (
              <button
                key={f.id}
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className="seg-btn whitespace-nowrap"
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => setAddOpen(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> Add business
        </button>
      </div>

      {isLoading && <PageLoader />}
      {!isLoading && rows.length === 0 && (
        <div className="surface p-8 text-center text-dark-500 dark:text-dark-400">
          {businesses.length === 0
            ? 'No businesses yet — add the first one.'
            : 'No businesses match this filter.'}
        </div>
      )}

      {rows.length > 0 && (
        <>
          {/* Phones: tappable cards */}
          <ul className="space-y-3 md:hidden">
            {rows.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/admin/businesses/${b.id}`}
                  className="surface flex items-center gap-3 p-4"
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold">{b.name}</p>
                      <StatusBadge active={b.is_active} />
                    </div>
                    <p className="truncate text-xs text-dark-500 dark:text-dark-400">
                      {contactOf(b)}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 text-xs text-dark-500 dark:text-dark-400">
                      <AccessBadge b={b} />
                      <span>{b.user_count} users</span>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-dark-400" />
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop: table, whole row opens the business */}
          <div className="surface hidden overflow-x-auto md:block">
            <table className="data-table w-full text-sm">
              <thead className="table-head">
                <tr>
                  {['Business', 'Contact', 'Users', 'Access', 'Status', ''].map(
                    (h) => (
                      <th key={h} className="px-4 py-3 text-left">
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() => open(b)}
                    className="cursor-pointer border-t border-line hover:bg-primary-50/70 dark:border-primary-300/15 dark:hover:bg-white/[0.06]"
                  >
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/admin/businesses/${b.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="hover:underline"
                      >
                        {b.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-dark-500 dark:text-dark-400">
                      {contactOf(b)}
                    </td>
                    <td className="px-4 py-3">{b.user_count}</td>
                    <td className="px-4 py-3">
                      <AccessBadge b={b} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge active={b.is_active} />
                    </td>
                    <td className="px-4 py-3 text-right text-dark-400">
                      <ChevronRight className="inline h-4 w-4" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {addOpen && (
        <BusinessFormModal
          open
          business={null}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  );
}

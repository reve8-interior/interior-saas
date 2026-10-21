'use client';

import { MetricCard } from '@/components/dashboard/MetricCard';
import { AccessBadge, accessTone } from '@/components/admin/AccessBadge';
import { getAdminOverview } from '@/lib/adminMonitor';
import { listBusinesses } from '@/lib/businesses';
import { CARD_CLS } from '@/lib/constants';
import { fmtDate, fmtNum, fmtUsd } from '@/lib/format';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Building2,
  CheckSquare,
  FileText,
  Sparkles,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageLoader } from '@/components/ui';

export default function AdminOverviewPage() {
  const router = useRouter();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: getAdminOverview,
  });
  const { data: list = [] } = useQuery({
    queryKey: ['businesses'],
    queryFn: listBusinesses,
  });
  const attention = list.filter(
    (b) => accessTone(b) === 'warn' || accessTone(b) === 'expired'
  );

  if (isLoading) return <PageLoader />;
  if (isError || !data)
    return <p className="text-red-500">Failed to load overview.</p>;

  const { totals, businesses, ai_calls_by_operation: byOp } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <MetricCard
          icon={Building2}
          label="Businesses"
          value={fmtNum(totals.businesses)}
          sublabel="Active"
          subvalue={fmtNum(totals.active_businesses)}
        />
        <MetricCard
          icon={Users}
          label="Clients"
          value={fmtNum(totals.clients)}
          sublabel="Users"
          subvalue={fmtNum(totals.users)}
        />
        <MetricCard
          icon={FileText}
          label="Quotations"
          value={fmtNum(totals.quotations)}
        />
        <MetricCard
          icon={CheckSquare}
          label="Checkpoints"
          value={fmtNum(totals.checkpoints)}
        />
        <MetricCard
          icon={Sparkles}
          label="AI calls"
          value={fmtNum(totals.ai_calls)}
          sublabel="AI cost"
          subvalue={fmtUsd(totals.ai_cost_usd)}
        />
      </div>

      {attention.length > 0 && (
        <section
          aria-label="Needs attention"
          className="surface space-y-3 border-amber-300/60 p-4 dark:border-amber-500/30"
        >
          <h2 className="flex items-center gap-2 text-sm font-extrabold tracking-tight">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Needs attention
            <span className="font-medium text-dark-500 dark:text-dark-400">
              · access expiring or expired
            </span>
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {attention.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/admin/businesses/${b.id}`}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-dark-100 px-3 py-2 text-sm hover:bg-primary-50 dark:bg-dark-700/60 dark:hover:bg-white/10"
                >
                  <span className="truncate font-medium">{b.name}</span>
                  <AccessBadge b={b} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              {[
                'Business',
                'Users',
                'Clients',
                'Quotations',
                'Checkpoints',
                'AI calls',
                'AI cost',
                'Last activity',
              ].map((h) => (
                <th key={h} className="whitespace-nowrap px-4 py-3 text-left">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {businesses.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-6 text-center text-dark-500 dark:text-dark-400"
                >
                  No businesses yet.
                </td>
              </tr>
            )}
            {businesses.map((b) => (
              <tr
                key={b.id ?? 'unassigned'}
                onClick={() =>
                  b.id
                    ? router.push(`/admin/businesses/${b.id}`)
                    : router.push('/admin/businesses/unassigned')
                }
                className="cursor-pointer border-t border-line hover:bg-primary-50/70 dark:border-primary-300/15 dark:hover:bg-white/[0.06]"
              >
                <td className="px-4 py-3 font-medium">
                  {b.name}
                  {!b.is_active && (
                    <span className="ml-2 text-xs text-dark-500 dark:text-dark-400">
                      (inactive)
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">{b.users}</td>
                <td className="px-4 py-3">
                  {b.clients}
                  <span className="text-xs text-dark-500 dark:text-dark-400">
                    {' '}
                    ({b.active_clients} active)
                  </span>
                </td>
                <td className="px-4 py-3">{b.quotations}</td>
                <td className="px-4 py-3">{b.checkpoints}</td>
                <td className="px-4 py-3">{b.ai_calls}</td>
                <td className="px-4 py-3">{fmtUsd(b.ai_cost_usd)}</td>
                <td className="px-4 py-3 text-dark-500 dark:text-dark-400">
                  {fmtDate(b.last_activity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {Object.keys(byOp).length > 0 && (
        <div className={CARD_CLS}>
          <h2 className="mb-3 font-heading text-base font-extrabold tracking-tight">
            AI calls by operation
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(byOp).map(([op, n]) => (
              <li
                key={op}
                className="flex justify-between rounded-xl bg-dark-100 px-3 py-2 text-sm dark:bg-dark-700/60"
              >
                <span>{op}</span>
                <span className="font-medium tabular-nums">{fmtNum(n)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

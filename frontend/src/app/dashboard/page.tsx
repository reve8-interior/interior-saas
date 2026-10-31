'use client';

import { MarginsCard } from '@/components/dashboard/MarginsCard';
import { QuotationPipelineCard } from '@/components/dashboard/QuotationPipelineCard';
import { MetricCard } from '@/components/dashboard/MetricCard';

import { api } from '@/lib/api';
import { getDashboardStats } from '@/lib/dashboard';
import { PHASE_LABELS } from '@/lib/constants';
import { filterSortClients } from '@/lib/clientsList';
import type { Client } from '@/lib/schemas/client';
import Link from 'next/link';
import { fmtInr } from '@/lib/format';
import type { DashboardStats } from '@/lib/schemas/dashboard';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { NewClientModal } from '@/components/crm/NewClientModal';
import { TopBarActions } from '@/components/layout/TopBarActions';
import dynamic from 'next/dynamic';
import { ErrorState, LoadingRegion, Skeleton } from '@/components/ui';
import { AttentionCard } from '@/components/dashboard/AttentionCard';
import { GetStartedCard } from '@/components/dashboard/GetStartedCard';
import { Clock, FileText, IndianRupee, Users } from 'lucide-react';

// recharts is heavy: split the charts out so cards paint first.
const chartLoading = () => <Skeleton className="h-80 rounded-2xl" />;
const AiUsageChart = dynamic(
  () =>
    import('@/components/dashboard/AiUsageChart').then((m) => m.AiUsageChart),
  { ssr: false, loading: chartLoading }
);
const ClientsByPhaseChart = dynamic(
  () =>
    import('@/components/dashboard/ClientsByPhaseChart').then(
      (m) => m.ClientsByPhaseChart
    ),
  { ssr: false, loading: chartLoading }
);
const RevenueByPhaseChart = dynamic(
  () =>
    import('@/components/dashboard/RevenueByPhaseChart').then(
      (m) => m.RevenueByPhaseChart
    ),
  { ssr: false, loading: chartLoading }
);

const SKELETON = 'rounded-2xl';

function DashboardSkeleton() {
  return (
    <LoadingRegion label="Loading dashboard" className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className={`${SKELETON} h-32`} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Skeleton className={`${SKELETON} h-96 lg:col-span-8`} />
        <Skeleton className={`${SKELETON} h-96 lg:col-span-4`} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Skeleton className={`${SKELETON} h-80 lg:col-span-6`} />
        <Skeleton className={`${SKELETON} h-80 lg:col-span-6`} />
      </div>
    </LoadingRegion>
  );
}

export default function DashboardPage() {
  const qc = useQueryClient();
  const [showNewClient, setShowNewClient] = useState(false);
  const {
    data: stats,
    isLoading,
    isError,
    refetch,
  } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: getDashboardStats,
  });

  // Same key as the clients list, so opening it afterwards is instant.
  const { data: clientList = [] } = useQuery<Client[]>({
    queryKey: ['clients', false],
    queryFn: () => api.get<Client[]>('/clients'),
  });
  const recentClients = filterSortClients(clientList, {
    q: '',
    sort: 'recent',
    phase: '',
  }).slice(0, 5);

  if (isLoading) return <DashboardSkeleton />;
  if (isError || !stats) {
    return (
      <ErrorState onRetry={() => refetch()}>
        Couldn&apos;t load the dashboard.
      </ErrorState>
    );
  }

  return (
    <div className="space-y-6">
      <TopBarActions>
        <button onClick={() => setShowNewClient(true)} className="btn-primary">
          + New Client
        </button>
      </TopBarActions>
      {showNewClient && (
        <NewClientModal
          onClose={() => setShowNewClient(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['clients'] })}
        />
      )}
      <GetStartedCard
        hasClients={stats.total_clients > 0}
        onAddClient={() => setShowNewClient(true)}
      />
      <AttentionCard />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={IndianRupee}
          tone="green"
          label="Approved revenue"
          value={fmtInr(stats.total_revenue_approved)}
          sublabel="Awaiting approval"
          subvalue={fmtInr(stats.total_revenue_pending)}
        />
        <MetricCard
          icon={Users}
          tone="blue"
          href="/dashboard/clients"
          label="Active clients"
          value={String(stats.active_clients)}
          sublabel="New this month"
          subvalue={String(stats.new_this_month)}
        />
        <MetricCard
          icon={FileText}
          tone="brand"
          href="/dashboard/clients?phase=quotation"
          label="Pending quotations"
          value={String(stats.quotations_pending)}
          sublabel="Meetings, last 30 days"
          subvalue={String(stats.recent_checkpoints_30d)}
        />
        <MetricCard
          icon={Clock}
          tone="amber"
          href="/dashboard/clients?phase=completed"
          label="Avg completion"
          value={`${stats.avg_project_days.toFixed(0)} days`}
          sublabel="Projects completed"
          subvalue={String(stats.clients_by_phase.completed ?? 0)}
        />
      </div>

      {recentClients.length > 0 && (
        <section className="surface p-5" aria-labelledby="recent-clients">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2
              id="recent-clients"
              className="font-heading text-base font-extrabold tracking-tight"
            >
              Recent clients
            </h2>
            <Link
              href="/dashboard/clients"
              className="text-sm font-semibold text-primary-600 hover:underline dark:text-primary-400"
            >
              View all
            </Link>
          </div>
          <ul className="divide-y divide-line">
            {recentClients.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/dashboard/clients/${c.id}`}
                  className="flex min-h-12 items-center justify-between gap-3 py-2 hover:text-primary-600 dark:hover:text-primary-400"
                >
                  <span className="truncate text-sm font-medium">{c.name}</span>
                  <span className="shrink-0 text-xs text-dark-500 dark:text-dark-400">
                    {PHASE_LABELS[c.current_phase] ?? c.current_phase}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <RevenueByPhaseChart data={stats.revenue_by_phase} />
        </div>
        <div className="lg:col-span-4">
          <ClientsByPhaseChart
            data={stats.clients_by_phase}
            total={stats.total_clients}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <QuotationPipelineCard
          approved={stats.total_revenue_approved}
          pending={stats.total_revenue_pending}
          pendingCount={stats.quotations_pending}
        />
        <AiUsageChart
          data={stats.ai_calls_by_operation}
          totalCalls={stats.ai_total_calls}
          totalCostUsd={stats.ai_total_cost_usd}
          avgLatencyMs={stats.ai_avg_latency_ms}
        />
        <MarginsCard
          globalMargin={stats.global_margin_percent}
          byCategory={stats.margins_by_category}
        />
      </div>
    </div>
  );
}

'use client';

import { MarginsCard } from '@/components/dashboard/MarginsCard';
import { QuotationPipelineCard } from '@/components/dashboard/QuotationPipelineCard';
import { MetricCard } from '@/components/dashboard/MetricCard';

import { getDashboardStats } from '@/lib/dashboard';
import { fmtInr } from '@/lib/format';
import type { DashboardStats } from '@/lib/schemas/dashboard';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { NewClientModal } from '@/components/crm/NewClientModal';
import { TopBarActions } from '@/components/layout/TopBarActions';
import dynamic from 'next/dynamic';
import { Clock, FileText, IndianRupee, Users } from 'lucide-react';

// recharts is heavy: split the charts out so cards paint first.
const chartLoading = () => (
  <div className="h-80 animate-pulse rounded-2xl bg-primary-100/70 dark:bg-white/10" />
);
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

const SKELETON = 'animate-pulse rounded-2xl bg-primary-100/70 dark:bg-white/10';

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={`${SKELETON} h-32`} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className={`${SKELETON} h-96 lg:col-span-8`} />
        <div className={`${SKELETON} h-96 lg:col-span-4`} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className={`${SKELETON} h-80 lg:col-span-6`} />
        <div className={`${SKELETON} h-80 lg:col-span-6`} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const qc = useQueryClient();
  const [showNewClient, setShowNewClient] = useState(false);
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: getDashboardStats,
  });

  if (isLoading) return <DashboardSkeleton />;
  if (!stats) return null;

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
          href="/dashboard/board"
          label="Pending quotations"
          value={String(stats.quotations_pending)}
          sublabel="Conversations, last 30 days"
          subvalue={String(stats.recent_checkpoints_30d)}
        />
        <MetricCard
          icon={Clock}
          tone="amber"
          label="Avg completion"
          value={`${stats.avg_project_days.toFixed(0)} days`}
          sublabel="Projects completed"
          subvalue={String(stats.clients_by_phase.completed ?? 0)}
        />
      </div>

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

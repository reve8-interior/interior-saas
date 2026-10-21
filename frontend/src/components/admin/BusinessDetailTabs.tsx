'use client';

import { Skeleton } from '@/components/ui';
import { AiSettingsCard } from '@/components/admin/AiSettingsCard';
import { MetricCard } from '@/components/dashboard/MetricCard';
import { BusinessUsersPanel } from '@/components/admin/BusinessUsersPanel';
import { getBusinessClients, getBusinessUsage } from '@/lib/adminMonitor';
import { INPUT_CLS, OPERATION_LABELS } from '@/lib/constants';
import { fmtDate, fmtNum, fmtUsd } from '@/lib/format';
import { BusinessUsage } from '@/lib/schemas/adminMonitor';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  CheckSquare,
  Coins,
  FileText,
  Search,
  Sparkles,
  Timer,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PageLoader } from '@/components/ui';

const opLabel = (op: string) => OPERATION_LABELS[op] ?? op;

function contactText(info: Record<string, unknown>): string {
  const parts = Object.values(info).filter(
    (v): v is string | number => typeof v === 'string' || typeof v === 'number'
  );
  return parts.length ? parts.join(' · ') : '—';
}

const TH = 'whitespace-nowrap px-3 py-2 text-left';
const TD_BORDER = 'border-t border-line dark:border-primary-300/15';

// ── Overview ────────────────────────────────────────────────────────────────
function OverviewTab({ business }: { business: BusinessUsage }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
        <MetricCard icon={Users} label="Users" value={fmtNum(business.users)} />
        <MetricCard
          icon={Users}
          label="Clients"
          value={fmtNum(business.clients)}
          sublabel="Active"
          subvalue={fmtNum(business.active_clients)}
        />
        <MetricCard
          icon={FileText}
          label="Quotations"
          value={fmtNum(business.quotations)}
        />
        <MetricCard
          icon={CheckSquare}
          label="Checkpoints"
          value={fmtNum(business.checkpoints)}
        />
        <MetricCard
          icon={Sparkles}
          label="AI calls"
          value={fmtNum(business.ai_calls)}
        />
        <MetricCard
          icon={Activity}
          label="Tokens"
          value={fmtNum(business.ai_tokens)}
        />
        <MetricCard
          icon={Coins}
          label="AI cost"
          value={fmtUsd(business.ai_cost_usd)}
        />
      </div>
      <p className="text-sm text-dark-500 dark:text-dark-400">
        Last activity: {fmtDate(business.last_activity)}
      </p>
    </div>
  );
}

// ── Clients ─────────────────────────────────────────────────────────────────
function ClientsTab({ business }: { business: BusinessUsage }) {
  const [search, setSearch] = useState('');
  const { data = [], isLoading } = useQuery({
    queryKey: ['admin-business-clients', business.id ?? 'unassigned'],
    queryFn: () => getBusinessClients(business.id),
  });

  const q = search.trim().toLowerCase();
  const rows = q
    ? data.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          contactText(c.contact_info).toLowerCase().includes(q)
      )
    : data;

  return (
    <div className="space-y-3">
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-500 dark:text-dark-400" />
        <input
          className={`${INPUT_CLS} pl-9`}
          placeholder="Search clients or contacts"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="overflow-x-auto rounded-xl border border-line dark:border-primary-300/15">
        <table className="w-full text-sm">
          <thead className="table-head">
            <tr>
              {[
                'Client',
                'Contact',
                'Designer',
                'Phase',
                'Quotes',
                'Checkpoints',
                'AI calls',
                'Added',
              ].map((h) => (
                <th key={h} className={TH}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr role="status" aria-busy="true">
                <td colSpan={8} className="px-3 py-3">
                  <span className="sr-only">Loading…</span>
                  <div className="space-y-2" aria-hidden="true">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-9 w-full" />
                    ))}
                  </div>
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-8 text-center text-dark-500 dark:text-dark-400"
                >
                  No clients.
                </td>
              </tr>
            )}
            {rows.map((c) => (
              <tr key={c.id}>
                <td className={`${TD_BORDER} px-3 py-2 font-medium`}>
                  {c.name}
                  {!c.is_active && (
                    <span className="ml-2 text-xs text-dark-500 dark:text-dark-400">
                      (inactive)
                    </span>
                  )}
                </td>
                <td
                  className={`${TD_BORDER} px-3 py-2 text-dark-500 dark:text-dark-400`}
                >
                  {contactText(c.contact_info)}
                </td>
                <td
                  className={`${TD_BORDER} px-3 py-2 text-dark-500 dark:text-dark-400`}
                >
                  {c.designer_email ?? '—'}
                </td>
                <td className={`${TD_BORDER} px-3 py-2 capitalize`}>
                  {c.phase}
                </td>
                <td className={`${TD_BORDER} px-3 py-2`}>{c.quotations}</td>
                <td className={`${TD_BORDER} px-3 py-2`}>{c.checkpoints}</td>
                <td className={`${TD_BORDER} px-3 py-2`}>{c.ai_calls}</td>
                <td className={`${TD_BORDER} px-3 py-2`}>
                  {fmtDate(c.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── AI usage ────────────────────────────────────────────────────────────────
const RANGES = [7, 30, 90] as const;

function UsageSection({ businessId }: { businessId: string }) {
  const [days, setDays] = useState<number>(30);
  const { data, isLoading } = useQuery({
    queryKey: ['admin-business-usage', businessId, days],
    queryFn: () => getBusinessUsage(businessId, days),
  });

  if (isLoading || !data) return <PageLoader />;

  const totalTokens = data.input_tokens + data.output_tokens;
  const chart = data.daily.map((d) => ({
    day: d.day.slice(5),
    tokens: d.tokens,
    calls: d.calls,
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-extrabold tracking-tight">Usage</h3>
        <div className="flex gap-1 rounded-xl bg-dark-100 p-1 dark:bg-dark-700/60">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setDays(r)}
              className={`rounded-lg px-3 py-1 text-xs font-medium ${
                days === r
                  ? 'bg-white text-dark-900 shadow-sm dark:bg-dark-600 dark:text-white'
                  : 'text-dark-500 dark:text-dark-400'
              }`}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <MetricCard icon={Sparkles} label="Calls" value={fmtNum(data.calls)} />
        <MetricCard
          icon={Activity}
          label="Tokens"
          value={fmtNum(totalTokens)}
          sublabel="In / out"
          subvalue={`${fmtNum(data.input_tokens)} / ${fmtNum(data.output_tokens)}`}
        />
        <MetricCard icon={Coins} label="Cost" value={fmtUsd(data.cost_usd)} />
        <MetricCard
          icon={Timer}
          label="Avg latency"
          value={`${fmtNum(Math.round(data.avg_latency_ms))} ms`}
        />
        <MetricCard
          icon={Activity}
          label="Errors"
          value={fmtNum(data.errors)}
          tone={data.errors > 0 ? 'red' : 'brand'}
        />
      </div>

      <div className="surface p-4">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-dark-500">
          Tokens per day
        </h4>
        {totalTokens === 0 ? (
          <p className="py-10 text-center text-sm text-dark-500 dark:text-dark-400">
            No AI usage in this period.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chart} margin={{ top: 0, right: 0, left: 0 }}>
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={50}
              />
              <Tooltip />
              <Bar dataKey="tokens" fill="#6366F1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <div className="overflow-x-auto rounded-xl border border-line dark:border-primary-300/15">
          <table className="w-full text-sm">
            <thead className="table-head">
              <tr>
                {[
                  'Operation',
                  'Calls',
                  'Errors',
                  'Input',
                  'Output',
                  'Cost',
                ].map((h) => (
                  <th key={h} className={TH}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.by_operation.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-6 text-center text-dark-500 dark:text-dark-400"
                  >
                    No calls.
                  </td>
                </tr>
              )}
              {data.by_operation.map((o) => (
                <tr key={o.operation}>
                  <td className={`${TD_BORDER} px-3 py-2 font-medium`}>
                    {opLabel(o.operation)}
                  </td>
                  <td className={`${TD_BORDER} px-3 py-2`}>
                    {fmtNum(o.calls)}
                  </td>
                  <td className={`${TD_BORDER} px-3 py-2`}>
                    {fmtNum(o.errors)}
                  </td>
                  <td className={`${TD_BORDER} px-3 py-2`}>
                    {fmtNum(o.input_tokens)}
                  </td>
                  <td className={`${TD_BORDER} px-3 py-2`}>
                    {fmtNum(o.output_tokens)}
                  </td>
                  <td className={`${TD_BORDER} px-3 py-2`}>
                    {fmtUsd(o.cost_usd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="max-h-72 overflow-auto rounded-xl border border-line dark:border-primary-300/15">
          <table className="w-full text-sm">
            <thead className="table-head sticky top-0">
              <tr>
                {[
                  'When',
                  'Operation',
                  'Client',
                  'Tokens',
                  'Cost',
                  'Status',
                ].map((h) => (
                  <th key={h} className={TH}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.recent.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-6 text-center text-dark-500 dark:text-dark-400"
                  >
                    No recent calls.
                  </td>
                </tr>
              )}
              {data.recent.map((r, i) => (
                <tr key={`${r.timestamp}-${i}`}>
                  <td className={`${TD_BORDER} whitespace-nowrap px-3 py-2`}>
                    {new Date(r.timestamp).toLocaleString()}
                  </td>
                  <td className={`${TD_BORDER} px-3 py-2`}>
                    {opLabel(r.operation)}
                  </td>
                  <td className={`${TD_BORDER} px-3 py-2`}>
                    {r.client_name ?? '—'}
                  </td>
                  <td className={`${TD_BORDER} px-3 py-2`}>
                    {fmtNum((r.input_tokens ?? 0) + (r.output_tokens ?? 0))}
                  </td>
                  <td className={`${TD_BORDER} px-3 py-2`}>
                    {r.cost_usd === null ? '—' : fmtUsd(r.cost_usd)}
                  </td>
                  <td className={`${TD_BORDER} px-3 py-2`}>
                    <span
                      className={
                        r.status === 'success'
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-500'
                      }
                    >
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Tabs ────────────────────────────────────────────────────────────────────
export type BusinessTab = 'overview' | 'clients' | 'users' | 'ai' | 'usage';

export default function BusinessDetailTabs({
  business,
  tab,
  onTab,
}: {
  business: BusinessUsage;
  tab: BusinessTab;
  onTab: (tab: BusinessTab) => void;
}) {
  const tabs: { id: BusinessTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'clients', label: `Clients (${business.clients})` },
    // Unassigned clients have no business, hence no logins, key or usage.
    ...(business.id
      ? [
          { id: 'users' as const, label: `Users (${business.users})` },
          { id: 'ai' as const, label: 'AI settings' },
          { id: 'usage' as const, label: 'Usage' },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <div className="snap-strip !gap-0">
        <div role="tablist" className="seg shrink-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => onTab(t.id)}
              className="seg-btn whitespace-nowrap"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && <OverviewTab business={business} />}
      {tab === 'clients' && <ClientsTab business={business} />}
      {tab === 'users' && business.id && (
        <BusinessUsersPanel businessId={business.id} />
      )}
      {tab === 'ai' && business.id && (
        <AiSettingsCard businessId={business.id} />
      )}
      {tab === 'usage' && business.id && (
        <UsageSection businessId={business.id} />
      )}
    </div>
  );
}

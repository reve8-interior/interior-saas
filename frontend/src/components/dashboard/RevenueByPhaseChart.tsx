'use client';

import { PHASE_COLORS_HEX, PHASE_LABELS, PHASE_ORDER } from '@/lib/constants';
import { fmtInr, fmtRate } from '@/lib/format';
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts';
import { ChartCard, EmptyChart } from './ChartCard';
import { ChartTooltip } from './ChartTooltip';

interface Props {
  data: Record<string, number>;
}

export function RevenueByPhaseChart({ data }: Props) {
  const chartData = PHASE_ORDER.filter((p) => (data[p] ?? 0) > 0).map(
    (phase) => ({
      name: PHASE_LABELS[phase] ?? phase,
      value: data[phase],
      phase,
    })
  );
  const total = chartData.reduce((sum, d) => sum + d.value, 0);

  return (
    <ChartCard
      title="Revenue by phase"
      description="Quotation value at each stage of the pipeline"
      stat={
        total > 0 && (
          <>
            <p className="text-2xl font-bold tabular-nums text-dark-900 dark:text-white">
              {fmtInr(total)}
            </p>
            <p className="text-xs text-dark-500 dark:text-dark-400">total</p>
          </>
        )
      }
    >
      {chartData.length === 0 ? (
        <EmptyChart message="No revenue yet" />
      ) : (
        <div
          role="img"
          aria-label={`Revenue by phase: ${chartData
            .map((d) => `${d.name} ${fmtInr(d.value)}`)
            .join(', ')}`}
          className="h-56 text-dark-600 dark:text-dark-300"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 24, right: 8, left: 8, bottom: 0 }}
            >
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: 'currentColor' }}
                tickLine={false}
                axisLine={{ stroke: 'currentColor', strokeOpacity: 0.2 }}
              />
              <Tooltip
                cursor={{ fill: 'currentColor', fillOpacity: 0.06 }}
                content={({ active, payload }) => {
                  const row = payload?.[0]?.payload as
                    | (typeof chartData)[number]
                    | undefined;
                  if (!active || !row) return null;
                  return (
                    <ChartTooltip
                      title={row.name}
                      value={fmtRate(row.value)}
                      color={PHASE_COLORS_HEX[row.phase]}
                    />
                  );
                }}
              />
              <Bar dataKey="value" radius={[8, 8, 0, 0]} maxBarSize={72}>
                {chartData.map((entry) => (
                  <Cell
                    key={entry.phase}
                    fill={PHASE_COLORS_HEX[entry.phase] ?? '#94A3B8'}
                  />
                ))}
                <LabelList
                  dataKey="value"
                  position="top"
                  formatter={(v: number) => fmtInr(v)}
                  fill="currentColor"
                  fontSize={12}
                  fontWeight={600}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

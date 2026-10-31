'use client';

import { fmtRate } from '@/lib/format';
import type { QuotationVersion } from '@/lib/schemas/quotationVersion';
import { ScrollPanel } from './PanelParts';
export function ItemsTab({ version }: { version: QuotationVersion }) {
  const items = version.line_items.filter((i) => i.status !== 'removed');

  return (
    <ScrollPanel>
      <div className="overflow-x-auto">
        <table className="data-table w-max min-w-full">
          <thead className="sticky top-0 z-10">
            <tr>
              <th>Room</th>
              <th>Description</th>
              <th className="text-right">Qty</th>
              <th>Unit</th>
              <th className="text-right">Rate</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td className="whitespace-nowrap font-medium text-dark-900 dark:text-white">
                  {item.room}
                </td>
                <td className="min-w-48 text-dark-700 dark:text-dark-200">
                  {item.description}
                </td>
                <td className="text-right tabular-nums">{item.qty ?? '—'}</td>
                <td>{item.unit}</td>
                <td className="text-right tabular-nums">
                  {item.rate !== null ? fmtRate(item.rate) : '—'}
                </td>
                <td className="text-right font-medium tabular-nums text-dark-900 dark:text-white">
                  {fmtRate(item.negotiated_price ?? item.initial_price ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ScrollPanel>
  );
}

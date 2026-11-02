'use client';

import { CARD_CLS } from '@/lib/constants';
import { getAdminFeedback } from '@/lib/feedback';
import { fmtDate } from '@/lib/format';
import { useQuery } from '@tanstack/react-query';
import { Star } from 'lucide-react';

function Stars({ value }: { value: number }) {
  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={`${value} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${
            n <= Math.round(value)
              ? 'fill-amber-400 text-amber-400'
              : 'text-dark-300 dark:text-dark-600'
          }`}
        />
      ))}
    </span>
  );
}

/** What users said about each feature: averages, popular picks and the latest answers. */
export function FeedbackCard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-feedback'],
    queryFn: getAdminFeedback,
  });

  if (isLoading) return null;
  if (isError || !data)
    return <p className="text-red-500">Failed to load feedback.</p>;

  return (
    <div className={CARD_CLS}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-base font-extrabold tracking-tight">
          User feedback
        </h2>
        {data.total > 0 && (
          <span className="flex items-center gap-2 text-sm text-dark-500 dark:text-dark-400">
            <Stars value={data.avg_rating} />
            {data.avg_rating.toFixed(1)} · {data.total}{' '}
            {data.total === 1 ? 'answer' : 'answers'}
          </span>
        )}
      </div>

      {data.total === 0 ? (
        <p className="text-sm text-dark-500 dark:text-dark-400">
          No feedback yet. Users are asked about one feature at a time, now and
          then.
        </p>
      ) : (
        <div className="space-y-5">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.features.map((f) => {
              const top = Math.max(...f.choices.map((c) => c.count), 1);
              return (
                <li
                  key={f.feature}
                  className="space-y-2 rounded-xl bg-dark-100 p-3 dark:bg-dark-700/60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{f.title}</span>
                    <span className="text-xs text-dark-500 dark:text-dark-400">
                      {f.count}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Stars value={f.avg_rating} />
                    <span className="tabular-nums">
                      {f.avg_rating.toFixed(1)}
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {f.choices.map((c) => (
                      <li key={c.value} className="text-xs">
                        <div className="flex justify-between gap-2">
                          <span className="truncate">{c.label}</span>
                          <span className="tabular-nums">{c.count}</span>
                        </div>
                        <div className="mt-0.5 h-1 rounded-full bg-dark-200 dark:bg-dark-600">
                          <div
                            className="h-1 rounded-full bg-brand"
                            style={{ width: `${(c.count / top) * 100}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="table-head">
                <tr>
                  {[
                    'When',
                    'Business',
                    'User',
                    'Feature',
                    'Rating',
                    'Pick',
                  ].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-3 py-2 text-left"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.recent.map((e) => (
                  <tr key={e.id} className="border-t border-line">
                    <td className="whitespace-nowrap px-3 py-2 text-dark-500 dark:text-dark-400">
                      {fmtDate(e.created_at)}
                    </td>
                    <td className="px-3 py-2">{e.business_name ?? '—'}</td>
                    <td className="px-3 py-2">{e.user_email ?? '—'}</td>
                    <td className="px-3 py-2">{e.title}</td>
                    <td className="px-3 py-2">
                      <Stars value={e.rating} />
                    </td>
                    <td className="px-3 py-2">{e.choice_label ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

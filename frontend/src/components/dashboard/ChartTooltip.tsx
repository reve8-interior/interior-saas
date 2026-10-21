interface ChartTooltipProps {
  title: string;
  value: string;
  color?: string;
}

/** Theme-aware tooltip body (recharts' default is white-only). */
export function ChartTooltip({ title, value, color }: ChartTooltipProps) {
  return (
    <div className="rounded-xl border border-line bg-white/95 px-3 py-2 text-xs shadow-card backdrop-blur-xl dark:border-primary-300/20 dark:bg-dark-900/95">
      <div className="flex items-center gap-2">
        {color && (
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: color }}
          />
        )}
        <span className="text-dark-500 dark:text-dark-400">{title}</span>
      </div>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-dark-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}

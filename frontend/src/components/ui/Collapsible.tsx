import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

interface CollapsibleProps {
  title: string;
  /** Short hint shown beside the title while closed, e.g. the current choice. */
  summary?: string | null;
  defaultOpen?: boolean;
  /** Plain `surface` card when true; omit inside another card. */
  card?: boolean;
  children: ReactNode;
}

/** Native <details> dropdown: keyboard and screen-reader friendly, and closed content stays mounted. */
export function Collapsible({
  title,
  summary,
  defaultOpen = false,
  card = true,
  children,
}: CollapsibleProps) {
  return (
    <details
      open={defaultOpen}
      className={`group ${card ? 'surface' : 'border-t border-line pt-3 first:border-t-0 first:pt-0'}`}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 text-sm font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <span className="flex min-w-0 items-center gap-2">
          {summary && (
            <span className="truncate text-xs font-normal text-faint group-open:hidden">
              {summary}
            </span>
          )}
          <ChevronDown
            aria-hidden
            className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
          />
        </span>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

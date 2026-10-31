import Link from 'next/link';

/**
 * Second-level navigation under the Quotation tab. Meeting notes appear only
 * when AI is on or older notes exist, so hand-entry users never see them empty.
 */
export function QuotationSections({
  base,
  pathname,
  showNotes,
  notesCount,
  versionsCount,
}: {
  base: string;
  pathname: string;
  showNotes: boolean;
  notesCount: number;
  /** Saved versions; undefined while still loading. */
  versionsCount?: number;
}) {
  const sections = [
    { href: `${base}/quotation`, label: 'Items' },
    ...(showNotes
      ? [{ href: `${base}/checkpoints`, label: 'Meeting notes' }]
      : []),
    { href: `${base}/versions`, label: 'Versions' },
  ];

  return (
    <nav
      aria-label="Quotation sections"
      className="mb-6 flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {sections.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`inline-flex min-h-control shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors ${
              active
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-500/20 dark:text-primary-200'
                : 'text-dark-600 hover:bg-dark-100 hover:text-dark-900 dark:text-dark-300 dark:hover:bg-dark-700 dark:hover:text-white'
            }`}
          >
            {label}
            {label === 'Meeting notes' && notesCount > 0 && (
              <span className="text-xs tabular-nums opacity-70">
                {notesCount}
              </span>
            )}
            {label === 'Versions' && versionsCount !== undefined && (
              <span
                className="text-xs tabular-nums opacity-70"
                aria-label={`${versionsCount} saved`}
              >
                {versionsCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

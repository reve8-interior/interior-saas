import { Kanban, List } from 'lucide-react';
import Link from 'next/link';

const VIEWS = [
  { key: 'list', label: 'List', href: '/dashboard/clients', icon: List },
  { key: 'board', label: 'Board', href: '/dashboard/board', icon: Kanban },
] as const;

/** One place for clients, two ways to look at them. */
export function ClientsViewSwitch({ active }: { active: 'list' | 'board' }) {
  return (
    <nav
      aria-label="Client view"
      className="inline-flex gap-1 rounded-full border border-line bg-white/60 p-1 dark:border-primary-300/15 dark:bg-white/5"
    >
      {VIEWS.map(({ key, label, href, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          aria-current={key === active ? 'page' : undefined}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors ${
            key === active
              ? 'bg-primary-600 text-white'
              : 'text-dark-600 hover:text-dark-900 dark:text-dark-300 dark:hover:text-white'
          }`}
        >
          <Icon className="h-4 w-4" aria-hidden />
          {label}
        </Link>
      ))}
    </nav>
  );
}

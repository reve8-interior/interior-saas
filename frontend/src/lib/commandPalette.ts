export interface PaletteEntry {
  id: string;
  label: string;
  /** Secondary text, e.g. what kind of destination it is. */
  hint: string;
  href: string;
}

const CLIENT_SECTIONS: [slug: string, label: string][] = [
  ['', 'Workspace'],
  ['quotation', 'Quotation'],
  ['designs', 'Designs'],
  ['checkpoints', 'Meeting notes'],
];

/** Every place the palette can jump to: app pages, and each client's sections. */
export function buildEntries(
  pages: { name: string; href: string }[],
  clients: { id: string; name: string }[]
): PaletteEntry[] {
  const entries: PaletteEntry[] = pages.map((p) => ({
    id: `page:${p.href}`,
    label: p.name,
    hint: 'Page',
    href: p.href,
  }));
  for (const c of clients) {
    for (const [slug, label] of CLIENT_SECTIONS) {
      entries.push({
        id: `client:${c.id}:${slug}`,
        label: slug ? `${c.name} · ${label}` : c.name,
        hint: slug ? 'Client' : 'Client workspace',
        href: `/dashboard/clients/${c.id}${slug ? `/${slug}` : ''}`,
      });
    }
  }
  return entries;
}

function rank(label: string, q: string): number | null {
  const l = label.toLowerCase();
  if (l.startsWith(q)) return 0;
  if (l.split(/[\s·]+/).some((w) => w.startsWith(q))) return 1;
  return l.includes(q) ? 2 : null;
}

/**
 * Entries matching `query`, best matches first, at most `limit`. A blank
 * query lists the pages (not every client section) as a starting point.
 */
export function searchEntries(
  entries: PaletteEntry[],
  query: string,
  limit = 8
): PaletteEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries.filter((e) => e.hint === 'Page').slice(0, limit);
  return entries
    .map((entry, order) => ({ entry, order, score: rank(entry.label, q) }))
    .filter((r): r is typeof r & { score: number } => r.score !== null)
    .sort((a, b) => a.score - b.score || a.order - b.order)
    .slice(0, limit)
    .map((r) => r.entry);
}

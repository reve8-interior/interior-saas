import { describe, expect, it } from 'vitest';
import { buildEntries, searchEntries } from '../commandPalette';

const entries = buildEntries(
  [
    { name: 'Dashboard', href: '/dashboard' },
    { name: 'Shared links', href: '/dashboard/shared' },
  ],
  [
    { id: 'c1', name: 'Mrs Rao' },
    { id: 'c2', name: 'Raghav Iyer' },
  ]
);

describe('buildEntries', () => {
  it('adds a workspace and three sections per client', () => {
    const rao = entries.filter((e) => e.id.startsWith('client:c1'));
    expect(rao.map((e) => e.href)).toEqual([
      '/dashboard/clients/c1',
      '/dashboard/clients/c1/quotation',
      '/dashboard/clients/c1/designs',
      '/dashboard/clients/c1/checkpoints',
    ]);
  });
});

describe('searchEntries', () => {
  it('lists pages for a blank query', () => {
    expect(searchEntries(entries, '').map((e) => e.label)).toEqual([
      'Dashboard',
      'Shared links',
    ]);
  });

  it('ranks prefix matches above word and substring matches', () => {
    const labels = searchEntries(entries, 'ra').map((e) => e.label);
    expect(labels[0]).toBe('Raghav Iyer');
    expect(labels).toContain('Mrs Rao');
  });

  it('reaches a client section by typing its name and section', () => {
    expect(searchEntries(entries, 'rao · quo')[0].href).toBe(
      '/dashboard/clients/c1/quotation'
    );
  });

  it('returns nothing when nothing matches and honours the limit', () => {
    expect(searchEntries(entries, 'zzz')).toEqual([]);
    expect(searchEntries(entries, 'r', 2)).toHaveLength(2);
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildClientQuery,
  filterSortClients,
  nextColumnSort,
  parseClientParams,
} from '../clientsList';
import type { Client } from '../schemas/client';

const mk = (over: Partial<Client>): Client => ({
  id: over.name ?? 'x',
  name: 'A',
  current_phase: 'discussion',
  contact_info: {},
  assigned_designer_id: null,
  assigned_designer: null,
  notes: null,
  is_active: true,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  completed_at: null,
  ...over,
});

describe('parseClientParams', () => {
  it('falls back to defaults on junk', () => {
    const p = parseClientParams(
      new URLSearchParams('sort=zzz&phase=nope&tab=x')
    );
    expect(p).toEqual({ tab: 'active', q: '', sort: 'recent', phase: '' });
  });
  it('round-trips through buildClientQuery', () => {
    const p = parseClientParams(
      new URLSearchParams('tab=inactive&q=bob&sort=name&phase=design')
    );
    expect(parseClientParams(new URLSearchParams(buildClientQuery(p)))).toEqual(
      p
    );
  });
  it('omits defaults', () => {
    expect(
      buildClientQuery({ tab: 'active', q: '', sort: 'recent', phase: '' })
    ).toBe('');
  });
});

describe('nextColumnSort', () => {
  it('picks ascending first, then flips', () => {
    expect(nextColumnSort('name', 'recent')).toBe('name');
    expect(nextColumnSort('name', 'name')).toBe('name_desc');
    expect(nextColumnSort('name', 'name_desc')).toBe('name');
    expect(nextColumnSort('updated', 'recent')).toBe('oldest');
  });
});

describe('filterSortClients', () => {
  const list = [
    mk({ name: 'Zed', updated_at: '2026-03-01', current_phase: 'design' }),
    mk({
      name: 'Amy',
      updated_at: '2026-01-01',
      contact_info: { email: 'amy@x.com' },
    }),
    mk({ name: 'Bob', updated_at: '2026-02-01', current_phase: 'design' }),
  ];
  it('sorts by recency by default', () => {
    expect(
      filterSortClients(list, { q: '', sort: 'recent', phase: '' }).map(
        (c) => c.name
      )
    ).toEqual(['Zed', 'Bob', 'Amy']);
  });
  it('sorts by name and phase', () => {
    expect(
      filterSortClients(list, { q: '', sort: 'name', phase: '' }).map(
        (c) => c.name
      )
    ).toEqual(['Amy', 'Bob', 'Zed']);
    expect(
      filterSortClients(list, { q: '', sort: 'phase', phase: '' }).map(
        (c) => c.name
      )
    ).toEqual(['Amy', 'Bob', 'Zed']);
  });
  it('supports descending and oldest-first sorts', () => {
    const names = (sort: Parameters<typeof filterSortClients>[1]['sort']) =>
      filterSortClients(list, { q: '', sort, phase: '' }).map((c) => c.name);
    expect(names('name_desc')).toEqual(['Zed', 'Bob', 'Amy']);
    expect(names('oldest')).toEqual(['Amy', 'Bob', 'Zed']);
    expect(names('phase_desc')).toEqual(['Bob', 'Zed', 'Amy']);
  });
  it('filters by phase and search', () => {
    expect(
      filterSortClients(list, { q: '', sort: 'name', phase: 'design' }).length
    ).toBe(2);
    expect(
      filterSortClients(list, { q: 'AMY@', sort: 'name', phase: '' })[0].name
    ).toBe('Amy');
  });
});

import { describe, expect, it } from 'vitest';
import {
  UNASSIGNED_FILTER,
  daysSince,
  filterBoardClients,
  formatAge,
} from '../board';
import type { Client } from '../schemas/client';

const make = (over: Partial<Client>): Client => ({
  id: 'x',
  name: 'Name',
  current_phase: 'lead',
  contact_info: {},
  assigned_designer_id: null,
  assigned_designer: null,
  notes: null,
  is_active: true,
  is_sample: false,
  created_at: '',
  updated_at: '',
  completed_at: null,
  ...over,
});

const clients = [
  make({
    id: '1',
    name: 'Asha',
    contact_info: { phone: '555' },
    assigned_designer_id: 'd1',
  }),
  make({ id: '2', name: 'Ravi', contact_info: { email: 'r@x.com' } }),
];

describe('filterBoardClients', () => {
  it('matches name and contact info', () => {
    expect(filterBoardClients(clients, 'ash', '').map((c) => c.id)).toEqual([
      '1',
    ]);
    expect(filterBoardClients(clients, 'r@x', '').map((c) => c.id)).toEqual([
      '2',
    ]);
  });
  it('filters by designer and unassigned', () => {
    expect(filterBoardClients(clients, '', 'd1')).toHaveLength(1);
    expect(filterBoardClients(clients, '', UNASSIGNED_FILTER)[0].id).toBe('2');
  });
  it('returns all with empty filters', () => {
    expect(filterBoardClients(clients, '  ', '')).toHaveLength(2);
  });
});

describe('daysSince / formatAge', () => {
  const now = new Date('2026-01-10T00:00:00Z');
  it('counts whole days', () => {
    expect(daysSince('2026-01-05T00:00:00Z', now)).toBe(5);
    expect(daysSince('bad', now)).toBe(0);
    expect(daysSince('2026-02-01T00:00:00Z', now)).toBe(0);
  });
  it('formats', () => {
    expect(formatAge(0)).toBe('Today');
    expect(formatAge(5)).toBe('5d');
  });
});

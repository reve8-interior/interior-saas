import { describe, expect, it } from 'vitest';
import { filterByRoom, roomOptions } from '../portfolioFilter';

const designs = [
  { id: 1, rooms: ['Kitchen', 'Hall'] },
  { id: 2, rooms: ['Hall'] },
  { id: 3, rooms: [] },
];

describe('roomOptions', () => {
  it('lists each room once, alphabetically', () => {
    expect(roomOptions(designs)).toEqual(['Hall', 'Kitchen']);
  });
});

describe('filterByRoom', () => {
  it('keeps designs tagged with the room', () => {
    expect(filterByRoom(designs, 'Hall').map((d) => d.id)).toEqual([1, 2]);
  });

  it('returns everything for no room', () => {
    expect(filterByRoom(designs, '')).toBe(designs);
  });
});

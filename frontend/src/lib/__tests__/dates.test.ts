import { describe, expect, it } from 'vitest';
import { endOfDayIso, timeAgo } from '../dates';

describe('endOfDayIso', () => {
  it('returns null for an empty date', () => {
    expect(endOfDayIso('')).toBeNull();
  });

  it('expires at 23:59:59 local time on the chosen day', () => {
    const d = new Date(endOfDayIso('2030-05-17') as string);
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2030, 4, 17]);
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([
      23, 59, 59,
    ]);
  });

  it('returns null instead of throwing for an unparseable date', () => {
    expect(endOfDayIso('not-a-date')).toBeNull();
  });
});

describe('timeAgo', () => {
  const now = new Date('2030-05-17T12:00:00Z');

  it('describes the recent past in the largest fitting unit', () => {
    expect(timeAgo('2030-05-17T10:00:00Z', now)).toBe('2 hours ago');
    expect(timeAgo('2030-05-14T12:00:00Z', now)).toBe('3 days ago');
  });

  it('describes the near future', () => {
    expect(timeAgo('2030-05-18T12:00:00Z', now)).toBe('tomorrow');
  });

  it('returns an empty string for an unparseable value', () => {
    expect(timeAgo('nope', now)).toBe('');
  });
});

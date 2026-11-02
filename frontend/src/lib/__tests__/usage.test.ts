import { describe, expect, it } from 'vitest';
import {
  meterPercent,
  meterState,
  meterWarnings,
  usageMeters,
} from '@/lib/usage';

const meter = (key: string, used: number, limit: number | null) => ({
  key,
  label: key,
  used,
  limit,
});

describe('meterState', () => {
  it('is unlimited without a limit', () =>
    expect(meterState(500, null)).toBe('unlimited'));
  it('is ok below 80%', () => expect(meterState(7, 10)).toBe('ok'));
  it('is near from 80%', () => expect(meterState(8, 10)).toBe('near'));
  it('is full at or over the limit, and for a zero limit', () => {
    expect(meterState(10, 10)).toBe('full');
    expect(meterState(12, 10)).toBe('full');
    expect(meterState(0, 0)).toBe('full');
  });
});

describe('meterPercent', () => {
  it('rounds, caps at 100 and shows nothing when unlimited', () => {
    expect(meterPercent(1, 3)).toBe(33);
    expect(meterPercent(9, 3)).toBe(100);
    expect(meterPercent(4, null)).toBe(0);
    expect(meterPercent(0, 0)).toBe(100);
  });
});

describe('usageMeters', () => {
  const usage = [meter('clients', 1, 3)];

  it('puts AI credits first when AI is on and capped', () => {
    const result = usageMeters(usage, {
      enabled: true,
      monthly_limit: 10,
      remaining: 4,
    });
    expect(result[0]).toMatchObject({ key: 'ai_credits', used: 6, limit: 10 });
    expect(result).toHaveLength(2);
  });

  it('leaves the list alone when AI is off or uncapped', () => {
    expect(
      usageMeters(usage, {
        enabled: false,
        monthly_limit: null,
        remaining: null,
      })
    ).toEqual(usage);
    expect(
      usageMeters(usage, {
        enabled: true,
        monthly_limit: null,
        remaining: null,
      })
    ).toEqual(usage);
    expect(usageMeters(usage, undefined)).toEqual(usage);
  });
});

describe('meterWarnings', () => {
  it('lists full meters before near ones and skips healthy ones', () => {
    const result = meterWarnings([
      meter('a', 1, 10),
      meter('b', 9, 10),
      meter('c', 10, 10),
      meter('d', 50, null),
    ]);
    expect(result.map((m) => m.key)).toEqual(['c', 'b']);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shareStatus } from '../shareStatus';

describe('shareStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-10T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('is active with no end date', () => {
    expect(shareStatus({ revoked_at: null, expires_at: null })).toBe('active');
  });

  it('is active before expiry and expired from the expiry instant', () => {
    expect(
      shareStatus({ revoked_at: null, expires_at: '2030-01-10T12:00:01Z' })
    ).toBe('active');
    expect(
      shareStatus({ revoked_at: null, expires_at: '2030-01-10T12:00:00Z' })
    ).toBe('expired');
  });

  it('revoked wins over expired', () => {
    expect(
      shareStatus({
        revoked_at: '2030-01-01T00:00:00Z',
        expires_at: '2029-01-01T00:00:00Z',
      })
    ).toBe('revoked');
  });

  it('treats a missing revoked_at as not revoked', () => {
    expect(shareStatus({ expires_at: null })).toBe('active');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROMPT_COOLDOWN_MS,
  PROMPT_DELAY_RANGE_MS,
  isDueForPrompt,
  loadLastShown,
  randomDelay,
  saveLastShown,
} from '../feedback';

describe('isDueForPrompt', () => {
  it('prompts a user who has never been asked', () => {
    expect(isDueForPrompt(null)).toBe(true);
  });

  it('waits out the cooldown', () => {
    const now = 1_000_000_000;
    expect(isDueForPrompt(now - 1000, now)).toBe(false);
    expect(isDueForPrompt(now - PROMPT_COOLDOWN_MS, now)).toBe(true);
  });
});

describe('randomDelay', () => {
  it('stays inside the range', () => {
    const [min, max] = PROMPT_DELAY_RANGE_MS;
    expect(randomDelay(() => 0)).toBe(min);
    expect(randomDelay(() => 1)).toBe(max);
  });
});

describe('last shown storage', () => {
  beforeEach(() => window.localStorage.clear());

  it('round-trips per user', () => {
    saveLastShown('u1', 123);
    expect(loadLastShown('u1')).toBe(123);
    expect(loadLastShown('u2')).toBeNull();
  });

  it('ignores garbage', () => {
    window.localStorage.setItem('feedback-shown:u1', 'abc');
    expect(loadLastShown('u1')).toBeNull();
  });
});

describe('isDueForPrompt boundaries', () => {
  it('is not due one millisecond before the cooldown ends', () => {
    const now = 5_000_000_000;
    expect(isDueForPrompt(now - PROMPT_COOLDOWN_MS + 1, now)).toBe(false);
  });
});

describe('randomDelay midpoint', () => {
  it('scales linearly and returns whole milliseconds', () => {
    const [min, max] = PROMPT_DELAY_RANGE_MS;
    expect(randomDelay(() => 0.5)).toBe(Math.round((min + max) / 2));
    expect(Number.isInteger(randomDelay(() => 0.333))).toBe(true);
  });
});

describe('storage failures', () => {
  afterEach(() => vi.restoreAllMocks());

  it('loadLastShown returns null when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(loadLastShown('u1')).toBeNull();
  });

  it('saveLastShown swallows storage errors', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => saveLastShown('u1', 1)).not.toThrow();
  });

  it('reads an empty stored value as the epoch, so the user is due again', () => {
    window.localStorage.setItem('feedback-shown:u1', '');
    expect(loadLastShown('u1')).toBe(0);
  });
});

import { describe, expect, it } from 'vitest';
import {
  loadWelcomeSeen,
  saveWelcomeSeen,
  shouldShowWelcome,
} from '../welcome';

describe('shouldShowWelcome', () => {
  it('shows on the dashboard for an empty, unseen account', () => {
    expect(shouldShowWelcome('/dashboard', 0, false)).toBe(true);
  });

  it('stays hidden while clients load, once seen, off the dashboard, or with clients', () => {
    expect(shouldShowWelcome('/dashboard', undefined, false)).toBe(false);
    expect(shouldShowWelcome('/dashboard', 0, true)).toBe(false);
    expect(shouldShowWelcome('/dashboard/board', 0, false)).toBe(false);
    expect(shouldShowWelcome('/dashboard', 2, false)).toBe(false);
  });
});

describe('welcome seen flag', () => {
  it('is remembered per user', () => {
    window.localStorage.clear();
    expect(loadWelcomeSeen('u1')).toBe(false);
    saveWelcomeSeen('u1');
    expect(loadWelcomeSeen('u1')).toBe(true);
    expect(loadWelcomeSeen('u2')).toBe(false);
  });
});

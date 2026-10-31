import { beforeEach, describe, expect, it } from 'vitest';
import { loadSidebarCollapsed, saveSidebarCollapsed } from '../sidebarPrefs';

describe('sidebarPrefs', () => {
  beforeEach(() => window.localStorage.clear());

  it('defaults to expanded', () => {
    expect(loadSidebarCollapsed()).toBe(false);
  });
  it('round-trips the collapsed state', () => {
    saveSidebarCollapsed(true);
    expect(loadSidebarCollapsed()).toBe(true);
    saveSidebarCollapsed(false);
    expect(loadSidebarCollapsed()).toBe(false);
  });
});

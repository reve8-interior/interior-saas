import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SITE_THEMES, suggestThemes } from '../siteThemes';

describe('suggestThemes', () => {
  it('returns nothing without categories', () => {
    expect(suggestThemes([])).toEqual([]);
    expect(suggestThemes([null])).toEqual([]);
  });

  it('ranks themes by keyword matches, case-insensitively', () => {
    expect(suggestThemes(['Luxury Hotel', 'Residential'])[0]).toBe(
      'midnight-gold'
    );
    expect(suggestThemes(['RESIDENTIAL'])).toContain('warm-linen');
  });

  it('offers unique preset keys only', () => {
    const keys = SITE_THEMES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('theme registry stays in sync', () => {
  const read = (rel: string) =>
    readFileSync(path.resolve(__dirname, rel), 'utf8');

  it('has a CSS class for every non-default theme', () => {
    const css = read('../../app/globals.css');
    for (const { key } of SITE_THEMES) {
      if (key === 'classic') continue;
      expect(css).toContain(`.site-theme-${key}`);
    }
  });

  it('matches the keys the backend accepts', () => {
    const py = read('../../../../backend/schemas/site.py');
    const block = py.match(/SiteTheme = Literal\[([\s\S]*?)\]/)?.[1] ?? '';
    const backend = [...block.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
    expect(backend.sort()).toEqual(SITE_THEMES.map((t) => t.key).sort());
  });
});

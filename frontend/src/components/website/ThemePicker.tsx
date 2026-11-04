'use client';

import type { SiteTheme } from '@/lib/schemas/site';
import { SITE_THEMES } from '@/lib/siteThemes';

interface ThemePickerProps {
  value: SiteTheme;
  suggested: SiteTheme[];
  saving: boolean;
  onSelect: (theme: SiteTheme) => void;
}

const SWATCHES = ['bg-brand', 'bg-brand-2', 'bg-text', 'bg-surface-2'];

/** Preset colour + font combinations. Each card is rendered in its own theme, so it previews the real tokens. */
export function ThemePicker({
  value,
  suggested,
  saving,
  onSelect,
}: ThemePickerProps) {
  return (
    <fieldset className="space-y-3">
      <legend className="sr-only">Colours and fonts</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {SITE_THEMES.map((theme) => {
          const selected = theme.key === value;
          return (
            <button
              key={theme.key}
              type="button"
              aria-pressed={selected}
              disabled={saving}
              onClick={() => onSelect(theme.key)}
              className={`site-light site-theme-${theme.key} rounded-lg border p-4 text-left transition disabled:opacity-60 ${
                selected
                  ? 'border-brand ring-2 ring-brand'
                  : 'border-line-strong hover:border-brand'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-display text-2xl font-light text-text">
                  {theme.name}
                </span>
                {suggested.includes(theme.key) && (
                  <span className="rounded-full bg-brand px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide text-canvas">
                    Suggested
                  </span>
                )}
              </span>
              <span className="mt-1 block text-sm text-muted">
                {theme.blurb}
              </span>
              <span className="mt-3 flex items-center gap-1.5">
                {SWATCHES.map((cls) => (
                  <span
                    key={cls}
                    aria-hidden
                    className={`h-5 w-5 rounded-full border border-line-strong ${cls}`}
                  />
                ))}
                <span className="ml-2 text-xs text-faint">{theme.fonts}</span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

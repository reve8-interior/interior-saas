import type { SiteTheme } from '@/lib/schemas/site';

export interface SiteThemePreset {
  key: SiteTheme;
  name: string;
  /** One line on the mood, shown on the picker card. */
  blurb: string;
  /** Heading + body typefaces, shown on the picker card. */
  fonts: string;
  /** Lower-case words matched against project categories to suggest this theme. */
  keywords: string[];
}

/** Keep in sync with `.site-theme-*` in globals.css and `SiteTheme` in backend/schemas/site.py. */
export const SITE_THEMES: SiteThemePreset[] = [
  {
    key: 'classic',
    name: 'Classic',
    blurb: 'Crisp blue on soft white. Clean and professional.',
    fonts: 'Fraunces + Inter',
    keywords: ['office', 'commercial', 'workplace', 'corporate'],
  },
  {
    key: 'warm-linen',
    name: 'Warm Linen',
    blurb: 'Terracotta and cream. Lived-in and welcoming.',
    fonts: 'Fraunces + Inter',
    keywords: ['residential', 'home', 'villa', 'apartment', 'family'],
  },
  {
    key: 'sage-stone',
    name: 'Sage & Stone',
    blurb: 'Muted green and warm grey. Calm and natural.',
    fonts: 'Cormorant + Inter',
    keywords: ['wellness', 'spa', 'garden', 'sustainable', 'eco', 'retreat'],
  },
  {
    key: 'midnight-gold',
    name: 'Midnight Gold',
    blurb: 'Deep navy with brass accents. Dark and dramatic.',
    fonts: 'Playfair Display + Inter',
    keywords: [
      'luxury',
      'hospitality',
      'hotel',
      'restaurant',
      'penthouse',
      'bar',
    ],
  },
  {
    key: 'mono-editorial',
    name: 'Mono Editorial',
    blurb: 'Black and white with one red accent. Bold and modern.',
    fonts: 'Space Grotesk',
    keywords: ['retail', 'showroom', 'studio', 'gallery', 'minimal', 'modern'],
  },
  {
    key: 'blush-modern',
    name: 'Blush Modern',
    blurb: 'Soft rose and charcoal. Gentle and contemporary.',
    fonts: 'DM Serif Display + DM Sans',
    keywords: ['boutique', 'salon', 'nursery', 'kids', 'bedroom', 'cafe'],
  },
];

/** Themes whose keywords appear in any project category, best match first. */
export function suggestThemes(categories: (string | null)[]): SiteTheme[] {
  const text = categories
    .filter((c): c is string => !!c)
    .join(' ')
    .toLowerCase();
  if (!text) return [];
  return SITE_THEMES.map((t) => ({
    key: t.key,
    score: t.keywords.filter((k) => text.includes(k)).length,
  }))
    .filter((t) => t.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((t) => t.key);
}

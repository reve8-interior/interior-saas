import type {
  PublicProject,
  PublicProjectDesign,
  SiteSocial,
} from '@/lib/schemas/site';

/** In-page anchors of the website; each section renders with the matching id. */
export const SECTION_IDS = {
  projects: 'projects',
  services: 'services',
  studio: 'studio',
  contact: 'contact',
} as const;

export type SectionId = (typeof SECTION_IDS)[keyof typeof SECTION_IDS];

export interface NavLink {
  id: SectionId;
  label: string;
}

/** True when a free-text field has something to show. */
export function hasText(value: string | null | undefined): value is string {
  return !!value && value.trim().length > 0;
}

/** Only http(s) links are rendered; anything else (javascript:, mailto: typos, junk) is dropped. */
export function isSafeHttpUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export function safeSocials(socials: SiteSocial[]): SiteSocial[] {
  return socials.filter((s) => hasText(s.label) && isSafeHttpUrl(s.url));
}

/** A tel: href keeps only digits and a leading plus. */
export function telHref(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/[^\d]/g, '');
  return `tel:${trimmed.startsWith('+') ? '+' : ''}${digits}`;
}

/** Unique room names across a project's designs, in first-seen order. */
export function projectRooms(project: PublicProject): string[] {
  const seen = new Set<string>();
  for (const d of project.designs) {
    for (const r of d.rooms) {
      if (hasText(r)) seen.add(r.trim());
    }
  }
  return Array.from(seen);
}

/** Best image for a design in the full-screen view (full size first). */
export function designFullSrc(d: PublicProjectDesign): string | null {
  return d.image_url ?? d.thumb_url;
}

/** Best image for a project card: the cover, else the first design with an image. */
export function projectCoverSrc(project: PublicProject): string | null {
  if (project.cover_url) return project.cover_url;
  for (const d of project.designs) {
    const src = d.thumb_url ?? d.image_url;
    if (src) return src;
  }
  return null;
}

/** "Bandra, Mumbai · 2024": whichever of location and year exist. */
export function projectMeta(project: PublicProject): string {
  return [project.location, project.year ? String(project.year) : null]
    .filter((v): v is string => hasText(v))
    .join(' · ');
}

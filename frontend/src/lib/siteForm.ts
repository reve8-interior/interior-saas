import type { SiteSettingsInput } from '@/lib/schemas/site';

export const TAGLINE_MAX = 120;
export const ABOUT_MAX = 4000;
export const SERVICES_MAX = 8;
export const SOCIALS_MAX = 6;

/** Validate the site profile before sending; returns a message or null. */
export function validateSiteInput(input: SiteSettingsInput): string | null {
  if ((input.tagline ?? '').length > TAGLINE_MAX)
    return `Tagline can be at most ${TAGLINE_MAX} characters`;
  if ((input.about ?? '').length > ABOUT_MAX)
    return `About can be at most ${ABOUT_MAX} characters`;
  const services = input.services ?? [];
  if (services.length > SERVICES_MAX)
    return `Add at most ${SERVICES_MAX} services`;
  if (services.some((s) => !s.title.trim()))
    return 'Every service needs a title';
  const socials = input.socials ?? [];
  if (socials.length > SOCIALS_MAX) return `Add at most ${SOCIALS_MAX} links`;
  for (const s of socials) {
    if (!s.label.trim()) return 'Every link needs a label';
    if (!/^https?:\/\/\S+$/i.test(s.url.trim()))
      return `"${s.label}" must be an http(s) link`;
  }
  const email = (input.email ?? '').trim();
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return 'Enter a valid email address';
  return null;
}

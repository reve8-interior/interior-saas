/** The public address of a designer's site, built from the current origin. */
export function publicSiteUrl(slug: string): string {
  return `${window.location.origin}/${slug}`;
}

/** Path of the public site, for same-origin links. */
export function publicSitePath(slug: string): string {
  return `/${slug}`;
}

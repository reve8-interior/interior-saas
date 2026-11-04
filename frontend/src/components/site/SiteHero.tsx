import { ArrowDown } from 'lucide-react';
import type { PublicProject } from '@/lib/schemas/site';
import { SiteImage } from './SiteImage';
import { SECTION_IDS, hasText } from './siteUtils';

interface SiteHeroProps {
  businessName: string;
  tagline: string | null;
  heroUrl: string | null;
  logoUrl: string | null;
  projects: PublicProject[];
}

interface Stat {
  value: string;
  label: string;
}

/** Facts the data can actually back: project count, distinct places, first year on record. */
function heroStats(projects: PublicProject[]): Stat[] {
  const stats: Stat[] = [];
  if (projects.length > 0) {
    stats.push({
      value: String(projects.length),
      label: projects.length === 1 ? 'Project' : 'Projects',
    });
  }
  const places = new Set(
    projects
      .map((p) => p.location?.trim().toLowerCase())
      .filter((v): v is string => !!v)
  );
  if (places.size > 1) {
    stats.push({ value: String(places.size), label: 'Locations' });
  }
  const years = projects
    .map((p) => p.year)
    .filter((y): y is number => typeof y === 'number');
  if (years.length > 0) {
    stats.push({ value: String(Math.min(...years)), label: 'Since' });
  }
  return stats;
}

/** Full-bleed opening frame: the hero photo (or a Reve8 navy gradient), the tagline, and the way in. */
export function SiteHero({
  businessName,
  tagline,
  heroUrl,
  logoUrl,
  projects,
}: SiteHeroProps) {
  const stats = heroStats(projects);
  const hasProjects = projects.length > 0;

  return (
    <section
      aria-label="Introduction"
      className="relative isolate flex min-h-[78svh] items-end overflow-hidden bg-[rgb(var(--deep))] text-white sm:min-h-[86svh]"
    >
      {heroUrl ? (
        <SiteImage
          src={heroUrl}
          alt=""
          eager
          className="!absolute inset-0 -z-10"
          imgClassName="motion-safe:animate-[siteHeroZoom_18s_ease-out_both]"
        />
      ) : (
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(120%_90%_at_85%_10%,rgb(var(--brand-2)/0.45),transparent_55%),radial-gradient(90%_80%_at_0%_100%,rgb(var(--brand-1)/0.55),transparent_60%),linear-gradient(160deg,rgb(var(--deep-hi)),rgb(var(--deep))_65%)]"
        />
      )}
      {/* Legibility scrim: darkest at the bottom where the copy sits. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-t from-[rgb(var(--deep-2)/0.9)] via-[rgb(var(--deep-2)/0.35)] to-[rgb(var(--deep-2)/0.1)]"
      />

      <div className="mx-auto w-full max-w-7xl px-4 pb-12 pt-28 motion-safe:animate-slide-up sm:px-8 sm:pb-16">
        <p className="flex items-center gap-3 text-[0.7rem] font-medium uppercase tracking-[0.28em] text-white/75">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={`${businessName} logo`}
              width={28}
              height={28}
              className="h-7 w-7 rounded-full bg-white/90 object-contain p-0.5"
            />
          )}
          {businessName}
        </p>
        <h1 className="mt-5 max-w-4xl font-display text-[2.6rem] font-light leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
          {hasText(tagline) ? tagline : businessName}
        </h1>

        <div className="mt-8 flex flex-col gap-8 sm:mt-10 lg:flex-row lg:items-end lg:justify-between">
          {stats.length > 0 && (
            <dl className="grid w-fit grid-flow-col divide-x divide-white/20 rounded-md border border-white/20 bg-white/5 backdrop-blur-sm">
              {stats.map((s) => (
                <div
                  key={s.label}
                  className="flex flex-col-reverse px-4 py-3 sm:px-6"
                >
                  <dt className="text-[0.65rem] uppercase tracking-[0.2em] text-white/65">
                    {s.label}
                  </dt>
                  <dd className="font-display text-2xl sm:text-3xl">
                    {s.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          <div className="flex flex-wrap gap-3">
            <a
              href={`#${SECTION_IDS.contact}`}
              className="inline-flex items-center rounded-full bg-white px-6 py-3 text-sm font-medium text-[rgb(var(--deep))] transition-colors hover:bg-secondary-100"
            >
              Start a project
            </a>
            {hasProjects && (
              <a
                href={`#${SECTION_IDS.projects}`}
                className="inline-flex items-center gap-2 rounded-full border border-white/40 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10"
              >
                See the work
                <ArrowDown aria-hidden className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

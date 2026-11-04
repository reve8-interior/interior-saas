import type { SiteService } from '@/lib/schemas/site';
import { SECTION_IDS, hasText } from './siteUtils';

/** Numbered list of what the studio offers, beside a sticky heading on wide screens. */
export function ServicesSection({ services }: { services: SiteService[] }) {
  return (
    <section
      id={SECTION_IDS.services}
      aria-labelledby="site-services-title"
      className="scroll-mt-24 border-y border-line bg-surface"
    >
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-8 sm:py-28 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className="text-[0.7rem] font-medium uppercase tracking-[0.28em] text-accent-text">
            Services
          </p>
          <h2
            id="site-services-title"
            className="mt-3 font-display text-4xl font-light tracking-tight sm:text-5xl"
          >
            What we do
          </h2>
        </div>

        <ol className="divide-y divide-line border-t border-line">
          {services.map((s, i) => (
            <li
              key={`${s.title}-${i}`}
              className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 py-7 sm:grid-cols-[4rem_minmax(0,1fr)]"
            >
              <span className="pt-1.5 font-display text-sm italic tabular-nums text-faint">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="font-display text-2xl font-light tracking-tight text-text">
                  {s.title}
                </h3>
                {hasText(s.description) && (
                  <p className="mt-2 max-w-xl whitespace-pre-line text-[0.95rem] leading-relaxed text-muted">
                    {s.description}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

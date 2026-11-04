import { ArrowUpRight } from 'lucide-react';
import { SECTION_IDS, type NavLink } from './siteUtils';

interface SiteNavProps {
  businessName: string;
  logoUrl: string | null;
  links: NavLink[];
}

/** Sticky glass header: firm mark on the left, in-page anchors, and a contact call to action. */
export function SiteNav({ businessName, logoUrl, links }: SiteNavProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md supports-[backdrop-filter]:bg-canvas/70">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-8">
        <a
          href="#top"
          className="flex min-w-0 flex-1 items-center gap-3 md:flex-none"
        >
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 shrink-0 rounded-full object-contain"
            />
          )}
          <span className="truncate font-display text-lg tracking-tight text-text sm:text-xl">
            {businessName}
          </span>
        </a>

        <nav
          aria-label="Sections"
          className="order-last -mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 md:order-none md:mx-0 md:ml-auto md:w-auto md:px-0"
        >
          <ul className="flex gap-6 whitespace-nowrap text-[0.7rem] font-medium uppercase tracking-[0.18em] text-muted">
            {links.map((l) => (
              <li key={l.id}>
                <a
                  href={`#${l.id}`}
                  className="inline-block py-1 transition-colors hover:text-text"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <a
          href={`#${SECTION_IDS.contact}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-text px-4 py-2 text-xs font-medium text-canvas transition-colors hover:bg-brand"
        >
          Get in touch
          <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
        </a>
      </div>
    </header>
  );
}

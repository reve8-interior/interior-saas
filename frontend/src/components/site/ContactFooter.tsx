import { ArrowUpRight, Mail, MapPin, Phone } from 'lucide-react';
import { MARKETING_URL } from '@/lib/constants';
import type { SiteContact, SiteSocial } from '@/lib/schemas/site';
import { SECTION_IDS, hasText, safeSocials, telHref } from './siteUtils';

interface ContactFooterProps {
  businessName: string;
  logoUrl: string | null;
  contact: SiteContact;
  socials: SiteSocial[];
  showBadge: boolean;
}

const LABEL =
  'text-[0.65rem] font-medium uppercase tracking-[0.22em] text-white/50';

/** Navy closing band: the enquiry email large, then phone, address and socials, then the © line. */
export function ContactFooter({
  businessName,
  logoUrl,
  contact,
  socials,
  showBadge,
}: ContactFooterProps) {
  const links = safeSocials(socials);
  const email = hasText(contact.email) ? contact.email.trim() : null;
  const phone = hasText(contact.phone) ? contact.phone.trim() : null;
  const address = hasText(contact.address) ? contact.address.trim() : null;
  const year = new Date().getFullYear();

  return (
    <footer
      id={SECTION_IDS.contact}
      aria-labelledby="site-contact-title"
      className="scroll-mt-24 bg-[rgb(var(--deep))] text-white"
    >
      <div className="mx-auto max-w-7xl px-4 pb-10 pt-20 sm:px-8 sm:pt-28">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-20">
          <div>
            <p className="text-[0.7rem] font-medium uppercase tracking-[0.28em] text-secondary-300">
              Contact
            </p>
            <h2
              id="site-contact-title"
              className="mt-4 max-w-xl font-display text-4xl font-light leading-tight tracking-tight sm:text-5xl"
            >
              Let&rsquo;s talk about your space.
            </h2>
            {email ? (
              <a
                href={`mailto:${email}`}
                className="group mt-8 inline-flex max-w-full items-center gap-2 break-all border-b border-white/30 pb-1 font-display text-2xl font-light transition-colors hover:border-white sm:text-3xl"
              >
                {email}
                <ArrowUpRight
                  aria-hidden
                  className="h-5 w-5 shrink-0 transition-transform motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5"
                />
              </a>
            ) : (
              !phone &&
              !address && (
                <p className="mt-6 text-white/60">
                  Contact details will be added soon.
                </p>
              )
            )}
          </div>

          <div className="grid gap-10 sm:grid-cols-2">
            {(phone || address || email) && (
              <div>
                <p className={LABEL}>Studio</p>
                <ul className="mt-4 space-y-3 text-sm text-white/80">
                  {address && (
                    <li className="flex gap-3">
                      <MapPin
                        aria-hidden
                        className="mt-0.5 h-4 w-4 shrink-0 text-white/45"
                      />
                      <address className="whitespace-pre-line not-italic">
                        {address}
                      </address>
                    </li>
                  )}
                  {phone && (
                    <li className="flex gap-3">
                      <Phone
                        aria-hidden
                        className="mt-0.5 h-4 w-4 shrink-0 text-white/45"
                      />
                      <a href={telHref(phone)} className="hover:text-white">
                        {phone}
                      </a>
                    </li>
                  )}
                  {email && (
                    <li className="flex gap-3">
                      <Mail
                        aria-hidden
                        className="mt-0.5 h-4 w-4 shrink-0 text-white/45"
                      />
                      <a
                        href={`mailto:${email}`}
                        className="break-all hover:text-white"
                      >
                        {email}
                      </a>
                    </li>
                  )}
                </ul>
              </div>
            )}
            {links.length > 0 && (
              <div>
                <p className={LABEL}>Elsewhere</p>
                <ul className="mt-4 space-y-3 text-sm text-white/80">
                  {links.map((s) => (
                    <li key={`${s.label}-${s.url}`}>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 hover:text-white"
                      >
                        {s.label}
                        <ArrowUpRight
                          aria-hidden
                          className="h-3.5 w-3.5 text-white/45"
                        />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="mt-20 flex flex-col gap-4 border-t border-white/10 pt-6 text-xs text-white/55 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-3">
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt=""
                width={24}
                height={24}
                loading="lazy"
                className="h-6 w-6 rounded-full bg-white/90 object-contain p-0.5"
              />
            )}
            <span>
              &copy; {year} {businessName}
            </span>
          </p>
          {showBadge && (
            <a
              href={MARKETING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/15 px-3 py-1 transition-colors hover:border-white/40 hover:text-white"
            >
              Powered by Reve8
            </a>
          )}
        </div>
      </div>
    </footer>
  );
}

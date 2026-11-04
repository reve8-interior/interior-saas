'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FullSiteView } from '@/lib/schemas/site';
import { ContactFooter } from './ContactFooter';
import { ProjectGrid } from './ProjectGrid';
import { ProjectOverlay } from './ProjectOverlay';
import { ServicesSection } from './ServicesSection';
import { SiteHero } from './SiteHero';
import { SiteNav } from './SiteNav';
import { StudioSection } from './StudioSection';
import { SECTION_IDS, hasText, type NavLink } from './siteUtils';

/**
 * The designer's public single-page website. Sections without content are left out, and so are their nav
 * links; Contact always shows. Renders on a fixed light editorial surface (`.site-light`) whatever the app theme.
 */
export function SiteTemplate({ view }: { view: FullSiteView }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const closeOverlay = useCallback(() => setOpenId(null), []);

  useEffect(() => {
    const previous = document.title;
    document.title = view.business_name;
    return () => {
      document.title = previous;
    };
  }, [view.business_name]);

  const services = view.services.filter((s) => hasText(s.title));
  const hasProjects = view.projects.length > 0;
  const hasServices = services.length > 0;
  const about = hasText(view.about) ? view.about : null;

  const links: NavLink[] = [
    ...(hasProjects ? [{ id: SECTION_IDS.projects, label: 'Projects' }] : []),
    ...(hasServices ? [{ id: SECTION_IDS.services, label: 'Services' }] : []),
    ...(about ? [{ id: SECTION_IDS.studio, label: 'Studio' }] : []),
    { id: SECTION_IDS.contact, label: 'Contact' },
  ];

  const open = view.projects.find((p) => p.id === openId) ?? null;

  return (
    <div
      id="top"
      className={`site-light site-theme-${view.theme} min-h-screen text-base`}
    >
      <SiteNav
        businessName={view.business_name}
        logoUrl={view.logo_url}
        links={links}
      />
      <main>
        <SiteHero
          businessName={view.business_name}
          tagline={view.tagline}
          heroUrl={view.hero_url}
          logoUrl={view.logo_url}
          projects={view.projects}
        />
        {hasProjects && (
          <ProjectGrid projects={view.projects} onOpen={setOpenId} />
        )}
        {hasServices && <ServicesSection services={services} />}
        {about && (
          <StudioSection
            businessName={view.business_name}
            about={about}
            imageUrl={view.hero_url}
          />
        )}
      </main>
      <ContactFooter
        businessName={view.business_name}
        logoUrl={view.logo_url}
        contact={view.contact}
        socials={view.socials}
        showBadge={view.show_badge}
      />
      {open && <ProjectOverlay project={open} onClose={closeOverlay} />}
    </div>
  );
}

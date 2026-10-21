'use client';

import { useEffect, useRef, useState } from 'react';

export interface GuideSection {
  id: string;
  label: string;
}

/**
 * Sticky "jump to" chips. On a long guide this lets a phone user get to the
 * topic they need in one tap, and highlights the section currently on screen.
 */
export function GuideNav({ sections }: { sections: GuideSection[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? '');
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-120px 0px -65% 0px' }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  // Keep the active chip in view inside the strip (no page scroll).
  useEffect(() => {
    const strip = stripRef.current;
    const chip = strip?.querySelector<HTMLElement>(`[data-id="${active}"]`);
    if (strip && chip) {
      strip.scrollTo({
        left: chip.offsetLeft - strip.clientWidth / 2 + chip.clientWidth / 2,
        behavior: 'smooth',
      });
    }
  }, [active]);

  return (
    <nav
      aria-label="Guide sections"
      className="sticky top-[calc(max(0.75rem,env(safe-area-inset-top))+4rem)] z-20 -mx-4 mb-6 px-4 py-2 sm:-mx-6 sm:px-6 lg:top-16 lg:mx-0 lg:px-0"
    >
      <div
        ref={stripRef}
        className="snap-strip ios-pill !gap-1 rounded-full p-1"
      >
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            data-id={s.id}
            aria-current={active === s.id ? 'true' : undefined}
            className={`flex h-10 items-center whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors ${
              active === s.id
                ? 'bg-gradient-to-r from-primary-600 to-secondary-600 text-white shadow-brand'
                : 'text-dark-700 hover:bg-white/70 dark:text-dark-200 dark:hover:bg-white/10'
            }`}
          >
            {s.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

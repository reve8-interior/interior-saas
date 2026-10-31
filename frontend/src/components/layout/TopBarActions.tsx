'use client';

import { ReactNode, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Layout effects warn during SSR; fall back to a normal effect there.
const useIsoLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Renders page actions into every top-bar slot in the layout: the desktop
 * header and the mobile page header each own one, and CSS shows only one.
 * Slots are resolved before paint so actions do not pop in after the page.
 */
export function TopBarActions({ children }: { children: ReactNode }) {
  const [slots, setSlots] = useState<Element[]>([]);

  useIsoLayoutEffect(() => {
    setSlots(Array.from(document.querySelectorAll('[data-top-bar-slot]')));
  }, []);

  return <>{slots.map((slot, i) => createPortal(children, slot, String(i)))}</>;
}

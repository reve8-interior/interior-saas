'use client';

import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Renders page actions into every top-bar slot in the layout: the desktop
 * header and the mobile page header each own one, and CSS shows only one.
 */
export function TopBarActions({ children }: { children: ReactNode }) {
  const [slots, setSlots] = useState<Element[]>([]);

  useEffect(() => {
    setSlots(Array.from(document.querySelectorAll('[data-top-bar-slot]')));
  }, []);

  return <>{slots.map((slot, i) => createPortal(children, slot, String(i)))}</>;
}

import { useEffect, useRef } from 'react';

const ACTIVE =
  '[aria-current="page"],[aria-selected="true"],[aria-pressed="true"]';

/**
 * For a horizontally scrolling tab strip: centres the active tab on every change and marks which edges still have
 * hidden tabs (`data-more-start` / `data-more-end`), which `.scroll-tabs` in globals.css turns into edge fades.
 * `activeKey` is any value that changes when the active tab does.
 */
export function useScrollTabs<T extends HTMLElement>(activeKey: string) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.toggleAttribute('data-more-start', el.scrollLeft > 4);
      el.toggleAttribute('data-more-end', el.scrollLeft < max - 4);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    const el = ref.current;
    const active = el?.querySelector<HTMLElement>(ACTIVE);
    if (!el || !active || el.scrollWidth <= el.clientWidth) return;
    // Scroll only the strip: scrollIntoView would also move the page vertically.
    const target =
      active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2;
    el.scrollTo({ left: target, behavior: 'smooth' });
  }, [activeKey]);

  return ref;
}

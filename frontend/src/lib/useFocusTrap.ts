import { RefObject, useEffect } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Keeps Tab inside `ref` while `active`, moves focus in on open and restores it
 * to the previously focused element on close.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active = true
) {
  useEffect(() => {
    const root = ref.current;
    if (!active || !root) return;
    const previous = document.activeElement as HTMLElement | null;

    const items = () =>
      Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      );

    if (!root.contains(document.activeElement)) {
      (items()[0] ?? root).focus({ preventScroll: true });
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const list = items();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === first || !root.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !root.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.({ preventScroll: true });
    };
  }, [ref, active]);
}

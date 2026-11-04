import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Steps through `phases` states on a timer, then loops. Holds still while off-screen and for reduced-motion
 * users, who (like the server render) see the finished state.
 */
export function useLoop(
  phases: number,
  ms: number
): { ref: RefObject<HTMLDivElement>; phase: number } {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState(phases - 1);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting)
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || reduced) return;
    const t = setTimeout(() => setPhase((p) => (p + 1) % phases), ms);
    return () => clearTimeout(t);
  }, [phase, visible, reduced, phases, ms]);

  return { ref, phase };
}

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useScrollTabs } from '../useScrollTabs';

let observers: Array<{ cb: () => void; disconnect: ReturnType<typeof vi.fn> }>;

beforeEach(() => {
  observers = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      disconnect = vi.fn();
      constructor(cb: () => void) {
        observers.push({ cb, disconnect: this.disconnect });
      }
      observe() {}
    }
  );
});

function Strip({ active }: { active: string }) {
  const ref = useScrollTabs<HTMLDivElement>(active);
  return (
    <div ref={ref} data-testid="strip">
      <a aria-current={active === 'a' ? 'page' : undefined}>A</a>
      <a aria-current={active === 'b' ? 'page' : undefined}>B</a>
    </div>
  );
}

function sizeStrip(el: HTMLElement, scrollWidth: number, clientWidth: number) {
  Object.defineProperty(el, 'scrollWidth', {
    value: scrollWidth,
    configurable: true,
  });
  Object.defineProperty(el, 'clientWidth', {
    value: clientWidth,
    configurable: true,
  });
}

describe('useScrollTabs', () => {
  it('marks hidden tabs at the end when the strip overflows', () => {
    const { getByTestId } = render(<Strip active="a" />);
    const strip = getByTestId('strip');
    sizeStrip(strip, 500, 200);
    observers[0].cb();
    expect(strip).toHaveAttribute('data-more-end');
    expect(strip).not.toHaveAttribute('data-more-start');
  });

  it('marks both edges when scrolled into the middle', () => {
    const { getByTestId } = render(<Strip active="a" />);
    const strip = getByTestId('strip');
    sizeStrip(strip, 500, 200);
    strip.scrollLeft = 100;
    strip.dispatchEvent(new Event('scroll'));
    expect(strip).toHaveAttribute('data-more-start');
    expect(strip).toHaveAttribute('data-more-end');
  });

  it('clears the end marker once scrolled to the end', () => {
    const { getByTestId } = render(<Strip active="a" />);
    const strip = getByTestId('strip');
    sizeStrip(strip, 500, 200);
    strip.scrollLeft = 300;
    strip.dispatchEvent(new Event('scroll'));
    expect(strip).not.toHaveAttribute('data-more-end');
    expect(strip).toHaveAttribute('data-more-start');
  });

  it('marks nothing when every tab fits', () => {
    const { getByTestId } = render(<Strip active="a" />);
    const strip = getByTestId('strip');
    sizeStrip(strip, 200, 200);
    observers[0].cb();
    expect(strip).not.toHaveAttribute('data-more-start');
    expect(strip).not.toHaveAttribute('data-more-end');
  });

  it('centres the active tab inside the strip when the active key changes', () => {
    const { getByTestId, rerender } = render(<Strip active="a" />);
    const strip = getByTestId('strip');
    const scrollTo = vi.fn();
    strip.scrollTo = scrollTo as unknown as typeof strip.scrollTo;
    sizeStrip(strip, 500, 200);
    const [, b] = Array.from(strip.querySelectorAll<HTMLElement>('a'));
    Object.defineProperty(b, 'offsetLeft', { value: 400 });
    Object.defineProperty(b, 'offsetWidth', { value: 100 });
    rerender(<Strip active="b" />);
    expect(scrollTo).toHaveBeenCalledWith({ left: 350, behavior: 'smooth' });
  });

  it('does not scroll when nothing overflows', () => {
    const { getByTestId, rerender } = render(<Strip active="a" />);
    const strip = getByTestId('strip');
    const scrollTo = vi.fn();
    strip.scrollTo = scrollTo as unknown as typeof strip.scrollTo;
    sizeStrip(strip, 200, 200);
    rerender(<Strip active="b" />);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('disconnects the observer on unmount', () => {
    const { unmount } = render(<Strip active="a" />);
    unmount();
    expect(observers[0].disconnect).toHaveBeenCalled();
  });
});

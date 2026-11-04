import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PublicProject } from '@/lib/schemas/site';
import { ProjectOverlay } from '../ProjectOverlay';

const PROJECT: PublicProject = {
  id: 'p',
  title: 'Bandra Residence',
  location: null,
  year: null,
  category: null,
  story: null,
  cover_url: null,
  designs: [0, 1, 2].map((i) => ({
    id: `d${i}`,
    title: `Room ${i}`,
    description: null,
    image_url: `https://img/${i}.jpg`,
    thumb_url: `https://img/${i}-t.jpg`,
    rooms: [],
  })),
};

/**
 * jsdom has no layout, so offsetParent is always null and useFocusTrap would see nothing. Emulate a
 * browser on a phone: null for `position: fixed` elements (Tailwind `fixed`) and for anything inside a
 * `display: none` element (Tailwind `hidden` below sm, e.g. prev/next), the body otherwise.
 */
const original = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'offsetParent'
);

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get(this: HTMLElement) {
      if (this.classList.contains('fixed')) return null;
      if (this.closest('.hidden')) return null;
      return document.body;
    },
  });
});

afterEach(() => {
  if (original)
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', original);
});

describe('ProjectOverlay focus trap', () => {
  it('focuses Close first and cycles Tab through Close and the thumbnails', () => {
    render(<ProjectOverlay project={PROJECT} onClose={() => {}} />);
    const close = screen.getByRole('button', { name: 'Close project' });
    const lastThumb = screen.getByRole('button', { name: 'Show image 3' });

    expect(document.activeElement).toBe(close);

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(lastThumb);

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
  });
});

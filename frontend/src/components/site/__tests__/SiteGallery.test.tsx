import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { GalleryView } from '@/lib/schemas/site';
import { SiteGallery } from '../SiteGallery';

const design = (id: string) => ({
  id,
  title: `Design ${id}`,
  description: null,
  image_url: `https://img/${id}.jpg`,
  thumb_url: `https://img/${id}-t.jpg`,
});

const VIEW: GalleryView = {
  mode: 'gallery',
  business_name: 'Studio Asha',
  designs: [design('a'), design('b'), design('c')],
};

const fullImage = () =>
  screen
    .queryAllByRole('img')
    .find((i) => i.getAttribute('src') === 'https://img/a.jpg');

describe('SiteGallery', () => {
  it('renders one image per design and the badge', () => {
    render(<SiteGallery view={VIEW} />);
    expect(screen.getAllByRole('img')).toHaveLength(3);
    expect(screen.getByText('Studio Asha')).toBeInTheDocument();
    expect(screen.getByText('Powered by Reve8')).toBeInTheDocument();
  });

  it('opens the lightbox on click and closes on Escape', () => {
    render(<SiteGallery view={VIEW} />);
    expect(fullImage()).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Open Design a' }));
    expect(fullImage()).toBeDefined();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(fullImage()).toBeUndefined();
  });

  it('shows an empty state without designs', () => {
    render(<SiteGallery view={{ ...VIEW, designs: [] }} />);
    expect(screen.getByText(/No designs have been added/)).toBeInTheDocument();
  });
});

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { FullSiteView, PublicProject } from '@/lib/schemas/site';
import { SiteTemplate } from '../SiteTemplate';

const project = (id: string, designCount: number): PublicProject => ({
  id,
  title: `Project ${id}`,
  location: 'Bandra, Mumbai',
  year: 2024,
  category: 'Residential',
  story: 'A calm family home.',
  cover_url: designCount ? `https://img/${id}-cover.jpg` : null,
  designs: Array.from({ length: designCount }, (_, i) => ({
    id: `${id}-d${i}`,
    title: `Room ${i}`,
    description: null,
    image_url: `https://img/${id}-${i}.jpg`,
    thumb_url: `https://img/${id}-${i}-t.jpg`,
    rooms: [i % 2 ? 'Kitchen' : 'Living room'],
  })),
});

const VIEW: FullSiteView = {
  mode: 'site',
  business_name: 'Studio Asha',
  slug: 'studio-asha',
  logo_url: null,
  hero_url: null,
  tagline: 'Quiet rooms, considered.',
  about: 'We design calm homes. Every project starts with listening.',
  services: [{ title: 'Full home design', description: 'End to end.' }],
  socials: [
    { label: 'Instagram', url: 'https://instagram.com/asha' },
    { label: 'Evil', url: 'javascript:alert(1)' },
    { label: 'Ftp', url: 'ftp://files.example.com' },
  ],
  contact: { email: 'hi@asha.in', phone: '+91 98200 12345', address: 'Mumbai' },
  show_badge: true,
  theme: 'classic',
  projects: [project('a', 3), project('b', 0)],
};

const nav = () => screen.getByRole('navigation', { name: 'Sections' });
const navLink = (name: string) => within(nav()).queryByRole('link', { name });

describe('SiteTemplate', () => {
  it('shows a nav link for each section with content', () => {
    render(<SiteTemplate view={VIEW} />);
    for (const name of ['Projects', 'Services', 'Studio', 'Contact']) {
      expect(navLink(name)).toBeInTheDocument();
    }
  });

  it('hides empty sections and their links', () => {
    render(
      <SiteTemplate
        view={{ ...VIEW, services: [], projects: [], about: '  ' }}
      />
    );
    expect(navLink('Services')).toBeNull();
    expect(navLink('Projects')).toBeNull();
    expect(navLink('Studio')).toBeNull();
    expect(navLink('Contact')).toBeInTheDocument();
    expect(document.getElementById('services')).toBeNull();
    expect(document.getElementById('projects')).toBeNull();
    expect(document.getElementById('contact')).toBeInTheDocument();
  });

  it('opens the project overlay on card click and closes on Escape', () => {
    render(<SiteTemplate view={VIEW} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'View Project a' }));
    const dialog = screen.getByRole('dialog', { name: 'Project a' });
    expect(within(dialog).getByText('1 / 3')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(within(dialog).getByText('2 / 3')).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('renders a project without designs as a plain card', () => {
    render(<SiteTemplate view={{ ...VIEW, projects: [project('b', 0)] }} />);
    expect(screen.getByText('Project b')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View Project b' })).toBeNull();
  });

  it('shows the badge only when show_badge is true', () => {
    const { unmount } = render(<SiteTemplate view={VIEW} />);
    expect(screen.getByText('Powered by Reve8')).toBeInTheDocument();
    unmount();
    render(<SiteTemplate view={{ ...VIEW, show_badge: false }} />);
    expect(screen.queryByText('Powered by Reve8')).toBeNull();
  });

  it('renders only http(s) socials, opening in a new tab', () => {
    render(<SiteTemplate view={VIEW} />);
    const ig = screen.getByRole('link', { name: 'Instagram' });
    expect(ig).toHaveAttribute('target', '_blank');
    expect(ig).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByText('Evil')).toBeNull();
    expect(screen.queryByText('Ftp')).toBeNull();
  });

  it('links phone and email', () => {
    render(<SiteTemplate view={VIEW} />);
    expect(
      screen.getByRole('link', { name: '+91 98200 12345' })
    ).toHaveAttribute('href', 'tel:+919820012345');
    expect(
      screen.getAllByRole('link', { name: 'hi@asha.in' })[0]
    ).toHaveAttribute('href', 'mailto:hi@asha.in');
  });

  it('sets the document title to the business name', () => {
    render(<SiteTemplate view={VIEW} />);
    expect(document.title).toBe('Studio Asha');
  });

  it('restores the previous document title on unmount', () => {
    document.title = 'Before';
    const { unmount } = render(<SiteTemplate view={VIEW} />);
    expect(document.title).toBe('Studio Asha');
    unmount();
    expect(document.title).toBe('Before');
  });

  it('applies the chosen theme class to the page root', () => {
    const { container } = render(
      <SiteTemplate view={{ ...VIEW, theme: 'midnight-gold' }} />
    );
    expect(container.querySelector('#top')).toHaveClass(
      'site-light',
      'site-theme-midnight-gold'
    );
  });
});

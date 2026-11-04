import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SiteSettings } from '@/lib/schemas/site';
import { SiteProfileForm } from '../SiteProfileForm';

const SETTINGS: SiteSettings = {
  slug: 'asha',
  published: false,
  mode: 'site',
  tagline: 'Calm rooms',
  about: null,
  address: null,
  phone: null,
  email: null,
  services: [],
  socials: [],
  hide_badge: false,
  can_hide_badge: false,
  theme: 'classic',
  logo_url: null,
  hero_url: null,
};

const saveButton = () => screen.getByRole('button', { name: 'Save website' });

describe('SiteProfileForm', () => {
  it('keeps Save disabled until something changes, and again once reverted', () => {
    render(
      <SiteProfileForm settings={SETTINGS} saving={false} onSave={vi.fn()} />
    );
    expect(saveButton()).toBeDisabled();

    const tagline = screen.getByLabelText('Tagline');
    fireEvent.change(tagline, { target: { value: 'Quiet rooms' } });
    expect(saveButton()).toBeEnabled();

    fireEvent.change(tagline, { target: { value: 'Calm rooms ' } });
    expect(saveButton()).toBeDisabled();
  });

  it('sends the trimmed input on save', () => {
    const onSave = vi.fn();
    render(
      <SiteProfileForm settings={SETTINGS} saving={false} onSave={onSave} />
    );
    fireEvent.change(screen.getByLabelText('Tagline'), {
      target: { value: ' New ' },
    });
    fireEvent.click(saveButton());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ tagline: 'New' })
    );
  });
});

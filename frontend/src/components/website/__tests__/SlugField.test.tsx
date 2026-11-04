import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SlugField } from '../SlugField';

const site = vi.hoisted(() => ({ checkSlug: vi.fn() }));
vi.mock('@/lib/site', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/site')>('@/lib/site');
  return { ...actual, checkSlug: site.checkSlug };
});

function type(value: string) {
  fireEvent.change(screen.getByLabelText('Your web address'), {
    target: { value },
  });
}

async function settle(ms = 450) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('SlugField', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    site.checkSlug.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('shows taken when the slug is unavailable', async () => {
    site.checkSlug.mockResolvedValue({
      slug: 'sj',
      available: false,
      reason: null,
    });
    render(<SlugField value={null} saving={false} onSave={vi.fn()} />);
    type('sj');
    await settle();
    expect(screen.getByText(/taken/i)).toBeTruthy();
  });

  it('shows available and enables save', async () => {
    site.checkSlug.mockResolvedValue({
      slug: 'sj',
      available: true,
      reason: null,
    });
    const onSave = vi.fn();
    render(<SlugField value={null} saving={false} onSave={onSave} />);
    type('sj');
    await settle();
    expect(screen.getByText('Available')).toBeTruthy();
    fireEvent.click(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalledWith('sj');
  });

  it('debounces: one call for rapid keystrokes', async () => {
    site.checkSlug.mockResolvedValue({
      slug: 'abc',
      available: true,
      reason: null,
    });
    render(<SlugField value={null} saving={false} onSave={vi.fn()} />);
    type('a');
    await settle(100);
    type('ab');
    await settle(100);
    type('abc');
    expect(site.checkSlug).not.toHaveBeenCalled();
    await settle();
    expect(site.checkSlug).toHaveBeenCalledTimes(1);
    expect(site.checkSlug).toHaveBeenCalledWith('abc');
  });

  it('previews the slugified value', () => {
    render(<SlugField value={null} saving={false} onSave={vi.fn()} />);
    type('Sj Interiors');
    expect(screen.getByTestId('slug-preview').textContent).toMatch(
      /\/sj-interiors$/
    );
  });

  it('shows the public-on-save hint only when asked', () => {
    const { rerender } = render(
      <SlugField value={null} saving={false} onSave={vi.fn()} />
    );
    expect(screen.queryByText(/public as soon as you save/i)).toBeNull();
    rerender(
      <SlugField value={null} saving={false} onSave={vi.fn()} publicOnSave />
    );
    expect(screen.getByText(/public as soon as you save/i)).toBeTruthy();
  });

  it('removes the public address after confirming', () => {
    const onClear = vi.fn();
    render(
      <SlugField
        value="acme"
        saving={false}
        onSave={vi.fn()}
        onClear={onClear}
      />
    );
    fireEvent.click(screen.getByText('Remove public address'));
    expect(onClear).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

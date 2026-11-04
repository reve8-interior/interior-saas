import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ThemePicker } from '../ThemePicker';

describe('ThemePicker', () => {
  it('marks the current theme and reports a new choice', () => {
    const onSelect = vi.fn();
    render(
      <ThemePicker
        value="classic"
        suggested={['warm-linen']}
        saving={false}
        onSelect={onSelect}
      />
    );
    expect(screen.getByRole('button', { name: /Classic/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByText('Suggested')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Sage & Stone/ }));
    expect(onSelect).toHaveBeenCalledWith('sage-stone');
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SeatMeter } from '../SeatMeter';

describe('SeatMeter', () => {
  it('shows used over max', () => {
    render(<SeatMeter used={2} max={5} />);
    expect(screen.getByText('2 / 5')).toBeInTheDocument();
  });

  it('shows an infinity sign when seats are unlimited', () => {
    render(<SeatMeter used={3} max={null} />);
    expect(screen.getByText('3 / ∞')).toBeInTheDocument();
  });

  it('does not overflow when used exceeds max', () => {
    const { container } = render(<SeatMeter used={9} max={5} />);
    const bar = container.querySelector<HTMLElement>('[style*="width"]');
    expect(bar?.style.width).toBe('100%');
  });
});

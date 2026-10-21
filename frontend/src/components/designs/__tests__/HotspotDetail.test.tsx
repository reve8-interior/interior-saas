import { fireEvent, render, screen } from '@testing-library/react';

import { HotspotDetail } from '../HotspotDetail';

const item = {
  name: 'Teak veneer',
  category: 'Wood',
  unit: 'sqft',
  unit_cost: 250,
};

const setup = (props: Partial<Parameters<typeof HotspotDetail>[0]> = {}) => {
  const onClose = vi.fn();
  render(
    <HotspotDetail
      label="Wardrobe"
      notes={null}
      item={null}
      onClose={onClose}
      {...props}
    />
  );
  return onClose;
};

describe('HotspotDetail', () => {
  it('shows material, dimensions, rate and labour cost', () => {
    setup({ item, dimensions: '8ft x 7ft', labourCost: 1500 });
    expect(screen.getByText('Teak veneer')).toBeInTheDocument();
    expect(screen.getByText('8ft x 7ft')).toBeInTheDocument();
    expect(screen.getByText('Labour')).toBeInTheDocument();
    expect(screen.getByText(/sqft/)).toBeInTheDocument();
  });

  it('hides rate and labour when prices are hidden', () => {
    setup({ item: { ...item, unit_cost: null }, labourCost: null });
    expect(screen.queryByText('Rate')).not.toBeInTheDocument();
    expect(screen.queryByText('Labour')).not.toBeInTheDocument();
  });

  it('shows dimensions without a material', () => {
    setup({ dimensions: '3m wide' });
    expect(screen.getByText('3m wide')).toBeInTheDocument();
    expect(screen.queryByText('Material')).not.toBeInTheDocument();
  });

  it('renders no details list when there is nothing to show', () => {
    setup({ notes: 'Matte finish' });
    expect(screen.getByText('Matte finish')).toBeInTheDocument();
    expect(screen.queryByText('Material')).not.toBeInTheDocument();
  });

  it('closes on the X button and on Escape', () => {
    const onClose = setup();
    fireEvent.click(screen.getByLabelText('Close details'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('does not cover the page, so other hotspots stay clickable', () => {
    setup();
    const root = screen.getByRole('dialog').parentElement as HTMLElement;
    expect(root).toHaveClass('pointer-events-none');
    expect(screen.getByRole('dialog')).toHaveClass('pointer-events-auto');
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NoItemsPanel } from '../NoItemsPanel';

const setup = (over: Partial<Parameters<typeof NoItemsPanel>[0]> = {}) => {
  const onAddManual = vi.fn();
  const onRunExtract = vi.fn();
  render(
    <NoItemsPanel
      hasRun={false}
      ranAt={null}
      unmappedNotes={[]}
      isExtracting={false}
      extractChars={100}
      onAddManual={onAddManual}
      onRunExtract={onRunExtract}
      {...over}
    />
  );
  return { onAddManual, onRunExtract };
};

describe('NoItemsPanel', () => {
  it('offers the first extraction when none has run', () => {
    const { onRunExtract } = setup();
    expect(screen.getByText(/No AI extraction yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Run AI Extract' }));
    expect(onRunExtract).toHaveBeenCalledTimes(1);
  });

  it('says extraction found nothing and offers a manual row after a run', () => {
    const { onAddManual } = setup({
      hasRun: true,
      unmappedNotes: ['Likes teak'],
    });
    expect(
      screen.getByText(/found no quotation line items/)
    ).toBeInTheDocument();
    expect(screen.getByText('Likes teak')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ Add a line item' }));
    expect(onAddManual).toHaveBeenCalledTimes(1);
  });

  it('disables extraction while one is running', () => {
    setup({ isExtracting: true });
    expect(screen.getByRole('button', { name: 'Extracting…' })).toBeDisabled();
  });
});

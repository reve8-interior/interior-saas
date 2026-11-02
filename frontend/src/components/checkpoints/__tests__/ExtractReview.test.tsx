import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { toQuotationPayload, blankItem } from '@/lib/checkpointItems';
import type { ExtractionResponse } from '@/lib/checkpoints';
import { DEFAULT_LINE_ITEM_COLUMNS } from '@/lib/lineItemColumns';
import { ExtractReview } from '../ExtractReview';

const setup = (itemCount = 1) => {
  const handlers = {
    onMinutesChange: vi.fn(),
    onBudgetChange: vi.fn(),
    onAddItem: vi.fn(),
    onRemoveItem: vi.fn(),
    onUpdateItem: vi.fn(),
    onUpdateItemExtra: vi.fn(),
  };
  render(
    <ExtractReview
      extraction={
        {
          model: 'gpt-test',
          scope: { total_items: 0, items_in_context: 0, matched_rooms: [] },
          unmapped_notes: [],
          warnings: [],
          material_hints: [],
          line_items: [],
        } as unknown as ExtractionResponse
      }
      minutes="Wants a wardrobe"
      items={Array.from(
        { length: itemCount },
        () =>
          toQuotationPayload([
            blankItem({ room: 'Hall', description: 'Sofa' }),
          ])[0]
      )}
      budget="500000"
      columns={DEFAULT_LINE_ITEM_COLUMNS}
      {...handlers}
    />
  );
  return handlers;
};

describe('ExtractReview', () => {
  it('shows the minutes and budget being edited', () => {
    setup();
    expect(screen.getByLabelText(/minutes/i)).toHaveValue('Wants a wardrobe');
    expect(screen.getByLabelText(/budget/i)).toHaveValue(500000);
  });

  it('reports minutes edits', () => {
    const { onMinutesChange } = setup();
    fireEvent.change(screen.getByLabelText(/minutes/i), {
      target: { value: 'Updated' },
    });
    expect(onMinutesChange).toHaveBeenCalledWith('Updated');
  });

  it('adds a row', () => {
    const { onAddItem } = setup();
    fireEvent.click(screen.getByRole('button', { name: '+ Add row' }));
    expect(onAddItem).toHaveBeenCalledTimes(1);
  });

  it('removes the clicked row', () => {
    const { onRemoveItem } = setup(2);
    fireEvent.click(screen.getAllByLabelText('Remove row 2')[0]);
    expect(onRemoveItem).toHaveBeenCalledWith(1);
  });
});

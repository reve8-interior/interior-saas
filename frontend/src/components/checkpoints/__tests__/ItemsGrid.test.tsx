import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { blankItem, type LineItemData } from '@/lib/checkpointItems';
import { DEFAULT_LINE_ITEM_COLUMNS } from '@/lib/lineItemColumns';
import { ItemsGrid } from '../ItemsGrid';

const columns = DEFAULT_LINE_ITEM_COLUMNS;
const row = (over: Partial<LineItemData> = {}): LineItemData => ({
  ...blankItem(),
  room: 'Kitchen',
  description: 'Cabinets',
  qty: 2,
  rate: 100,
  ...over,
});

const setup = (items: LineItemData[], locked = false) => {
  const onVerify = vi.fn();
  const onChangeField = vi.fn();
  render(
    <ItemsGrid
      items={items}
      enabledCols={columns.filter((c) => c.enabled)}
      columns={columns}
      locked={locked}
      onChangeField={onChangeField}
      onVerify={onVerify}
    />
  );
  return { onVerify, onChangeField };
};

describe('ItemsGrid', () => {
  it('reports the verified toggle for the clicked row', () => {
    const { onVerify } = setup([row(), row({ room: 'Hall' })]);
    fireEvent.click(screen.getByLabelText('Verify row 2'));
    expect(onVerify).toHaveBeenCalledWith(1, true);
  });

  it('locks the table when the rows are already in the quotation', () => {
    setup([row()], true);
    expect(screen.getByRole('group')).toBeDisabled();
  });

  it('leaves the table editable otherwise', () => {
    setup([row()]);
    expect(screen.getByRole('group')).toBeEnabled();
  });
});

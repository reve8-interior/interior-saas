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

const setup = (
  items: LineItemData[],
  locked = false,
  withRemove = true,
  withAction = true
) => {
  const onVerify = vi.fn();
  const onRemove = vi.fn();
  const onActionChange = vi.fn();
  const onChangeField = vi.fn();
  render(
    <ItemsGrid
      items={items}
      enabledCols={columns.filter((c) => c.enabled)}
      columns={columns}
      locked={locked}
      onChangeField={onChangeField}
      onVerify={onVerify}
      onRemove={withRemove ? onRemove : undefined}
      onActionChange={withAction ? onActionChange : undefined}
    />
  );
  return { onVerify, onChangeField, onRemove, onActionChange };
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

  it('reports which row to remove', () => {
    const { onRemove } = setup([row(), row({ room: 'Hall' })]);
    fireEvent.click(screen.getAllByLabelText('Remove row 2')[0]);
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it('offers a remove button per row', () => {
    setup([row(), row({ room: 'Hall' }), row({ room: 'Study' })]);
    // phone cards and the desktop table both render in jsdom
    expect(
      screen.getAllByLabelText(/^Remove row/).length
    ).toBeGreaterThanOrEqual(3);
  });

  it('has no remove buttons when removal is not offered', () => {
    setup([row()], false, false);
    expect(screen.queryByLabelText('Remove row 1')).toBeNull();
  });

  it('hides the phone remove buttons once the rows are locked', () => {
    setup([row()], true);
    // only the (disabled) table button remains; the cards drop theirs
    const buttons = screen.getAllByLabelText('Remove row 1');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toBeDisabled();
  });
});

describe('ItemsGrid action', () => {
  const select = (n: number) =>
    screen.getAllByLabelText(`Action for row ${n}`)[0] as HTMLSelectElement;

  it('lets the action be chosen per row', () => {
    const { onActionChange } = setup([row(), row({ room: 'Hall' })]);
    fireEvent.change(select(2), { target: { value: 'remove' } });
    expect(onActionChange).toHaveBeenCalledWith(1, 'remove');
  });

  it('offers new, update and remove', () => {
    setup([row()]);
    expect([...select(1).options].map((o) => o.value)).toEqual([
      'add',
      'update',
      'remove',
    ]);
  });

  it('shows the current action', () => {
    setup([row({ action: 'update' })]);
    expect(select(1).value).toBe('update');
  });

  it('keeps the action a label when it cannot be changed', () => {
    setup([row()], false, true, false);
    expect(screen.queryByLabelText('Action for row 1')).toBeNull();
    expect(screen.getAllByText('New').length).toBeGreaterThan(0);
  });

  it('keeps the action a label once the rows are locked', () => {
    setup([row()], true);
    expect(screen.queryByLabelText('Action for row 1')).toBeNull();
  });
});

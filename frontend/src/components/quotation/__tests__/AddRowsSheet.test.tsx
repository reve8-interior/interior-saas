import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuotationLineItem } from '@/lib/schemas/quotation';
import { AddRowsSheet } from '../AddRowsSheet';

vi.mock('@/lib/quotation', () => ({
  getMaterials: () => Promise.resolve([]),
}));

const saved = (status = 'draft') => ({ status }) as QuotationLineItem;
const onChanged = vi.fn();
const onClose = vi.fn();

function setup(onCreate = vi.fn().mockResolvedValue(saved())) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AddRowsSheet
        rooms={['Kitchen']}
        customCols={[]}
        defaultRoom="Kitchen"
        onCreate={onCreate}
        onChanged={onChanged}
        onClose={onClose}
      />
    </QueryClientProvider>
  );
  return onCreate;
}

const describeRow = (n: number, value: string) =>
  fireEvent.change(screen.getByLabelText(`Row ${n} description *`), {
    target: { value },
  });

describe('AddRowsSheet', () => {
  beforeEach(() => vi.clearAllMocks());

  it('saves filled rows into the room and ignores blank ones', async () => {
    const onCreate = setup();
    describeRow(1, 'Base unit');
    describeRow(3, 'Loft');
    fireEvent.click(screen.getByRole('button', { name: 'Save rows' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onCreate).toHaveBeenCalledTimes(2);
    expect(onCreate.mock.calls[0][0]).toMatchObject({
      room: 'Kitchen',
      description: 'Base unit',
    });
  });

  it('names the row with a problem and saves nothing', () => {
    const onCreate = setup();
    fireEvent.change(screen.getByLabelText('Row 2 qty'), {
      target: { value: '4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save rows' }));
    expect(screen.getByRole('alert').textContent).toMatch(/Row 2.*Description/);
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('keeps only the unsaved rows when a save fails partway', async () => {
    const onCreate = setup(
      vi
        .fn()
        .mockResolvedValueOnce(saved())
        .mockRejectedValueOnce(new Error('Network down'))
    );
    describeRow(1, 'Base unit');
    describeRow(2, 'Loft');
    fireEvent.click(screen.getByRole('button', { name: 'Save rows' }));
    expect(await screen.findByText(/1 of 2 saved/)).toBeTruthy();
    expect(onCreate).toHaveBeenCalledTimes(2);
    expect(onChanged).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(
      (screen.getByLabelText('Row 1 description *') as HTMLInputElement).value
    ).toBe('Loft');
  });

  it('adds a row when Enter is pressed on the last one', () => {
    setup();
    fireEvent.keyDown(screen.getByLabelText('Row 3 qty'), { key: 'Enter' });
    expect(screen.getByLabelText('Row 4 description *')).toBeTruthy();
  });
});

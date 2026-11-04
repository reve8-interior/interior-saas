import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuotationLineItem } from '@/lib/schemas/quotation';
import { ApiError } from '@/lib/api';
import { checkIntake } from '@/lib/intake';
import { AddRowsSheet } from '../AddRowsSheet';

vi.mock('@/lib/intake', () => ({
  checkIntake: vi.fn().mockResolvedValue([]),
}));

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
        clientId="c1"
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

  it('warns about a similar existing line and adds only when confirmed', async () => {
    vi.mocked(checkIntake).mockResolvedValueOnce([
      {
        room: 'Kitchen',
        room_status: 'existing',
        similar: {
          id: 'l1',
          room: 'Kitchen',
          description: 'Base unit',
          summary: 'Kitchen — Base unit',
        },
      },
    ]);
    const onCreate = setup();
    describeRow(1, 'Base units');
    fireEvent.click(screen.getByRole('button', { name: 'Save rows' }));
    await screen.findByText('Already in this quotation?');
    expect(onCreate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Add anyway' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
  });

  it('sends allow_duplicate only after the designer confirmed', async () => {
    vi.mocked(checkIntake).mockResolvedValueOnce([
      {
        room: 'Kitchen',
        room_status: 'existing',
        similar: {
          id: 'l1',
          room: 'Kitchen',
          description: 'Base unit',
          summary: 'Kitchen — Base unit',
        },
      },
    ]);
    const onCreate = setup();
    describeRow(1, 'Base units');
    fireEvent.click(screen.getByRole('button', { name: 'Save rows' }));
    await screen.findByText('Already in this quotation?');
    fireEvent.click(screen.getByRole('button', { name: 'Add anyway' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onCreate.mock.calls[0][0]).toMatchObject({ allow_duplicate: true });
  });

  it('does not allow duplicates on a normal save', async () => {
    const onCreate = setup();
    describeRow(1, 'Chimney');
    fireEvent.click(screen.getByRole('button', { name: 'Save rows' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onCreate.mock.calls[0][0]).toMatchObject({ allow_duplicate: false });
  });

  it('shows the duplicate warning when only the server catches it', async () => {
    const onCreate = vi
      .fn()
      .mockRejectedValue(
        new ApiError('Looks like “Base unit” is already in Kitchen.', 409, {})
      );
    setup(onCreate);
    describeRow(1, 'Base units');
    fireEvent.click(screen.getByRole('button', { name: 'Save rows' }));
    await screen.findByText('Already in this quotation?');
    expect(screen.getByRole('button', { name: 'Add anyway' })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
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

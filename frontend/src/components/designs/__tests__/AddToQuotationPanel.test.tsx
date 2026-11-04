import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { addHotspotToQuotation } from '@/lib/designs';
import { checkIntake } from '@/lib/intake';
import { getQuotation } from '@/lib/quotation';
import type { Hotspot } from '@/lib/schemas/design';
import type { Quotation } from '@/lib/schemas/quotation';

import { AddToQuotationPanel } from '../AddToQuotationPanel';

vi.mock('@/lib/quotation', () => ({ getQuotation: vi.fn() }));
vi.mock('@/lib/designs', () => ({ addHotspotToQuotation: vi.fn() }));
vi.mock('@/lib/intake', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/intake')>()),
  checkIntake: vi.fn().mockResolvedValue([]),
}));

const hotspot = {
  id: 'h1',
  label: 'Sofa',
  notes: null,
  material: null,
  quotation_line_item_id: null,
} as unknown as Hotspot;

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AddToQuotationPanel clientId="c1" designId="d1" hotspot={hotspot} />
    </QueryClientProvider>
  );
}

describe('AddToQuotationPanel room picker', () => {
  it('offers the quotation rooms as a dropdown, not a row of buttons', async () => {
    vi.mocked(getQuotation).mockResolvedValue({
      rooms: [
        { room: 'Living Room', items: [] },
        { room: 'Kitchen', items: [] },
      ],
    } as unknown as Quotation);
    renderPanel();
    const select = await screen.findByRole('combobox', { name: /room/i });
    const options = Array.from(select.querySelectorAll('option')).map(
      (o) => o.textContent
    );
    expect(options).toEqual(['Living Room', 'Kitchen', 'New room…']);
    expect(screen.queryByRole('button', { name: 'Kitchen' })).toBeNull();
  });

  it('shows a text box for a new room', async () => {
    vi.mocked(getQuotation).mockResolvedValue({
      rooms: [{ room: 'Kitchen', items: [] }],
    } as unknown as Quotation);
    renderPanel();
    const select = await screen.findByRole('combobox', { name: /room/i });
    fireEvent.change(select, { target: { value: '__new__' } });
    expect(screen.getByLabelText('New room name')).toBeTruthy();
  });

  it('offers to update the similar line instead of only adding a duplicate', async () => {
    vi.mocked(getQuotation).mockResolvedValue({
      rooms: [{ room: 'Living Room', items: [] }],
    } as unknown as Quotation);
    vi.mocked(checkIntake).mockResolvedValue([
      {
        room: 'Living Room',
        room_status: 'existing',
        similar: {
          id: 'line-9',
          room: 'Living Room',
          description: 'Sofa',
          summary: 'Living Room — Sofa',
        },
      },
    ]);
    vi.mocked(addHotspotToQuotation).mockResolvedValue(hotspot);
    renderPanel();
    const select = await screen.findByRole('combobox', { name: /room/i });
    fireEvent.change(select, { target: { value: 'Living Room' } });
    const update = await screen.findByRole('button', {
      name: 'Update existing line',
    });
    expect(screen.queryByRole('button', { name: 'Add anyway' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Add as new line' })
    ).toBeTruthy();
    fireEvent.click(update);
    await waitFor(() =>
      expect(addHotspotToQuotation).toHaveBeenCalledWith(
        'c1',
        'd1',
        'h1',
        expect.objectContaining({
          update_item_id: 'line-9',
          allow_duplicate: false,
        })
      )
    );
  });

  it('offers the catalogue rate for a material the description names', async () => {
    vi.mocked(getQuotation).mockResolvedValue({
      rooms: [{ room: 'Living Room', items: [] }],
    } as unknown as Quotation);
    vi.mocked(checkIntake).mockResolvedValue([
      {
        room: 'Living Room',
        room_status: 'existing',
        similar: null,
        material: { id: 'm1', name: 'Teak', unit: 'sqft', unit_cost: 900 },
      },
    ]);
    renderPanel();
    fireEvent.click(await screen.findByText(/Size, quantity/));
    fireEvent.click(await screen.findByRole('button', { name: /Use Teak/ }));
    expect((screen.getByLabelText('Rate (₹)') as HTMLInputElement).value).toBe(
      '900'
    );
    expect(screen.queryByRole('button', { name: /Use Teak/ })).toBeNull();
  });
});

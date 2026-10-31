import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  QuotationLineItem,
  QuotationRoomGroup,
} from '@/lib/schemas/quotation';
import { RoomSection } from '../RoomSection';

const item = (over: Partial<QuotationLineItem> = {}): QuotationLineItem => ({
  id: 'i1',
  quotation_id: 'q1',
  room: 'Kitchen',
  position: 0,
  description: 'Base cabinets',
  catalog_type: 'core_works',
  unit: 'sqft',
  raw_dimension: null,
  computed_sqft: null,
  qty: 20,
  rate: 1000,
  initial_price: 20000,
  negotiated_price: null,
  est_time: null,
  remarks: null,
  extra: {},
  status: 'draft',
  material_id: null,
  created_at: '2030-01-01T00:00:00Z',
  updated_at: '2030-01-01T00:00:00Z',
  ...over,
});

const group = (items = [item()]): QuotationRoomGroup => ({
  room: 'Kitchen',
  items,
  initial_total: 20000,
  negotiated_total: 18000,
  pending_clarity_count: 0,
});

const setup = (props: { isCollapsed?: boolean } = {}) => {
  const handlers = {
    onToggle: vi.fn(),
    onAddRow: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    quickUpdate: vi.fn(),
  };
  render(
    <RoomSection
      group={group()}
      clientId="c1"
      isCollapsed={props.isCollapsed ?? false}
      cpNumbers={{}}
      showCol={() => true}
      colLabel={(k) => k}
      customCols={[]}
      deletePending={false}
      {...handlers}
    />
  );
  return handlers;
};

describe('RoomSection', () => {
  it('shows the room and its items when expanded', () => {
    setup();
    expect(screen.getByRole('button', { expanded: true })).toHaveTextContent(
      'Kitchen'
    );
    expect(screen.getAllByText('Base cabinets').length).toBeGreaterThan(0);
  });

  it('hides the items when collapsed', () => {
    setup({ isCollapsed: true });
    expect(screen.queryByText('Base cabinets')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument();
  });

  it('toggles from the header', () => {
    const { onToggle } = setup();
    fireEvent.click(screen.getByRole('button', { expanded: true }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('adds a row to this room', () => {
    const { onAddRow } = setup();
    fireEvent.click(screen.getByRole('button', { name: /add row/i }));
    expect(onAddRow).toHaveBeenCalledTimes(1);
  });

  it('edits and deletes the chosen item', () => {
    const { onEdit, onDelete } = setup();
    fireEvent.click(screen.getAllByLabelText('Edit Base cabinets')[0]);
    fireEvent.click(screen.getAllByLabelText('Delete Base cabinets')[0]);
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'i1' }));
    expect(onDelete).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'i1' })
    );
  });
});

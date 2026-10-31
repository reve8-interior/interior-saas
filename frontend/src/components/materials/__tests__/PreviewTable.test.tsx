import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DraftRow } from '@/lib/materials';
import { PreviewTable } from '../PreviewTable';

const row = (over: Partial<DraftRow> = {}): DraftRow => ({
  name: 'Ply',
  category: 'Wood',
  unit: 'sqft',
  unit_cost: '120',
  vendor: null,
  ...over,
});

describe('PreviewTable', () => {
  it('shows an empty state with no rows', () => {
    render(<PreviewTable rows={[]} onChange={vi.fn()} />);
    expect(screen.getByText(/No rows/)).toBeInTheDocument();
  });

  it('edits only the changed cell of the changed row', () => {
    const onChange = vi.fn();
    const rows = [row(), row({ name: 'MDF' })];
    render(<PreviewTable rows={rows} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Row 2 name'), {
      target: { value: 'HDF' },
    });
    expect(onChange).toHaveBeenCalledWith([
      rows[0],
      { ...rows[1], name: 'HDF' },
    ]);
  });

  it('removes the chosen row', () => {
    const onChange = vi.fn();
    const rows = [row(), row({ name: 'MDF' })];
    render(<PreviewTable rows={rows} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Remove row 1'));
    expect(onChange).toHaveBeenCalledWith([rows[1]]);
  });

  it('flags a missing name and an unusable cost', () => {
    render(
      <PreviewTable
        rows={[row({ name: '', unit_cost: 'abc' })]}
        onChange={vi.fn()}
      />
    );
    expect(screen.getByLabelText('Row 1 name')).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    expect(screen.getByLabelText('Row 1 unit cost')).toHaveAttribute(
      'aria-invalid',
      'true'
    );
  });

  it('does not flag a valid row', () => {
    render(<PreviewTable rows={[row()]} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Row 1 name')).toHaveAttribute(
      'aria-invalid',
      'false'
    );
  });
});

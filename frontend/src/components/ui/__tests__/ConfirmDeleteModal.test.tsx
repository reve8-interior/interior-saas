import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDeleteModal } from '../ConfirmDeleteModal';

const base = {
  isOpen: true,
  isLoading: false,
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe('ConfirmDeleteModal', () => {
  it('renders nothing while closed', () => {
    render(<ConfirmDeleteModal {...base} isOpen={false} />);
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('keeps the delete wording by default', () => {
    render(<ConfirmDeleteModal {...base} />);
    expect(screen.getByRole('button', { name: 'Delete' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  });

  it('uses custom labels for the confirm, dismiss and busy states', () => {
    const { rerender } = render(
      <ConfirmDeleteModal
        {...base}
        confirmLabel="Cancel subscription"
        cancelLabel="Keep subscription"
        loadingLabel="Cancelling..."
      />
    );
    expect(
      screen.getByRole('button', { name: 'Cancel subscription' })
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Keep subscription' })
    ).toBeTruthy();
    rerender(
      <ConfirmDeleteModal
        {...base}
        isLoading
        confirmLabel="Cancel subscription"
        loadingLabel="Cancelling..."
      />
    );
    expect(
      screen.getByRole('button', { name: 'Cancelling...' })
    ).toBeDisabled();
  });

  it('calls the right handler for each button', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDeleteModal
        {...base}
        onConfirm={onConfirm}
        onCancel={onCancel}
        confirmLabel="Yes"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

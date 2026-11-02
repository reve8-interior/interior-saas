import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { IssuedCredentialsModal } from '../IssuedCredentialsModal';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const creds = { email: 'owner@biz.com', password: 'Temp-pass-123' };

function stubClipboard(writeText: (t: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
}

describe('IssuedCredentialsModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing when there are no credentials', () => {
    render(<IssuedCredentialsModal credentials={null} onClose={vi.fn()} />);
    expect(screen.queryByText('Temporary password')).not.toBeInTheDocument();
  });

  it('shows the email and temporary password', () => {
    render(<IssuedCredentialsModal credentials={creds} onClose={vi.fn()} />);
    expect(screen.getByText(creds.email)).toBeInTheDocument();
    expect(screen.getByText(creds.password)).toBeInTheDocument();
  });

  it('copies both values and confirms', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    render(<IssuedCredentialsModal credentials={creds} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /copy email/i }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(writeText).toHaveBeenCalledWith(
      `Email: ${creds.email}\nTemporary password: ${creds.password}`
    );
  });

  it('reports a failed copy', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('blocked')));
    render(<IssuedCredentialsModal credentials={creds} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /copy email/i }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Copy failed')
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('closes from Done', () => {
    const onClose = vi.fn();
    render(<IssuedCredentialsModal credentials={creds} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });
});

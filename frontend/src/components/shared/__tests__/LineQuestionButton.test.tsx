import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { LineQuestionButton } from '../LineQuestionButton';
import { respondToSharedQuotation } from '@/lib/quotationVersions';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/quotationVersions', () => ({
  respondToSharedQuotation: vi.fn().mockResolvedValue(undefined),
}));

const LABEL = 'Kitchen · Modular cabinet';
const respond = vi.mocked(respondToSharedQuotation);

const open = () => {
  render(<LineQuestionButton token="tok" label={LABEL} />);
  fireEvent.click(screen.getByRole('button', { name: `Ask about ${LABEL}` }));
};
const fill = (name: string, question: string) => {
  fireEvent.change(screen.getByLabelText('Your name'), {
    target: { value: name },
  });
  fireEvent.change(screen.getByLabelText('Your question'), {
    target: { value: question },
  });
};
const send = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));

describe('LineQuestionButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('names the line it is about in the dialog', () => {
    open();
    expect(screen.getByText(LABEL)).toBeInTheDocument();
  });

  it('refuses to send without a name or a question', () => {
    open();
    send();
    expect(toast.error).toHaveBeenCalledWith('Please enter your name');
    fill('Mrs Rao', '   ');
    send();
    expect(toast.error).toHaveBeenCalledWith('Please write your question');
    expect(respond).not.toHaveBeenCalled();
  });

  it('sends a question tagged with the line and closes', async () => {
    open();
    fill('  Mrs Rao ', ' Which finish? ');
    send();
    await waitFor(() =>
      expect(respond).toHaveBeenCalledWith('tok', {
        kind: 'question',
        name: 'Mrs Rao',
        message: 'Which finish?',
        item_label: LABEL,
      })
    );
    await waitFor(() =>
      expect(screen.queryByLabelText('Your question')).toBeNull()
    );
    expect(
      screen.getByRole('button', { name: `Ask about ${LABEL}` })
    ).toHaveAttribute('title', 'Question sent. Ask another');
  });

  it('remembers the name so the next question needs only the text', async () => {
    open();
    fill('Mrs Rao', 'First?');
    send();
    await waitFor(() => expect(respond).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByLabelText('Your question')).toBeNull()
    );
    fireEvent.click(screen.getByRole('button', { name: `Ask about ${LABEL}` }));
    expect(screen.getByLabelText('Your name')).toHaveValue('Mrs Rao');
    expect(screen.getByLabelText('Your question')).toHaveValue('');
  });

  it('prefills the name saved by an earlier visit', () => {
    localStorage.setItem('customer-name', 'Mr Shah');
    open();
    expect(screen.getByLabelText('Your name')).toHaveValue('Mr Shah');
  });

  it('keeps the dialog open and explains when sending fails', async () => {
    respond.mockRejectedValueOnce(new Error('boom'));
    open();
    fill('Mrs Rao', 'Which finish?');
    send();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.getByLabelText('Your question')).toHaveValue('Which finish?');
  });
});

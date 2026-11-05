import { acceptInvite } from '@/lib/auth';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AcceptInvitePage from '../page';

let query = 'token=tok-abc';
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(query),
}));
vi.mock('@/lib/auth', () => ({ acceptInvite: vi.fn() }));

const GOOD = 'my-new-pass-1';

function fill(password: string, confirm = password) {
  fireEvent.change(screen.getByLabelText('New password'), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText('Confirm password'), {
    target: { value: confirm },
  });
}

const submit = () =>
  fireEvent.click(screen.getByRole('button', { name: /set password/i }));

beforeEach(() => {
  query = 'token=tok-abc';
  vi.mocked(acceptInvite).mockReset().mockResolvedValue(undefined);
});

describe('AcceptInvitePage', () => {
  it('shows the set-password form for a link with a token', () => {
    render(<AcceptInvitePage />);
    expect(
      screen.getByRole('heading', { name: 'Set your password' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toHaveAttribute(
      'autocomplete',
      'new-password'
    );
  });

  it('explains an incomplete link instead of showing a form', () => {
    query = '';
    render(<AcceptInvitePage />);
    expect(screen.getByRole('alert')).toHaveTextContent(/incomplete/i);
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  });

  it('rejects a short password without calling the API', () => {
    render(<AcceptInvitePage />);
    fill('short');
    submit();
    expect(screen.getByRole('alert')).toHaveTextContent(/at least 8/i);
    expect(acceptInvite).not.toHaveBeenCalled();
  });

  it('rejects mismatched passwords without calling the API', () => {
    render(<AcceptInvitePage />);
    fill(GOOD, 'something-else-9');
    submit();
    expect(screen.getByRole('alert')).toHaveTextContent(/do not match/i);
    expect(acceptInvite).not.toHaveBeenCalled();
  });

  it('sends the token from the link with the chosen password', async () => {
    render(<AcceptInvitePage />);
    fill(GOOD);
    submit();
    await waitFor(() =>
      expect(acceptInvite).toHaveBeenCalledWith('tok-abc', GOOD)
    );
  });

  it('confirms and links to sign in on success', async () => {
    render(<AcceptInvitePage />);
    fill(GOOD);
    submit();
    expect(await screen.findByText('Email confirmed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute(
      'href',
      '/login'
    );
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  });

  it('shows the backend message for an expired link and keeps the form', async () => {
    vi.mocked(acceptInvite).mockRejectedValue(
      new Error('This invite link is invalid or has expired.')
    );
    render(<AcceptInvitePage />);
    fill(GOOD);
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This invite link is invalid or has expired.'
    );
    expect(screen.getByLabelText('New password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /set password/i })).toBeEnabled();
  });

  it('disables the button while saving', async () => {
    let finish: () => void = () => {};
    vi.mocked(acceptInvite).mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      })
    );
    render(<AcceptInvitePage />);
    fill(GOOD);
    submit();
    expect(
      await screen.findByRole('button', { name: /saving/i })
    ).toBeDisabled();
    finish();
    expect(await screen.findByText('Email confirmed')).toBeInTheDocument();
  });

  it('clears an earlier error when the next attempt works', async () => {
    vi.mocked(acceptInvite)
      .mockRejectedValueOnce(new Error('Temporary glitch'))
      .mockResolvedValueOnce(undefined);
    render(<AcceptInvitePage />);
    fill(GOOD);
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Temporary glitch'
    );
    submit();
    expect(await screen.findByText('Email confirmed')).toBeInTheDocument();
    expect(screen.queryByText('Temporary glitch')).not.toBeInTheDocument();
  });
});

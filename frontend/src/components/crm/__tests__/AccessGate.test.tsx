import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AccessGate } from '../AccessGate';
import type { AccessStatus, UsageMeter } from '@/lib/schemas/auth';

const access = (over: Partial<AccessStatus> = {}): AccessStatus => ({
  plan: 'solo',
  expires_at: null,
  days_left: null,
  warning_days: 7,
  expired: false,
  ...over,
});

const meter = (over: Partial<UsageMeter> = {}): UsageMeter => ({
  key: 'clients',
  label: 'Active clients',
  used: 1,
  limit: 3,
  ...over,
});

const renderGate = (a: AccessStatus | undefined, meters?: UsageMeter[]) =>
  render(
    <AccessGate access={a} meters={meters}>
      <p>page content</p>
    </AccessGate>
  );

describe('AccessGate: lapsed paid plan', () => {
  it('keeps the portal open and tells the user they are on Free', () => {
    renderGate(access({ expired: true, days_left: 0 }));
    expect(screen.getByText('page content')).toBeTruthy();
    expect(screen.getByText(/now on the Free plan/i)).toBeTruthy();
    expect(
      screen.getByText(
        /remaining clients, designs, portfolio designs, website/i
      )
    ).toBeTruthy();
  });

  it('links to billing so the user can upgrade', () => {
    renderGate(access({ expired: true }));
    const link = screen.getByRole('link', { name: /upgrade now/i });
    expect(link.getAttribute('href')).toBe('/dashboard/billing');
  });

  it('never shows the old "portal will be locked" countdown once lapsed', () => {
    renderGate(access({ expired: true, days_left: 0 }));
    expect(screen.queryByText(/portal will be locked/i)).toBeNull();
    expect(screen.queryByText(/Last day of your plan/i)).toBeNull();
  });

  it('does not show a lock screen or hide the page', () => {
    renderGate(access({ expired: true }));
    expect(screen.queryByText(/access expired/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /sign out/i })).toBeNull();
  });
});

describe('AccessGate: countdown before the plan ends', () => {
  it('shows the days left once inside the warning window', () => {
    renderGate(access({ days_left: 5 }));
    expect(screen.getByText(/5 days left on your plan/i)).toBeTruthy();
    expect(screen.getByText(/move to the Free plan/i)).toBeTruthy();
  });

  it('uses the singular for one day', () => {
    renderGate(access({ days_left: 1 }));
    expect(screen.getByText(/1 day left on your plan/i)).toBeTruthy();
  });

  it('shows a last-day message on day zero', () => {
    renderGate(access({ days_left: 0 }));
    expect(screen.getByText(/Last day of your plan/i)).toBeTruthy();
  });

  it('shows the banner on the first day of the window', () => {
    renderGate(access({ days_left: 7, warning_days: 7 }));
    expect(screen.getByText(/7 days left/i)).toBeTruthy();
  });

  it('stays quiet outside the warning window', () => {
    renderGate(access({ days_left: 8, warning_days: 7 }));
    expect(screen.queryByText(/days left/i)).toBeNull();
  });

  it('stays quiet when there is no expiry (Free or unlimited)', () => {
    renderGate(access({ days_left: null }));
    expect(screen.queryByText(/left on your plan/i)).toBeNull();
    expect(screen.queryByText(/Last day/i)).toBeNull();
  });

  it('stays quiet while access is still loading', () => {
    renderGate(undefined);
    expect(screen.getByText('page content')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('AccessGate: usage warnings', () => {
  it('warns when a limit is nearly used and links to billing', () => {
    renderGate(access(), [meter({ used: 4, limit: 5 })]);
    expect(screen.getByText(/Active clients: 4 of 5/)).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /upgrade your plan/i })
    ).toBeTruthy();
  });

  it('stays quiet just below the 80% threshold', () => {
    renderGate(access(), [meter({ used: 3, limit: 4 })]);
    expect(screen.queryByText(/Active clients/)).toBeNull();
  });

  it('marks a full limit', () => {
    renderGate(access(), [meter({ used: 3, limit: 3 })]);
    expect(screen.getByText(/Active clients: 3 of 3 \(full\)/)).toBeTruthy();
  });

  it('shows nothing for a comfortable or unlimited meter', () => {
    renderGate(access(), [
      meter({ used: 1, limit: 10 }),
      meter({ key: 'users', label: 'Team', used: 4, limit: null }),
    ]);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('can show the lapse notice and a usage warning together', () => {
    renderGate(access({ expired: true }), [meter({ used: 3, limit: 3 })]);
    expect(screen.getByText(/now on the Free plan/i)).toBeTruthy();
    expect(screen.getByText(/\(full\)/)).toBeTruthy();
  });
});

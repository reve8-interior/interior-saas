import { describe, expect, it } from 'vitest';
import { notesLockMessage } from '@/lib/aiStatus';

const off = { enabled: false, monthly_limit: null, remaining: null };

describe('notesLockMessage', () => {
  it('allows use while AI is on and not used up', () => {
    expect(
      notesLockMessage(
        { enabled: true, monthly_limit: 10, remaining: 1 },
        'free'
      )
    ).toBeNull();
    expect(
      notesLockMessage(
        { enabled: true, monthly_limit: null, remaining: null },
        'studio'
      )
    ).toBeNull();
  });
  it('explains the free plan and keeps hand entry open', () => {
    const message = notesLockMessage(off, 'free');
    expect(message).toMatch(/Upgrade/);
    expect(message).toMatch(/by hand/);
  });
  it('tells a paid business without a key to ask its admin', () => {
    expect(notesLockMessage(off, 'studio')).toMatch(/admin/);
  });
  it('explains a used-up allowance', () => {
    expect(
      notesLockMessage(
        { enabled: true, monthly_limit: 10, remaining: 0 },
        'free'
      )
    ).toMatch(/10 AI credits/);
  });
});

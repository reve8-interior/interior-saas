import { api } from '@/lib/api';
import { resendBusinessInvite } from '@/lib/businesses';
import { businessTeamApi, ownTeamApi } from '@/lib/team';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue({}),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

beforeEach(() => vi.mocked(api.post).mockClear());

describe('own team api', () => {
  it('adds a member without sending a password when none is typed', async () => {
    await ownTeamApi.add({ email: 'a@x.com', role: 'designer' });
    expect(api.post).toHaveBeenCalledWith('/team', {
      email: 'a@x.com',
      role: 'designer',
    });
    const body = vi.mocked(api.post).mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(body).not.toHaveProperty('password');
  });

  it('resets without a password so the server emails an invite', async () => {
    await ownTeamApi.resetPassword('u1');
    expect(api.post).toHaveBeenCalledWith('/team/u1/reset-password', {
      password: null,
    });
  });

  it('turns an empty typed password into null, not an empty string', async () => {
    await ownTeamApi.resetPassword('u1', '');
    expect(api.post).toHaveBeenCalledWith('/team/u1/reset-password', {
      password: null,
    });
  });

  it('passes an explicit password through', async () => {
    await ownTeamApi.resetPassword('u1', 'handed-over-9');
    expect(api.post).toHaveBeenCalledWith('/team/u1/reset-password', {
      password: 'handed-over-9',
    });
  });
});

describe('business team api (platform admin)', () => {
  it('adds and resets under the business path', async () => {
    const team = businessTeamApi('b7');
    await team.add({ email: 'a@x.com' });
    await team.resetPassword('u1');
    expect(api.post).toHaveBeenNthCalledWith(1, '/businesses/b7/users', {
      email: 'a@x.com',
    });
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      '/businesses/b7/users/u1/reset-password',
      { password: null }
    );
  });
});

describe('resendBusinessInvite', () => {
  it('posts to the business resend endpoint with an empty body', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      invite_sent: true,
      email: 'owner@x.com',
    });
    const result = await resendBusinessInvite('b9');
    expect(api.post).toHaveBeenCalledWith('/businesses/b9/resend-invite', {});
    expect(result).toEqual({ invite_sent: true, email: 'owner@x.com' });
  });

  it('returns the temporary password when email is not configured', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      invite_sent: false,
      temporary_password: 'Abc123xyz',
      email: 'owner@x.com',
    });
    const result = await resendBusinessInvite('b9');
    expect(result.invite_sent).toBe(false);
    expect(result.temporary_password).toBe('Abc123xyz');
  });

  it('lets API errors reach the caller', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('already set up'));
    await expect(resendBusinessInvite('b9')).rejects.toThrow('already set up');
  });
});

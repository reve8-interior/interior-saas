import { describe, expect, it } from 'vitest';
import { generateTempPassword, validateMemberForm } from '../teamForm';

describe('generateTempPassword', () => {
  it('has the requested length and avoids look-alike characters', () => {
    const pw = generateTempPassword(20);
    expect(pw).toHaveLength(20);
    expect(pw).not.toMatch(/[01OIl]/);
  });
  it('differs between calls', () => {
    expect(generateTempPassword()).not.toBe(generateTempPassword());
  });
});

describe('validateMemberForm', () => {
  it('accepts a blank password for a new member (an invite is emailed)', () => {
    expect(validateMemberForm({ email: 'a@b.co', password: '' }, true)).toEqual(
      {}
    );
    expect(validateMemberForm({ email: 'a@b.co' }, true)).toEqual({});
  });
  it('still rejects a typed password that is too short', () => {
    expect(
      validateMemberForm({ email: 'a@b.co', password: '1234567' }, true)
        .password
    ).toMatch(/8/);
    expect(
      validateMemberForm({ email: 'a@b.co', password: '12345678' }, true)
    ).toEqual({});
  });
  it('reports an email problem even when the password is blank', () => {
    expect(validateMemberForm({ email: '', password: '' }, true).email).toBe(
      'Email is required'
    );
  });
  it('requires a valid email', () => {
    expect(validateMemberForm({ email: ' ', password: '' }, false).email).toBe(
      'Email is required'
    );
    expect(
      validateMemberForm({ email: 'a@b', password: '' }, false).email
    ).toMatch(/valid/);
    expect(
      validateMemberForm({ email: 'a@b.co', password: '' }, false)
    ).toEqual({});
  });
  it('checks password length only for new members', () => {
    expect(
      validateMemberForm({ email: 'a@b.co', password: 'short' }, true).password
    ).toMatch(/8/);
    expect(
      validateMemberForm({ email: 'a@b.co', password: 'short' }, false)
    ).toEqual({});
  });
});

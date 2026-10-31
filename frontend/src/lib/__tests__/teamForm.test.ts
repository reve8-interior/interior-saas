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

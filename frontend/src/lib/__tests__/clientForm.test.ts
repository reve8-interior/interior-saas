import { describe, expect, it } from 'vitest';
import type { Client } from '../schemas/client';
import {
  EMPTY_CLIENT_FORM,
  clientFormFrom,
  clientPayload,
  isValidEmail,
} from '../clientForm';

describe('isValidEmail', () => {
  it.each(['a@b.co', 'first.last@x.in'])('accepts %s', (v) =>
    expect(isValidEmail(v)).toBe(true)
  );
  it.each(['', 'a@b', 'a b@c.co', '@x.co'])('rejects %j', (v) =>
    expect(isValidEmail(v)).toBe(false)
  );
});

describe('clientPayload', () => {
  it('omits budget and nulls notes when blank', () => {
    const p = clientPayload({ ...EMPTY_CLIENT_FORM, name: 'Asha' });
    expect(p.contact_info).toEqual({ phone: '', email: '', address: '' });
    expect(p.notes).toBeNull();
  });

  it('trims the name and keeps budget when set', () => {
    const p = clientPayload({
      ...EMPTY_CLIENT_FORM,
      name: '  Asha ',
      budget: '5L',
      notes: 'n',
    });
    expect(p.name).toBe('Asha');
    expect(p.contact_info.budget).toBe('5L');
    expect(p.notes).toBe('n');
  });
});

describe('clientFormFrom', () => {
  it('fills missing contact fields with empty strings', () => {
    const c = {
      name: 'X',
      contact_info: { phone: '1' },
      notes: null,
    } as unknown as Client;
    expect(clientFormFrom(c)).toEqual({
      ...EMPTY_CLIENT_FORM,
      name: 'X',
      phone: '1',
    });
  });

  it('tolerates a null contact_info', () => {
    const c = {
      name: 'X',
      contact_info: null,
      notes: 'hi',
    } as unknown as Client;
    expect(clientFormFrom(c).notes).toBe('hi');
  });
});

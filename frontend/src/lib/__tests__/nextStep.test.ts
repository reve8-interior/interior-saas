import { describe, expect, it } from 'vitest';
import { nextStep } from '@/lib/nextStep';

const empty = {
  reviewCheckpointId: null,
  hasRows: false,
  hasVersions: false,
  hasDesigns: false,
};

describe('nextStep', () => {
  it('starts on the quotation, not on meeting notes', () => {
    expect(nextStep('/c', empty)?.href).toBe('/c/quotation');
  });
  it('sends a hand-built quotation on to its first version', () => {
    expect(nextStep('/c', { ...empty, hasRows: true })?.href).toBe(
      '/c/versions?new=1'
    );
  });
  it('puts rows waiting for review first', () => {
    expect(
      nextStep('/c', { ...empty, hasRows: true, reviewCheckpointId: 'm1' })
        ?.href
    ).toBe('/c/checkpoints#checkpoint-m1');
  });
  it('is done when everything exists', () => {
    expect(
      nextStep('/c', {
        ...empty,
        hasRows: true,
        hasVersions: true,
        hasDesigns: true,
      })
    ).toBeNull();
  });
});

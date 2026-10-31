import { Armchair, Couch, Lamp, LampPendant } from '@phosphor-icons/react';
import { describe, expect, it } from 'vitest';
import { hotspotIcon } from '../hotspotIcons';

describe('hotspotIcon', () => {
  it('matches common interior items by label', () => {
    expect(hotspotIcon('Floor lamp')).toBe(Lamp);
    expect(hotspotIcon('Living room sofa')).toBe(Couch);
    expect(hotspotIcon('Accent armchair')).toBe(Armchair);
  });

  it('prefers the specific word over the general one', () => {
    expect(hotspotIcon('Pendant light')).toBe(LampPendant);
  });

  it('ignores case', () => {
    expect(hotspotIcon('SOFA')).toBe(Couch);
  });

  it('returns null when nothing fits', () => {
    expect(hotspotIcon('Thing 3')).toBeNull();
    expect(hotspotIcon('')).toBeNull();
  });
});

describe('hotspotIcon with a picked key', () => {
  it('uses the picked icon over the label', () => {
    expect(hotspotIcon('Thing 3', 'sofa')).toBe(Couch);
    expect(hotspotIcon('Pendant light', 'armchair')).toBe(Armchair);
  });

  it('shows the number when asked to', () => {
    expect(hotspotIcon('Sofa', 'number')).toBeNull();
  });

  it('falls back to the label for an unknown key', () => {
    expect(hotspotIcon('Sofa', 'nope')).toBe(Couch);
  });
});

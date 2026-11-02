import { describe, expect, it } from 'vitest';
import { formatUsd } from '@/lib/aiModels';

describe('formatUsd', () => {
  it('shows a dash when unpriced', () => expect(formatUsd(null)).toBe('—'));
  it('shows $0 for zero', () => expect(formatUsd('0')).toBe('$0'));
  it('keeps 4 decimals below a cent', () =>
    expect(formatUsd('0.00281')).toBe('$0.0028'));
  it('uses 2 decimals otherwise', () =>
    expect(formatUsd('0.1234')).toBe('$0.12'));
});

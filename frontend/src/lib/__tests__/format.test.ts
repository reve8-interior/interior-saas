import { fmtInr, fmtRate, fmtSpeed, fmtUsd } from '@/lib/format';

describe('fmtUsd', () => {
  it('renders zero as $0.00', () => expect(fmtUsd(0)).toBe('$0.00'));
  it('keeps 4 decimals for sub-cent spend', () =>
    expect(fmtUsd(0.0028)).toBe('$0.0028'));
  it('uses 2 decimals from one cent up', () => {
    expect(fmtUsd(0.01)).toBe('$0.01');
    expect(fmtUsd(12.345)).toBe('$12.35');
  });
});

describe('fmtInr', () => {
  it.each([
    [850, '₹850'],
    [1000, '₹1K'],
    [12_500, '₹12.5K'],
    [100_000, '₹1L'],
    [4_550_000, '₹45.5L'],
    [12_000_000, '₹1.2Cr'],
  ])('%d -> %s', (n, expected) => expect(fmtInr(n)).toBe(expected));
});

describe('fmtSpeed', () => {
  it('shows ms below one second', () => expect(fmtSpeed(850.4)).toBe('850ms'));
  it('shows seconds from 1000ms', () => expect(fmtSpeed(1234)).toBe('1.2s'));
});

describe('fmtRate', () => {
  it.each([
    [1250.5, '₹1,250.5'],
    ['1250', '₹1,250'],
    [0, '₹0'],
    [1234567.891, '₹12,34,567.89'],
  ])('%s -> %s', (n, expected) => expect(fmtRate(n)).toBe(expected));
});

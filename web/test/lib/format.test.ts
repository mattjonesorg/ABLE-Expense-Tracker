import { describe, it, expect } from 'vitest';
import { formatCents, formatDate } from '../../src/lib/format';

describe('formatCents', () => {
  it('formats zero cents as $0.00', () => {
    expect(formatCents(0)).toBe('$0.00');
  });

  it('formats small amounts correctly', () => {
    expect(formatCents(99)).toBe('$0.99');
  });

  it('formats whole dollar amounts', () => {
    expect(formatCents(7500)).toBe('$75.00');
  });

  it('formats amounts with cents', () => {
    expect(formatCents(12350)).toBe('$123.50');
  });

  it('formats large amounts with comma separators', () => {
    expect(formatCents(250000)).toBe('$2,500.00');
  });

  it('formats very large amounts', () => {
    expect(formatCents(10000000)).toBe('$100,000.00');
  });
});

describe('formatDate', () => {
  it('formats a date string to readable format', () => {
    expect(formatDate('2026-02-15')).toBe('Feb 15, 2026');
  });

  it('formats January dates', () => {
    expect(formatDate('2026-01-28')).toBe('Jan 28, 2026');
  });

  it('formats single-digit days without leading zero', () => {
    expect(formatDate('2026-03-5')).toBe('Mar 5, 2026');
  });

  it('formats December dates', () => {
    expect(formatDate('2025-12-25')).toBe('Dec 25, 2025');
  });
});

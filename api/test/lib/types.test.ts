import { describe, it, expect } from 'vitest';
import { ABLE_CATEGORIES } from '../../src/lib/types.js';

describe('ABLE Categories', () => {
  it('should have exactly 11 categories', () => {
    expect(ABLE_CATEGORIES).toHaveLength(11);
  });

  it('should include Education', () => {
    expect(ABLE_CATEGORIES).toContain('Education');
  });

  it('should include Basic living expenses', () => {
    expect(ABLE_CATEGORIES).toContain('Basic living expenses');
  });
});

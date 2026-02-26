import { describe, it, expect } from 'vitest';
import {
  CATEGORY_OPTIONS,
  CATEGORY_FILTER_OPTIONS,
} from '../../src/lib/categories';
import { ABLE_CATEGORIES } from '../../src/lib/types';

describe('CATEGORY_OPTIONS', () => {
  it('contains all 11 ABLE categories', () => {
    expect(CATEGORY_OPTIONS).toHaveLength(11);
  });

  it('has value and label for each category', () => {
    for (const option of CATEGORY_OPTIONS) {
      expect(option).toHaveProperty('value');
      expect(option).toHaveProperty('label');
      expect(typeof option.value).toBe('string');
      expect(typeof option.label).toBe('string');
    }
  });

  it('includes all ABLE categories from the types module', () => {
    const values = CATEGORY_OPTIONS.map((o) => o.value);
    for (const category of ABLE_CATEGORIES) {
      expect(values).toContain(category);
    }
  });
});

describe('CATEGORY_FILTER_OPTIONS', () => {
  it('contains 12 options (All + 11 categories)', () => {
    expect(CATEGORY_FILTER_OPTIONS).toHaveLength(12);
  });

  it('has "All categories" as the first option with empty string value', () => {
    expect(CATEGORY_FILTER_OPTIONS[0]).toEqual({
      value: '',
      label: 'All categories',
    });
  });
});

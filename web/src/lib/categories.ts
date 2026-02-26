/**
 * ABLE category helpers for UI display.
 * Provides select options and formatting utilities for the 11 IRS-qualified categories.
 */
import { ABLE_CATEGORIES, type AbleCategory } from './types';

export interface CategoryOption {
  value: AbleCategory;
  label: string;
}

/**
 * Category options for Mantine Select components.
 * Each entry maps a category value to its display label.
 */
export const CATEGORY_OPTIONS: CategoryOption[] = ABLE_CATEGORIES.map(
  (category) => ({
    value: category,
    label: category,
  }),
);

/**
 * Category options with an "All" option prepended, for filter dropdowns.
 */
export const CATEGORY_FILTER_OPTIONS: Array<{ value: string; label: string }> =
  [{ value: '', label: 'All categories' }, ...CATEGORY_OPTIONS];

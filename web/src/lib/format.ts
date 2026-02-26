/**
 * Formatting utilities for display values.
 */
import dayjs from 'dayjs';

/**
 * Format an amount in cents to a dollar string with $ prefix.
 * Examples: 7500 -> "$75.00", 12350 -> "$123.50", 250000 -> "$2,500.00"
 */
export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(dollars);
}

/**
 * Format an ISO date string (YYYY-MM-DD) to a readable format.
 * Example: "2026-02-15" -> "Feb 15, 2026"
 */
export function formatDate(dateStr: string): string {
  return dayjs(dateStr).format('MMM D, YYYY');
}

import type { Page } from '@playwright/test';

/**
 * Navigate to a page via the sidebar navigation.
 */
export async function navigateTo(
  page: Page,
  label: 'Dashboard' | 'Expenses' | 'Reimbursements' | 'Reports' | 'New Expense',
): Promise<void> {
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await nav.getByText(label, { exact: true }).click();
}

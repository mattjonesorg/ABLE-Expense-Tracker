import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { SEED_EXPENSES, SEED_VENDORS } from './helpers/seed-data';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // Skip: /dashboard/reimbursements is a 501 stub; Promise.all fails entirely. See #144
  test.skip('displays recent expenses section with seeded data', async ({ page }) => {
    // Wait for data to load — "Recent Expenses" heading only appears when data exists
    await expect(
      page.getByRole('heading', { name: 'Recent Expenses' }),
    ).toBeVisible({ timeout: 15_000 });

    // All 3 seeded vendors should appear in recent expenses
    for (const vendor of SEED_VENDORS) {
      await expect(page.getByText(vendor).first()).toBeVisible();
    }
  });

  // Skip: /dashboard/reimbursements is a 501 stub; Promise.all fails entirely. See #144
  test.skip('displays reimbursement summary', async ({ page }) => {
    // Wait for data to load — "Total Unreimbursed" only appears when data exists
    await expect(
      page.getByText('Total Unreimbursed'),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('quick action links navigate correctly', async ({ page }) => {
    // Quick Actions section renders immediately (no data dependency)
    await page.getByRole('heading', { name: 'Quick Actions' }).waitFor();

    // Click "Add Expense" quick action card
    await page.getByText('Add Expense').first().click();
    await expect(page).toHaveURL(/\/expenses\/new/);
    await expect(
      page.getByRole('heading', { name: 'New Expense' }),
    ).toBeVisible();
  });

  test('quick action "View Expenses" navigates to expenses list', async ({ page }) => {
    await page.getByRole('heading', { name: 'Quick Actions' }).waitFor();

    await page.getByText('View Expenses').click();
    await expect(page).toHaveURL(/\/expenses$/);
    await expect(
      page.getByRole('heading', { name: 'Expenses' }),
    ).toBeVisible();
  });

  // Skip: /dashboard/reimbursements is a 501 stub; Promise.all fails entirely. See #144
  test.skip('displays formatted amounts for seeded expenses', async ({ page }) => {
    // Wait for data to load
    await expect(
      page.getByRole('heading', { name: 'Recent Expenses' }),
    ).toBeVisible({ timeout: 15_000 });

    // Check that at least one of the seeded amounts appears
    for (const expense of SEED_EXPENSES) {
      await expect(page.getByText(expense.amountFormatted).first()).toBeVisible();
    }
  });
});

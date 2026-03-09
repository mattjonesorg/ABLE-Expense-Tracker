import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { SEED_EXPENSES, SEED_VENDORS } from './helpers/seed-data';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('displays recent expenses section with seeded data', async ({ page }) => {
    // Wait for loading to finish
    await expect(
      page.getByRole('heading', { name: 'Recent Expenses' }),
    ).toBeVisible();

    // All 3 seeded vendors should appear in recent expenses
    for (const vendor of SEED_VENDORS) {
      await expect(page.getByText(vendor)).toBeVisible();
    }
  });

  test('displays reimbursement summary', async ({ page }) => {
    // The Reimbursements section should show total unreimbursed
    await expect(
      page.getByText('Total Unreimbursed'),
    ).toBeVisible();
  });

  test('quick action links navigate correctly', async ({ page }) => {
    // Click "Add Expense" quick action card
    await page.getByText('Add Expense').first().click();
    await expect(page).toHaveURL(/\/expenses\/new/);
    await expect(
      page.getByRole('heading', { name: 'New Expense' }),
    ).toBeVisible();
  });

  test('quick action "View Expenses" navigates to expenses list', async ({ page }) => {
    await page.getByText('View Expenses').click();
    await expect(page).toHaveURL(/\/expenses$/);
    await expect(
      page.getByRole('heading', { name: 'Expenses' }),
    ).toBeVisible();
  });

  test('displays formatted amounts for seeded expenses', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: 'Recent Expenses' }),
    ).toBeVisible();

    // Check that at least one of the seeded amounts appears
    for (const expense of SEED_EXPENSES) {
      await expect(page.getByText(expense.amountFormatted).first()).toBeVisible();
    }
  });
});

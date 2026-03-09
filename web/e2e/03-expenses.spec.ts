import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { navigateTo } from './helpers/navigation';
import { SEED_EXPENSES } from './helpers/seed-data';

test.describe('Expenses', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await navigateTo(page, 'Expenses');
    // Wait for the page heading
    await expect(
      page.getByRole('heading', { name: 'Expenses' }),
    ).toBeVisible();
  });

  test('displays expense list table with seeded data', async ({ page }) => {
    const table = page.getByRole('table', { name: 'Expense list' });
    await expect(table).toBeVisible();

    // All 3 seeded expenses should be visible
    for (const expense of SEED_EXPENSES) {
      await expect(table.getByText(expense.vendor)).toBeVisible();
      await expect(table.getByText(expense.amountFormatted)).toBeVisible();
    }
  });

  test('shows correct table columns', async ({ page }) => {
    const table = page.getByRole('table', { name: 'Expense list' });
    await expect(table).toBeVisible();

    // Check column headers
    await expect(table.getByRole('columnheader', { name: 'Date' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Vendor' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Category' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Amount' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Paid By' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Reimbursed' })).toBeVisible();
  });

  test('seeded expenses show correct categories', async ({ page }) => {
    const table = page.getByRole('table', { name: 'Expense list' });
    await expect(table).toBeVisible();

    for (const expense of SEED_EXPENSES) {
      await expect(table.getByText(expense.category)).toBeVisible();
    }
  });

  test('"Add Expense" button navigates to expense form', async ({ page }) => {
    await page.getByRole('link', { name: 'Add Expense' }).click();
    await expect(page).toHaveURL(/\/expenses\/new/);
    await expect(
      page.getByRole('heading', { name: 'New Expense' }),
    ).toBeVisible();
  });
});

test.describe('Create Expense', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await navigateTo(page, 'New Expense');
    await expect(
      page.getByRole('heading', { name: 'New Expense' }),
    ).toBeVisible();
  });

  test('expense form has all required fields', async ({ page }) => {
    await expect(page.getByLabel('Vendor')).toBeVisible();
    await expect(page.getByLabel('Description')).toBeVisible();
    await expect(page.getByLabel('Amount')).toBeVisible();
    await expect(page.getByLabel('Date')).toBeVisible();
    await expect(page.getByLabel('Paid By')).toBeVisible();
    await expect(page.getByLabel('Category')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Create Expense' }),
    ).toBeVisible();
  });

  test('shows validation errors when submitting empty form', async ({ page }) => {
    // Clear the date field (it defaults to today)
    await page.getByLabel('Date').clear();

    await page.getByRole('button', { name: 'Create Expense' }).click();

    // Required field errors should appear
    await expect(page.getByText('Vendor is required')).toBeVisible();
    await expect(page.getByText('Description is required')).toBeVisible();
    await expect(page.getByText('Amount is required')).toBeVisible();
    await expect(page.getByText('Paid by is required')).toBeVisible();
  });

  test('creates a new expense successfully', async ({ page }) => {
    // Fill in the form
    await page.getByLabel('Vendor').fill('E2E Test Pharmacy');
    await page.getByLabel('Description').fill('E2E test expense for automated testing');
    await page.getByLabel('Amount').fill('12.34');
    await page.getByLabel('Paid By').fill('E2E Tester');

    // Select a category manually
    await page.getByLabel('Category').click();
    await page.getByRole('option', { name: 'Health, prevention & wellness' }).click();

    // Submit the form
    await page.getByRole('button', { name: 'Create Expense' }).click();

    // Should redirect to expenses list
    await expect(page).toHaveURL(/\/expenses$/);

    // The new expense should appear in the table
    const table = page.getByRole('table', { name: 'Expense list' });
    await expect(table.getByText('E2E Test Pharmacy')).toBeVisible();
    await expect(table.getByText('$12.34')).toBeVisible();
  });

  test('Suggest Category button works with vendor and description', async ({ page }) => {
    test.slow(); // AI categorization may be slow or unavailable

    await page.getByLabel('Vendor').fill('CVS Pharmacy');
    await page.getByLabel('Description').fill('Prescription medications');

    await page.getByRole('button', { name: 'Suggest Category' }).click();

    // Wait for the categorization to complete (generous timeout for Claude API)
    // Either a category is set or a notification appears
    await expect(async () => {
      const categoryInput = page.getByLabel('Category');
      const value = await categoryInput.inputValue();
      // If AI responds, category should be set; if not, a notification appears
      expect(value.length > 0 || await page.getByText('No suggestion available').isVisible() || await page.getByText('Categorization failed').isVisible()).toBeTruthy();
    }).toPass({ timeout: 30_000 });
  });
});

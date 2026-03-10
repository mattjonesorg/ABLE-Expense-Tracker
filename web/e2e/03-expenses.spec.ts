import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { navigateTo } from './helpers/navigation';
import { SEED_EXPENSES } from './helpers/seed-data';

test.describe('Expenses', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await navigateTo(page, 'Expenses');
    await expect(
      page.getByRole('heading', { name: 'Expenses' }),
    ).toBeVisible();
  });

  test('displays expense list table with seeded data', async ({ page }) => {
    // Wait for the table to appear (only renders when data is loaded)
    const table = page.getByRole('table', { name: 'Expense list' });
    await expect(table).toBeVisible({ timeout: 15_000 });

    // All 3 seeded expenses should be visible
    for (const expense of SEED_EXPENSES) {
      await expect(table.getByText(expense.vendor)).toBeVisible();
      await expect(table.getByText(expense.amountFormatted).first()).toBeVisible();
    }
  });

  test('shows correct table columns', async ({ page }) => {
    const table = page.getByRole('table', { name: 'Expense list' });
    await expect(table).toBeVisible({ timeout: 15_000 });

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
    await expect(table).toBeVisible({ timeout: 15_000 });

    for (const expense of SEED_EXPENSES) {
      await expect(table.getByText(expense.category).first()).toBeVisible();
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
    await expect(page.getByRole('textbox', { name: 'Category' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Create Expense' }),
    ).toBeVisible();
  });

  test('shows validation errors when submitting empty form', async ({ page }) => {
    // Clear the date field (it defaults to today) — triple-click to select all, then delete
    const dateInput = page.getByLabel('Date');
    await dateInput.click({ clickCount: 3 });
    await dateInput.press('Backspace');

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

    // NumberInput needs click first, then type the value
    const amountInput = page.getByLabel('Amount');
    await amountInput.click();
    await amountInput.fill('12.34');

    await page.getByLabel('Paid By').fill('E2E Tester');

    // Select a category — click input to open dropdown, then click option
    await page.getByRole('textbox', { name: 'Category' }).click();
    await page.getByRole('option', { name: 'Health, prevention & wellness' }).click();

    // Submit the form
    await page.getByRole('button', { name: 'Create Expense' }).click();

    // Should redirect to expenses list
    await expect(page).toHaveURL(/\/expenses$/, { timeout: 10_000 });

    // The new expense should appear in the table
    const table = page.getByRole('table', { name: 'Expense list' });
    await expect(table).toBeVisible({ timeout: 15_000 });
    await expect(table.getByText('E2E Test Pharmacy')).toBeVisible();
  });

  test('Suggest Category button works with vendor and description', async ({ page }) => {
    test.slow(); // AI categorization may be slow or unavailable

    await page.getByLabel('Vendor').fill('CVS Pharmacy');
    await page.getByLabel('Description').fill('Prescription medications');

    await page.getByRole('button', { name: 'Suggest Category' }).click();

    // Wait for the categorization to complete (generous timeout for Claude API)
    await expect(async () => {
      const suggestButton = page.getByRole('button', { name: 'Suggest Category' });
      const isDisabled = await suggestButton.isDisabled();
      if (isDisabled) {
        throw new Error('Still categorizing');
      }
    }).toPass({ timeout: 30_000 });
  });
});

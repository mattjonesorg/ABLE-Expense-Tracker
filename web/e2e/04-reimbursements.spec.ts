import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { navigateTo } from './helpers/navigation';

/**
 * Helper to create an expense via the form and return to expenses list.
 */
async function createExpense(
  page: import('@playwright/test').Page,
  vendor: string,
  amount: string,
  paidBy: string,
  category: string,
) {
  await navigateTo(page, 'New Expense');
  await expect(page.getByRole('heading', { name: 'New Expense' })).toBeVisible();

  await page.getByLabel('Vendor').fill(vendor);
  await page.getByLabel('Description').fill(`Test expense for ${vendor}`);
  const amountInput = page.getByLabel('Amount');
  await amountInput.click();
  await amountInput.fill(amount);
  await page.getByLabel('Paid By').fill(paidBy);
  await page.getByRole('textbox', { name: 'Category' }).click();
  await page.getByRole('option', { name: category }).click();
  await page.getByRole('button', { name: 'Create Expense' }).click();
  await expect(page).toHaveURL(/\/expenses$/, { timeout: 10_000 });
}

test.describe('Reimbursements', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('displays unreimbursed expenses from seeded data', async ({ page }) => {
    await navigateTo(page, 'Reimbursements');
    await expect(
      page.getByRole('heading', { name: 'Reimbursements' }),
    ).toBeVisible();

    // Total Unreimbursed section should be visible (only when data exists)
    await expect(page.getByText('Total Unreimbursed')).toBeVisible({ timeout: 15_000 });

    // Unreimbursed Expenses heading and table should be visible
    await expect(
      page.getByRole('heading', { name: 'Unreimbursed Expenses' }),
    ).toBeVisible();
    const table = page.getByRole('table', { name: 'Unreimbursed expenses' });
    await expect(table).toBeVisible();
  });

  test('shows per-person reimbursement summary cards', async ({ page }) => {
    await navigateTo(page, 'Reimbursements');
    await expect(
      page.getByText('Total Unreimbursed'),
    ).toBeVisible({ timeout: 15_000 });

    // Seeded data has expenses paid by "Test User" and "Family Member"
    await expect(page.getByText('Test User').first()).toBeVisible();
    await expect(page.getByText('Family Member').first()).toBeVisible();
  });
});

test.describe('Single Reimbursement', () => {
  /**
   * To avoid mutating seed data, we create a fresh expense, then reimburse it.
   */
  test('mark a single expense as reimbursed', async ({ page }) => {
    await login(page);

    // Create a test expense to reimburse
    await createExpense(page, 'E2E Reimburse Single', '25.00', 'E2E Tester', 'Health, prevention & wellness');

    // Navigate to Reimbursements and wait for data
    await navigateTo(page, 'Reimbursements');
    await expect(
      page.getByText('Total Unreimbursed'),
    ).toBeVisible({ timeout: 15_000 });

    // Find our test expense in the table
    const table = page.getByRole('table', { name: 'Unreimbursed expenses' });
    await expect(table).toBeVisible();
    const row = table.getByRole('row').filter({ hasText: 'E2E Reimburse Single' });
    await expect(row).toBeVisible({ timeout: 10_000 });

    // Accept the confirm dialog before clicking
    page.on('dialog', (dialog) => dialog.accept());

    await row.getByRole('button', { name: /Mark .* expense as reimbursed/ }).click();

    // After reimbursement, the expense should no longer appear in unreimbursed list
    await expect(
      table.getByText('E2E Reimburse Single'),
    ).not.toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Bulk Reimbursement', () => {
  /**
   * Create 2 expenses, select them via checkboxes, and bulk reimburse.
   */
  test('bulk reimburse multiple expenses via checkboxes and modal', async ({ page }) => {
    await login(page);

    // Create two test expenses with the same paidBy
    await createExpense(page, 'E2E Bulk Test A', '15.00', 'Bulk Tester', 'Transportation');
    await createExpense(page, 'E2E Bulk Test B', '20.00', 'Bulk Tester', 'Transportation');

    // Navigate to Reimbursements and wait for data
    await navigateTo(page, 'Reimbursements');
    await expect(
      page.getByText('Total Unreimbursed'),
    ).toBeVisible({ timeout: 15_000 });

    const table = page.getByRole('table', { name: 'Unreimbursed expenses' });
    await expect(table).toBeVisible();

    // Wait for both expenses to appear
    await expect(table.getByText('E2E Bulk Test A')).toBeVisible({ timeout: 10_000 });
    await expect(table.getByText('E2E Bulk Test B')).toBeVisible({ timeout: 10_000 });

    // Select both test expenses via checkboxes
    const rowA = table.getByRole('row').filter({ hasText: 'E2E Bulk Test A' });
    const rowB = table.getByRole('row').filter({ hasText: 'E2E Bulk Test B' });

    await rowA.getByRole('checkbox').check();
    await rowB.getByRole('checkbox').check();

    // Sticky bar should appear with selection count
    await expect(page.getByText('2 selected')).toBeVisible();

    // Click "Reimburse Selected" to open confirmation modal
    await page.getByRole('button', { name: 'Reimburse Selected' }).click();

    // Confirmation modal should appear
    await expect(
      page.getByText('Confirm Bulk Reimbursement'),
    ).toBeVisible();

    // Modal should list both expenses
    await expect(page.getByText('E2E Bulk Test A')).toBeVisible();
    await expect(page.getByText('E2E Bulk Test B')).toBeVisible();

    // Confirm the bulk reimbursement
    await page.getByRole('button', { name: 'Confirm' }).click();

    // After reimbursement, both expenses should disappear from unreimbursed list
    await expect(
      table.getByText('E2E Bulk Test A'),
    ).not.toBeVisible({ timeout: 15_000 });
    await expect(
      table.getByText('E2E Bulk Test B'),
    ).not.toBeVisible({ timeout: 15_000 });
  });

  test('Select All button selects all expenses for a person', async ({ page }) => {
    await login(page);
    await navigateTo(page, 'Reimbursements');

    // Wait for data to load
    await expect(
      page.getByText('Total Unreimbursed'),
    ).toBeVisible({ timeout: 15_000 });

    // Click "Select All" for one of the paidBy groups
    const selectAllButtons = page.getByRole('button', { name: /Select all for/ });
    await expect(selectAllButtons.first()).toBeVisible();

    // Click the first "Select All" button
    await selectAllButtons.first().click();

    // Sticky bar should appear with selected count
    await expect(page.getByText(/\d+ selected/)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Reimburse Selected' }),
    ).toBeVisible();
  });
});

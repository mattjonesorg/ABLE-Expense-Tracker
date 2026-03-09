import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';
import { navigateTo } from './helpers/navigation';

test.describe('Reimbursements', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('displays unreimbursed expenses from seeded data', async ({ page }) => {
    await navigateTo(page, 'Reimbursements');
    await expect(
      page.getByRole('heading', { name: 'Reimbursements' }),
    ).toBeVisible();

    // Total Unreimbursed section should be visible
    await expect(page.getByText('Total Unreimbursed')).toBeVisible();

    // Unreimbursed expenses table should be visible
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
    ).toBeVisible();

    // Seeded data has expenses paid by "Test User" and "Family Member"
    await expect(page.getByText('Test User')).toBeVisible();
    await expect(page.getByText('Family Member')).toBeVisible();
  });
});

test.describe('Single Reimbursement', () => {
  /**
   * To avoid mutating seed data, we create a fresh expense, then reimburse it.
   */
  test('mark a single expense as reimbursed', async ({ page }) => {
    await login(page);

    // Create a test expense to reimburse
    await navigateTo(page, 'New Expense');
    await page.getByLabel('Vendor').fill('E2E Reimburse Single');
    await page.getByLabel('Description').fill('Single reimbursement test');
    await page.getByLabel('Amount').fill('25.00');
    await page.getByLabel('Paid By').fill('E2E Tester');
    await page.getByLabel('Category').click();
    await page.getByRole('option', { name: 'Health, prevention & wellness' }).click();
    await page.getByRole('button', { name: 'Create Expense' }).click();
    await expect(page).toHaveURL(/\/expenses$/);

    // Navigate to Reimbursements
    await navigateTo(page, 'Reimbursements');
    await expect(
      page.getByRole('heading', { name: 'Unreimbursed Expenses' }),
    ).toBeVisible();

    // Find and click "Mark Reimbursed" for our test expense
    const table = page.getByRole('table', { name: 'Unreimbursed expenses' });
    const row = table.getByRole('row').filter({ hasText: 'E2E Reimburse Single' });
    await expect(row).toBeVisible();

    // Accept the confirm dialog
    page.on('dialog', (dialog) => dialog.accept());

    await row.getByRole('button', { name: /Mark .* expense as reimbursed/ }).click();

    // After reimbursement, the expense should no longer appear in unreimbursed list
    await expect(
      table.getByText('E2E Reimburse Single'),
    ).not.toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Bulk Reimbursement', () => {
  /**
   * Create 2 expenses, select them via checkboxes, and bulk reimburse.
   */
  test('bulk reimburse multiple expenses via checkboxes and modal', async ({ page }) => {
    await login(page);

    // Create first test expense
    await navigateTo(page, 'New Expense');
    await page.getByLabel('Vendor').fill('E2E Bulk Test A');
    await page.getByLabel('Description').fill('Bulk reimbursement test A');
    await page.getByLabel('Amount').fill('15.00');
    await page.getByLabel('Paid By').fill('Bulk Tester');
    await page.getByLabel('Category').click();
    await page.getByRole('option', { name: 'Transportation' }).click();
    await page.getByRole('button', { name: 'Create Expense' }).click();
    await expect(page).toHaveURL(/\/expenses$/);

    // Create second test expense
    await navigateTo(page, 'New Expense');
    await page.getByLabel('Vendor').fill('E2E Bulk Test B');
    await page.getByLabel('Description').fill('Bulk reimbursement test B');
    await page.getByLabel('Amount').fill('20.00');
    await page.getByLabel('Paid By').fill('Bulk Tester');
    await page.getByLabel('Category').click();
    await page.getByRole('option', { name: 'Transportation' }).click();
    await page.getByRole('button', { name: 'Create Expense' }).click();
    await expect(page).toHaveURL(/\/expenses$/);

    // Navigate to Reimbursements
    await navigateTo(page, 'Reimbursements');
    await expect(
      page.getByRole('heading', { name: 'Unreimbursed Expenses' }),
    ).toBeVisible();

    const table = page.getByRole('table', { name: 'Unreimbursed expenses' });

    // Select both test expenses via checkboxes
    const rowA = table.getByRole('row').filter({ hasText: 'E2E Bulk Test A' });
    const rowB = table.getByRole('row').filter({ hasText: 'E2E Bulk Test B' });

    await rowA.getByRole('checkbox').check();
    await rowB.getByRole('checkbox').check();

    // Sticky bar should appear with selection count
    await expect(page.getByText('2 selected')).toBeVisible();
    await expect(page.getByText('$35.00')).toBeVisible();

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
    ).not.toBeVisible({ timeout: 10_000 });
    await expect(
      table.getByText('E2E Bulk Test B'),
    ).not.toBeVisible({ timeout: 10_000 });
  });

  test('Select All button selects all expenses for a person', async ({ page }) => {
    await login(page);
    await navigateTo(page, 'Reimbursements');
    await expect(
      page.getByText('Total Unreimbursed'),
    ).toBeVisible();

    // Click "Select All" for one of the paidBy groups
    const selectAllButtons = page.getByRole('button', { name: /Select all for/ });
    const count = await selectAllButtons.count();

    // There should be at least 1 "Select All" button (one per paidBy group)
    expect(count).toBeGreaterThan(0);

    // Click the first "Select All" button
    await selectAllButtons.first().click();

    // Sticky bar should appear with selected count
    await expect(page.getByText(/\d+ selected/)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Reimburse Selected' }),
    ).toBeVisible();
  });
});

/**
 * Constants matching the seeded test data from scripts/seed-test-data.mjs.
 *
 * Account: ACCT-E2E-TEST
 * These expenses are pre-loaded before E2E tests run.
 */

export const SEED_EXPENSES = [
  {
    id: 'e2e-expense-001',
    vendor: 'CVS Pharmacy',
    description: 'Monthly prescription medications',
    amount: 4500, // cents
    amountFormatted: '$45.00',
    category: 'Health, prevention & wellness',
    paidBy: 'Test User',
  },
  {
    id: 'e2e-expense-002',
    vendor: 'Whole Foods',
    description: 'Weekly groceries',
    amount: 8725, // cents
    amountFormatted: '$87.25',
    category: 'Basic living expenses',
    paidBy: 'Test User',
  },
  {
    id: 'e2e-expense-003',
    vendor: 'City Transit',
    description: 'Monthly bus pass',
    amount: 7500, // cents
    amountFormatted: '$75.00',
    category: 'Transportation',
    paidBy: 'Family Member',
  },
] as const;

export const SEED_VENDORS = SEED_EXPENSES.map((e) => e.vendor);

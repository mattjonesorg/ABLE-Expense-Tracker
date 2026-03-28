#!/usr/bin/env node

// Schema source of truth: api/src/lib/dynamo.ts

/**
 * Seeds a test account with realistic sample expenses across all 11 ABLE categories.
 *
 * Assumes the test account and user already exist (created by create-test-account.mjs).
 *
 * Required environment variables:
 *   AWS_REGION    — AWS region
 *   TABLE_NAME    — DynamoDB table name
 *   ACCOUNT_ID    — The test account ID to seed
 *   SUBMITTED_BY  — Email of the user submitting expenses
 *
 * Optional:
 *   PAID_BY_ALT   — Display name of a second payer (for multi-user testing)
 */

import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

const AWS_REGION = requiredEnv('AWS_REGION');
const TABLE_NAME = requiredEnv('TABLE_NAME');
const ACCOUNT_ID = requiredEnv('ACCOUNT_ID');
const SUBMITTED_BY = requiredEnv('SUBMITTED_BY');
const PAID_BY_ALT = process.env.PAID_BY_ALT || '';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`ERROR: Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

/**
 * Generate a simple unique ID for expenses.
 */
function generateExpenseId(prefix) {
  const rand = randomBytes(4).toString('hex');
  return `${prefix}-${rand}`;
}

/**
 * Insert a DynamoDB item via the AWS CLI.
 */
function dynamoPutItem(item) {
  const putItemInput = JSON.stringify({
    TableName: TABLE_NAME,
    Item: item,
  });

  execSync(
    `aws dynamodb put-item --cli-input-json '${putItemInput.replace(/'/g, "'\\''")}'`,
    { stdio: 'pipe' },
  );
}

/**
 * Build a DynamoDB expense item in DynamoDB JSON format.
 */
function buildExpenseItem(expense) {
  const reimbursedFlag = expense.reimbursed ? '1' : '0';
  const item = {
    PK: { S: `ACCOUNT#${ACCOUNT_ID}` },
    SK: { S: `EXP#${expense.date}#${expense.id}` },
    GSI1PK: { S: `ACCOUNT#${ACCOUNT_ID}` },
    GSI1SK: { S: `CAT#${expense.category}#${expense.date}` },
    GSI2PK: { S: `ACCOUNT#${ACCOUNT_ID}` },
    GSI2SK: { S: `PAID#${expense.paidBy}#${reimbursedFlag}#${expense.date}` },
    expenseId: { S: expense.id },
    accountId: { S: ACCOUNT_ID },
    vendor: { S: expense.vendor },
    description: { S: expense.description },
    amount: { N: String(expense.amount) },
    category: { S: expense.category },
    categoryConfidence: { S: expense.confidence || 'user_selected' },
    categoryNotes: { S: expense.notes || '' },
    receiptKey: { NULL: true },
    date: { S: expense.date },
    paidBy: { S: expense.paidBy },
    submittedBy: { S: SUBMITTED_BY },
    reimbursed: { BOOL: expense.reimbursed || false },
    reimbursedAt: expense.reimbursed
      ? { S: new Date().toISOString() }
      : { NULL: true },
    createdAt: { S: new Date().toISOString() },
    updatedAt: { S: new Date().toISOString() },
  };
  return item;
}

function getSampleExpenses() {
  const today = new Date();
  const primaryPayer = 'Test User';
  const altPayer = PAID_BY_ALT || 'Family Member';

  // Generate dates spread over the last 90 days
  function daysAgo(n) {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d.toISOString().split('T')[0];
  }

  return [
    // Education
    {
      id: generateExpenseId('seed'),
      vendor: 'Community College',
      description: 'Online course enrollment fee',
      amount: 35000,
      category: 'Education',
      date: daysAgo(85),
      paidBy: primaryPayer,
      confidence: 'ai_confirmed',
      notes: 'Directly education-related',
    },
    // Housing
    {
      id: generateExpenseId('seed'),
      vendor: 'City Apartments',
      description: 'Monthly rent payment',
      amount: 125000,
      category: 'Housing',
      date: daysAgo(60),
      paidBy: primaryPayer,
      confidence: 'ai_confirmed',
      notes: 'Primary residence expense',
    },
    // Transportation
    {
      id: generateExpenseId('seed'),
      vendor: 'City Transit Authority',
      description: 'Monthly bus and subway pass',
      amount: 7500,
      category: 'Transportation',
      date: daysAgo(45),
      paidBy: altPayer,
      confidence: 'ai_confirmed',
      notes: 'Public transportation',
    },
    // Employment training & support
    {
      id: generateExpenseId('seed'),
      vendor: 'Job Skills Center',
      description: 'Resume writing workshop',
      amount: 15000,
      category: 'Employment training & support',
      date: daysAgo(40),
      paidBy: primaryPayer,
      confidence: 'ai_suggested',
      notes: 'Vocational training service',
    },
    // Assistive technology & personal support
    {
      id: generateExpenseId('seed'),
      vendor: 'Assistive Tech Store',
      description: 'Screen reader software license',
      amount: 29900,
      category: 'Assistive technology & personal support',
      date: daysAgo(35),
      paidBy: primaryPayer,
      confidence: 'ai_confirmed',
      notes: 'Assistive technology for computer access',
    },
    // Health, prevention & wellness
    {
      id: generateExpenseId('seed'),
      vendor: 'CVS Pharmacy',
      description: 'Monthly prescription medications',
      amount: 4500,
      category: 'Health, prevention & wellness',
      date: daysAgo(30),
      paidBy: primaryPayer,
      confidence: 'ai_confirmed',
      notes: 'Prescription medication',
      reimbursed: true,
    },
    // Financial management & administrative
    {
      id: generateExpenseId('seed'),
      vendor: 'ABLE Account Services',
      description: 'Annual account maintenance fee',
      amount: 2500,
      category: 'Financial management & administrative',
      date: daysAgo(25),
      paidBy: altPayer,
      confidence: 'ai_confirmed',
      notes: 'ABLE account administration',
    },
    // Legal fees
    {
      id: generateExpenseId('seed'),
      vendor: 'Disability Law Center',
      description: 'Benefits eligibility consultation',
      amount: 20000,
      category: 'Legal fees',
      date: daysAgo(20),
      paidBy: primaryPayer,
      confidence: 'ai_suggested',
      notes: 'Legal consultation related to disability benefits',
    },
    // Oversight & monitoring
    {
      id: generateExpenseId('seed'),
      vendor: 'Trust Services Inc',
      description: 'Quarterly account review fee',
      amount: 7500,
      category: 'Oversight & monitoring',
      date: daysAgo(15),
      paidBy: primaryPayer,
      confidence: 'user_selected',
      notes: 'Account oversight service',
    },
    // Funeral & burial (pre-paid)
    {
      id: generateExpenseId('seed'),
      vendor: 'Memorial Planning Co',
      description: 'Pre-paid funeral plan installment',
      amount: 10000,
      category: 'Funeral & burial',
      date: daysAgo(10),
      paidBy: altPayer,
      confidence: 'ai_confirmed',
      notes: 'Pre-paid burial expense',
    },
    // Basic living expenses
    {
      id: generateExpenseId('seed'),
      vendor: 'Whole Foods Market',
      description: 'Weekly groceries',
      amount: 8725,
      category: 'Basic living expenses',
      date: daysAgo(5),
      paidBy: primaryPayer,
      confidence: 'ai_confirmed',
      notes: 'Food and grocery expenses',
    },
    // Extra expenses for variety
    {
      id: generateExpenseId('seed'),
      vendor: 'Uber',
      description: 'Medical appointment transportation',
      amount: 2450,
      category: 'Transportation',
      date: daysAgo(3),
      paidBy: altPayer,
      confidence: 'ai_suggested',
      notes: 'Ride to medical appointment',
    },
    {
      id: generateExpenseId('seed'),
      vendor: 'Walgreens',
      description: 'Over-the-counter wellness supplies',
      amount: 3299,
      category: 'Health, prevention & wellness',
      date: daysAgo(1),
      paidBy: primaryPayer,
      confidence: 'ai_confirmed',
      notes: 'Health and wellness products',
    },
  ];
}

function main() {
  console.log('=== Seed Test Account ===');
  console.log(`Region: ${AWS_REGION}`);
  console.log(`Table: ${TABLE_NAME}`);
  console.log(`Account ID: ${ACCOUNT_ID}`);
  console.log(`Submitted By: ${SUBMITTED_BY}`);
  console.log('');

  const expenses = getSampleExpenses();

  console.log(`Seeding ${expenses.length} expenses across all 11 ABLE categories...`);
  console.log('');

  let totalAmount = 0;
  const categoryCounts = {};

  for (const expense of expenses) {
    const item = buildExpenseItem(expense);
    dynamoPutItem(item);

    totalAmount += expense.amount;
    categoryCounts[expense.category] = (categoryCounts[expense.category] || 0) + 1;

    const status = expense.reimbursed ? ' [REIMBURSED]' : '';
    console.log(`  ${expense.vendor} — $${(expense.amount / 100).toFixed(2)} (${expense.category})${status}`);
  }

  console.log('');
  console.log('Summary:');
  console.log(`  Total expenses: ${expenses.length}`);
  console.log(`  Total amount: $${(totalAmount / 100).toFixed(2)}`);
  console.log(`  Categories covered: ${Object.keys(categoryCounts).length}/11`);
  console.log(`  Reimbursed: ${expenses.filter((e) => e.reimbursed).length}`);
  console.log(`  Unreimbursed: ${expenses.filter((e) => !e.reimbursed).length}`);
  console.log('');

  console.log('Category breakdown:');
  for (const [cat, count] of Object.entries(categoryCounts).sort()) {
    console.log(`  ${cat}: ${count}`);
  }

  console.log('');
  console.log('Seeding complete.');
}

try {
  main();
} catch (err) {
  console.error('Seed test account failed:', err.message);
  process.exit(1);
}

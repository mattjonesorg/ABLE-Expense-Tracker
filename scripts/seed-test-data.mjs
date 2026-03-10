#!/usr/bin/env node

/**
 * Seeds test data into an ephemeral PR environment.
 *
 * Creates a test user in Cognito and inserts sample expenses into DynamoDB.
 * Uses the Cognito REST API and AWS CLI (no SDK dependencies).
 *
 * Required environment variables:
 *   AWS_REGION        — AWS region
 *   USER_POOL_ID      — Cognito User Pool ID
 *   CLIENT_ID         — Cognito User Pool Client ID
 *   TABLE_NAME        — DynamoDB table name
 *   E2E_TEST_EMAIL    — Email for the test user
 *   E2E_TEST_PASSWORD — Password for the test user (must meet Cognito policy)
 *
 * Outputs (GITHUB_OUTPUT):
 *   E2E_EMAIL     — Test user email
 *   E2E_PASSWORD  — Test user password
 */

import { appendFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const AWS_REGION = requiredEnv('AWS_REGION');
const USER_POOL_ID = requiredEnv('USER_POOL_ID');
const CLIENT_ID = requiredEnv('CLIENT_ID');
const TABLE_NAME = requiredEnv('TABLE_NAME');
const E2E_EMAIL = requiredEnv('E2E_TEST_EMAIL');
const E2E_PASSWORD = requiredEnv('E2E_TEST_PASSWORD');

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`ERROR: Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

/**
 * Run an AWS CLI command and return stdout. Throws on non-zero exit.
 */
function awsCli(args) {
  return execSync(`aws ${args}`, { stdio: 'pipe', encoding: 'utf-8' });
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

function createTestUser() {
  console.log('Creating test user...');

  try {
    awsCli(
      `cognito-idp admin-create-user --user-pool-id "${USER_POOL_ID}" --username "${E2E_EMAIL}" ` +
      `--temporary-password "${E2E_PASSWORD}" ` +
      `--user-attributes Name=email,Value="${E2E_EMAIL}" Name=email_verified,Value=true Name=custom:role,Value=owner Name=custom:accountId,Value=ACCT-E2E-TEST ` +
      `--message-action SUPPRESS`,
    );
  } catch (err) {
    // If user already exists, continue (idempotent)
    if (err.stderr && err.stderr.includes('UsernameExistsException')) {
      console.log('  User already exists, continuing...');
    } else {
      throw err;
    }
  }

  // Set permanent password (skips the force-change state)
  awsCli(
    `cognito-idp admin-set-user-password --user-pool-id "${USER_POOL_ID}" --username "${E2E_EMAIL}" --password "${E2E_PASSWORD}" --permanent`,
  );

  console.log(`  User created: ${E2E_EMAIL}`);
}

function seedExpenses() {
  console.log('Seeding sample expenses...');

  const accountId = 'ACCT-E2E-TEST';
  const now = new Date().toISOString();
  const today = now.split('T')[0];

  const expenses = [
    {
      id: 'e2e-expense-001',
      vendor: 'CVS Pharmacy',
      description: 'Monthly prescription medications',
      amount: 4500,
      category: 'Health, prevention & wellness',
      date: today,
      paidBy: 'Test User',
    },
    {
      id: 'e2e-expense-002',
      vendor: 'Whole Foods',
      description: 'Weekly groceries',
      amount: 8725,
      category: 'Basic living expenses',
      date: today,
      paidBy: 'Test User',
    },
    {
      id: 'e2e-expense-003',
      vendor: 'City Transit',
      description: 'Monthly bus pass',
      amount: 7500,
      category: 'Transportation',
      date: today,
      paidBy: 'Family Member',
    },
  ];

  for (const expense of expenses) {
    const reimbursedFlag = '0'; // 0 = not reimbursed
    const item = {
      PK: { S: `ACCOUNT#${accountId}` },
      SK: { S: `EXP#${expense.date}#${expense.id}` },
      GSI1PK: { S: `ACCOUNT#${accountId}` },
      GSI1SK: { S: `CAT#${expense.category}#${expense.date}` },
      GSI2PK: { S: `ACCOUNT#${accountId}` },
      GSI2SK: { S: `PAID#${expense.paidBy}#${reimbursedFlag}#${expense.date}` },
      expenseId: { S: expense.id },
      accountId: { S: accountId },
      vendor: { S: expense.vendor },
      description: { S: expense.description },
      amount: { N: String(expense.amount) },
      category: { S: expense.category },
      categoryConfidence: { S: 'user_selected' },
      categoryNotes: { S: '' },
      receiptKey: { NULL: true },
      date: { S: expense.date },
      paidBy: { S: expense.paidBy },
      submittedBy: { S: E2E_EMAIL },
      reimbursed: { BOOL: false },
      reimbursedAt: { NULL: true },
      createdAt: { S: now },
      updatedAt: { S: now },
    };

    dynamoPutItem(item);
    console.log(`  Seeded: ${expense.vendor} — $${(expense.amount / 100).toFixed(2)}`);
  }
}

function writeGitHubOutput() {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    appendFileSync(outputFile, `E2E_EMAIL=${E2E_EMAIL}\n`);
    appendFileSync(outputFile, `E2E_PASSWORD=${E2E_PASSWORD}\n`);
    console.log('Wrote E2E_EMAIL and E2E_PASSWORD to GITHUB_OUTPUT');
  } else {
    console.log('GITHUB_OUTPUT not set (not running in CI)');
    console.log(`  E2E_EMAIL=${E2E_EMAIL}`);
  }
}

function main() {
  console.log('=== Seed Test Data ===');
  console.log(`Region: ${AWS_REGION}`);
  console.log(`User Pool: ${USER_POOL_ID}`);
  console.log(`Table: ${TABLE_NAME}`);
  console.log('');

  createTestUser();
  seedExpenses();
  writeGitHubOutput();

  console.log('');
  console.log('Seeding complete.');
}

try {
  main();
} catch (err) {
  console.error('Seed script failed:', err.message);
  process.exit(1);
}

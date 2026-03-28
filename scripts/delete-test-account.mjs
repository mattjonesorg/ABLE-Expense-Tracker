#!/usr/bin/env node

// Schema source of truth: api/src/lib/account-repository.ts, api/src/lib/user-repository.ts

/**
 * Deletes a test account and all associated data from production.
 *
 * SAFETY CHECKS:
 * - Reads the Account META item and verifies accountType === 'test'
 * - REFUSES to delete live accounts — exits with error
 *
 * This script:
 * 1. Reads and verifies the Account META item (must be accountType='test')
 * 2. Queries ALL items under the account partition (expenses, users, meta)
 * 3. Batch-deletes all DynamoDB items
 * 4. Deletes S3 objects under receipts/<accountId>/
 * 5. Finds and deletes Cognito users associated with the account
 *
 * Required environment variables:
 *   AWS_REGION        — AWS region
 *   USER_POOL_ID      — Cognito User Pool ID
 *   TABLE_NAME        — DynamoDB table name
 *   ACCOUNT_ID        — The test account ID to delete
 *   RECEIPT_BUCKET    — S3 bucket name for receipts (optional — skips S3 cleanup if not set)
 */

import { execSync } from 'node:child_process';

const AWS_REGION = requiredEnv('AWS_REGION');
const USER_POOL_ID = requiredEnv('USER_POOL_ID');
const TABLE_NAME = requiredEnv('TABLE_NAME');
const ACCOUNT_ID = requiredEnv('ACCOUNT_ID');
const RECEIPT_BUCKET = process.env.RECEIPT_BUCKET || '';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`ERROR: Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

/**
 * Run an AWS CLI command and return stdout.
 */
function awsCli(args) {
  return execSync(`aws ${args}`, { stdio: 'pipe', encoding: 'utf-8' });
}

/**
 * Read a DynamoDB item by PK and SK.
 */
function dynamoGetItem(pk, sk) {
  const getItemInput = JSON.stringify({
    TableName: TABLE_NAME,
    Key: { PK: { S: pk }, SK: { S: sk } },
  });

  const result = execSync(
    `aws dynamodb get-item --cli-input-json '${getItemInput.replace(/'/g, "'\\''")}'`,
    { stdio: 'pipe', encoding: 'utf-8' },
  );

  const parsed = JSON.parse(result);
  return parsed.Item ?? null;
}

/**
 * Query all items under a partition key.
 */
function dynamoQueryPartition(pk) {
  const queryInput = JSON.stringify({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: {
      ':pk': { S: pk },
    },
  });

  const result = execSync(
    `aws dynamodb query --cli-input-json '${queryInput.replace(/'/g, "'\\''")}'`,
    { stdio: 'pipe', encoding: 'utf-8' },
  );

  const parsed = JSON.parse(result);
  return parsed.Items ?? [];
}

/**
 * Batch-delete DynamoDB items. Handles batches of 25 (DynamoDB limit).
 */
function dynamoBatchDelete(items) {
  const BATCH_SIZE = 25;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const deleteRequests = batch.map((item) => ({
      DeleteRequest: {
        Key: {
          PK: item.PK,
          SK: item.SK,
        },
      },
    }));

    const batchInput = JSON.stringify({
      RequestItems: {
        [TABLE_NAME]: deleteRequests,
      },
    });

    execSync(
      `aws dynamodb batch-write-item --cli-input-json '${batchInput.replace(/'/g, "'\\''")}'`,
      { stdio: 'pipe' },
    );

    console.log(`  Deleted batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} items`);
  }
}

function verifyTestAccount() {
  console.log('Verifying account is a test account...');

  const pk = `ACCOUNT#${ACCOUNT_ID}`;
  const item = dynamoGetItem(pk, 'META');

  if (!item) {
    console.error(`ERROR: Account ${ACCOUNT_ID} not found in DynamoDB.`);
    process.exit(1);
  }

  const accountType = item.accountType?.S;
  if (accountType !== 'test') {
    console.error('');
    console.error('╔══════════════════════════════════════════════════════════╗');
    console.error('║  SAFETY CHECK FAILED: Cannot delete a live account!     ║');
    console.error('╠══════════════════════════════════════════════════════════╣');
    console.error(`║  Account ID:   ${ACCOUNT_ID}`);
    console.error(`║  Account Type: ${accountType || 'undefined'}`);
    console.error('║                                                          ║');
    console.error('║  This script only deletes accounts with                  ║');
    console.error('║  accountType="test". Live accounts are protected.        ║');
    console.error('╚══════════════════════════════════════════════════════════╝');
    console.error('');
    process.exit(1);
  }

  console.log(`  Verified: accountType=test (${item.beneficiaryName?.S || 'unknown'})`);
}

function deleteAllDynamoItems() {
  console.log('Querying all items for account partition...');

  const pk = `ACCOUNT#${ACCOUNT_ID}`;
  const items = dynamoQueryPartition(pk);

  if (items.length === 0) {
    console.log('  No items found.');
    return;
  }

  console.log(`  Found ${items.length} items to delete.`);

  // Categorize for logging
  const meta = items.filter((i) => i.SK?.S === 'META');
  const users = items.filter((i) => i.SK?.S?.startsWith('USER#'));
  const expenses = items.filter((i) => i.SK?.S?.startsWith('EXP#'));
  const other = items.filter(
    (i) => !['META'].includes(i.SK?.S) && !i.SK?.S?.startsWith('USER#') && !i.SK?.S?.startsWith('EXP#'),
  );

  console.log(`    META items: ${meta.length}`);
  console.log(`    User items: ${users.length}`);
  console.log(`    Expense items: ${expenses.length}`);
  if (other.length > 0) {
    console.log(`    Other items: ${other.length}`);
  }

  dynamoBatchDelete(items);
  console.log('  All DynamoDB items deleted.');
}

function deleteS3Receipts() {
  if (!RECEIPT_BUCKET) {
    console.log('Skipping S3 cleanup (RECEIPT_BUCKET not set).');
    return;
  }

  console.log(`Deleting S3 objects under receipts/${ACCOUNT_ID}/...`);

  try {
    awsCli(
      `s3 rm "s3://${RECEIPT_BUCKET}/receipts/${ACCOUNT_ID}/" --recursive`,
    );
    console.log('  S3 objects deleted.');
  } catch (err) {
    // Ignore if no objects found
    console.log('  No S3 objects found (or already deleted).');
  }
}

function deleteCognitoUsers() {
  console.log('Finding Cognito users for this account...');

  // List users with the matching custom:accountId
  try {
    const result = awsCli(
      `cognito-idp list-users --user-pool-id "${USER_POOL_ID}" --filter "custom:accountId = \\"${ACCOUNT_ID}\\""`,
    );

    const data = JSON.parse(result);
    const users = data.Users ?? [];

    if (users.length === 0) {
      console.log('  No Cognito users found for this account.');
      return;
    }

    console.log(`  Found ${users.length} Cognito user(s) to delete.`);

    for (const user of users) {
      const username = user.Username;
      console.log(`  Deleting Cognito user: ${username}...`);
      awsCli(
        `cognito-idp admin-delete-user --user-pool-id "${USER_POOL_ID}" --username "${username}"`,
      );
      console.log(`    Deleted: ${username}`);
    }
  } catch (err) {
    console.error(`  Warning: Failed to list/delete Cognito users: ${err.message}`);
    console.error('  You may need to manually delete Cognito users.');
  }
}

function main() {
  console.log('=== Delete Test Account ===');
  console.log(`Region: ${AWS_REGION}`);
  console.log(`User Pool: ${USER_POOL_ID}`);
  console.log(`Table: ${TABLE_NAME}`);
  console.log(`Account ID: ${ACCOUNT_ID}`);
  console.log('');

  verifyTestAccount();
  deleteAllDynamoItems();
  deleteS3Receipts();
  deleteCognitoUsers();

  console.log('');
  console.log(`Test account ${ACCOUNT_ID} deleted successfully.`);
}

try {
  main();
} catch (err) {
  console.error('Delete test account failed:', err.message);
  process.exit(1);
}

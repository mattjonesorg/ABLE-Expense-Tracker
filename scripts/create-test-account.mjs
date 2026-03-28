#!/usr/bin/env node

// Schema source of truth: api/src/lib/account-repository.ts, api/src/lib/user-repository.ts

/**
 * Creates a test account in production with account-level isolation.
 *
 * This script:
 * 1. Generates a ULID for the account ID
 * 2. Creates an Account META item in DynamoDB with accountType='test'
 * 3. Creates a User item in DynamoDB
 * 4. Creates a Cognito user with custom:accountType=test
 * 5. Sets a permanent password
 *
 * SAFETY: This script hardcodes accountType='test' — it cannot create live accounts.
 *
 * Required environment variables:
 *   AWS_REGION        — AWS region
 *   USER_POOL_ID      — Cognito User Pool ID
 *   TABLE_NAME        — DynamoDB table name
 *   TEST_EMAIL        — Email for the test user
 *   TEST_PASSWORD     — Password for the test user (must meet Cognito policy)
 *   TEST_DISPLAY_NAME — Display name for the test user
 *   BENEFICIARY_NAME  — Name of the ABLE beneficiary
 *
 * Outputs:
 *   ACCOUNT_ID — The generated test account ID (to stdout and GITHUB_OUTPUT if available)
 */

import { appendFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { ulid } from 'ulid';

const AWS_REGION = requiredEnv('AWS_REGION');
const USER_POOL_ID = requiredEnv('USER_POOL_ID');
const TABLE_NAME = requiredEnv('TABLE_NAME');
const TEST_EMAIL = requiredEnv('TEST_EMAIL');
const TEST_PASSWORD = requiredEnv('TEST_PASSWORD');
const TEST_DISPLAY_NAME = process.env.TEST_DISPLAY_NAME || 'Test User';
const BENEFICIARY_NAME = process.env.BENEFICIARY_NAME || 'Test Beneficiary';

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
 * Insert a DynamoDB item via the AWS CLI (DynamoDB JSON format).
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

function createAccountItem(accountId) {
  console.log('Creating Account META item in DynamoDB...');

  const now = new Date().toISOString();
  const item = {
    PK: { S: `ACCOUNT#${accountId}` },
    SK: { S: 'META' },
    id: { S: accountId },
    beneficiaryName: { S: BENEFICIARY_NAME },
    accountType: { S: 'test' }, // SAFETY: Always 'test'
    createdAt: { S: now },
    createdBy: { S: TEST_EMAIL },
  };

  dynamoPutItem(item);
  console.log(`  Account created: ${accountId} (accountType=test)`);
}

function createUserItem(accountId, userId) {
  console.log('Creating User item in DynamoDB...');

  const item = {
    PK: { S: `ACCOUNT#${accountId}` },
    SK: { S: `USER#${userId}` },
    userId: { S: userId },
    accountId: { S: accountId },
    email: { S: TEST_EMAIL },
    displayName: { S: TEST_DISPLAY_NAME },
    role: { S: 'owner' },
    cognitoSub: { S: 'pending-cognito-creation' },
  };

  dynamoPutItem(item);
  console.log(`  User created: ${userId} (${TEST_EMAIL})`);
}

function createCognitoUser(accountId) {
  console.log('Creating Cognito user...');

  try {
    awsCli(
      `cognito-idp admin-create-user --user-pool-id "${USER_POOL_ID}" --username "${TEST_EMAIL}" ` +
      `--temporary-password "${TEST_PASSWORD}" ` +
      `--user-attributes ` +
      `Name=email,Value="${TEST_EMAIL}" ` +
      `Name=email_verified,Value=true ` +
      `Name=custom:role,Value=owner ` +
      `Name=custom:accountId,Value="${accountId}" ` +
      `Name=custom:accountType,Value=test ` +
      `--message-action SUPPRESS`,
    );
  } catch (err) {
    if (err.stderr && err.stderr.includes('UsernameExistsException')) {
      // custom:accountType is immutable in Cognito — already set at creation time, so only update mutable attributes
      console.log('  User already exists, updating mutable attributes...');
      awsCli(
        `cognito-idp admin-update-user-attributes --user-pool-id "${USER_POOL_ID}" --username "${TEST_EMAIL}" ` +
        `--user-attributes ` +
        `Name=custom:role,Value=owner ` +
        `Name=custom:accountId,Value="${accountId}"`,
      );
    } else {
      throw err;
    }
  }

  // Set permanent password
  awsCli(
    `cognito-idp admin-set-user-password --user-pool-id "${USER_POOL_ID}" --username "${TEST_EMAIL}" --password "${TEST_PASSWORD}" --permanent`,
  );

  // Get the Cognito sub for the user record
  const result = awsCli(
    `cognito-idp admin-get-user --user-pool-id "${USER_POOL_ID}" --username "${TEST_EMAIL}"`,
  );
  const userData = JSON.parse(result);
  const subAttr = (userData.UserAttributes ?? []).find((a) => a.Name === 'sub');
  const cognitoSub = subAttr ? subAttr.Value : 'unknown';

  console.log(`  Cognito user created: ${TEST_EMAIL} (sub=${cognitoSub})`);
  return cognitoSub;
}

function updateUserCognitoSub(accountId, userId, cognitoSub) {
  console.log('Updating User item with Cognito sub...');

  const updateInput = JSON.stringify({
    TableName: TABLE_NAME,
    Key: {
      PK: { S: `ACCOUNT#${accountId}` },
      SK: { S: `USER#${userId}` },
    },
    UpdateExpression: 'SET cognitoSub = :sub',
    ExpressionAttributeValues: {
      ':sub': { S: cognitoSub },
    },
  });

  execSync(
    `aws dynamodb update-item --cli-input-json '${updateInput.replace(/'/g, "'\\''")}'`,
    { stdio: 'pipe' },
  );

  console.log(`  Updated cognitoSub=${cognitoSub}`);
}

function writeOutput(accountId) {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (outputFile) {
    appendFileSync(outputFile, `ACCOUNT_ID=${accountId}\n`);
    console.log('Wrote ACCOUNT_ID to GITHUB_OUTPUT');
  }
  console.log(`\nACCOUNT_ID=${accountId}`);
}

function main() {
  console.log('=== Create Test Account ===');
  console.log(`Region: ${AWS_REGION}`);
  console.log(`User Pool: ${USER_POOL_ID}`);
  console.log(`Table: ${TABLE_NAME}`);
  console.log(`Email: ${TEST_EMAIL}`);
  console.log(`Beneficiary: ${BENEFICIARY_NAME}`);
  console.log('');

  const accountId = ulid();
  const userId = ulid();

  createAccountItem(accountId);
  createUserItem(accountId, userId);
  const cognitoSub = createCognitoUser(accountId);
  updateUserCognitoSub(accountId, userId, cognitoSub);
  writeOutput(accountId);

  console.log('');
  console.log('Test account created successfully.');
}

try {
  main();
} catch (err) {
  console.error('Create test account failed:', err.message);
  process.exit(1);
}

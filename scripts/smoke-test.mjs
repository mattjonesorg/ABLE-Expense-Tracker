#!/usr/bin/env node

/**
 * Post-deploy smoke tests for the ABLE Tracker API.
 *
 * Validates that all API endpoints respond correctly after deployment.
 * Uses native fetch (Node 20+) and the Cognito REST API directly —
 * no SDK dependencies required.
 *
 * Required environment variables:
 *   API_URL              — Base URL of the deployed API (e.g. https://abc123.execute-api.us-east-1.amazonaws.com)
 *   AWS_REGION           — AWS region (e.g. us-east-1)
 *   COGNITO_USER_POOL_ID — Cognito User Pool ID
 *   COGNITO_CLIENT_ID    — Cognito User Pool Client ID
 *   SMOKE_TEST_EMAIL     — Email of a test user in the User Pool
 *   SMOKE_TEST_PASSWORD  — Password for the test user
 *
 * Usage:
 *   node scripts/smoke-test.mjs
 *
 * Exit codes:
 *   0 — all tests passed
 *   1 — one or more tests failed
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_URL = requiredEnv('API_URL').replace(/\/+$/, '');
const AWS_REGION = requiredEnv('AWS_REGION');
const COGNITO_USER_POOL_ID = requiredEnv('COGNITO_USER_POOL_ID');
const COGNITO_CLIENT_ID = requiredEnv('COGNITO_CLIENT_ID');
const SMOKE_TEST_EMAIL = requiredEnv('SMOKE_TEST_EMAIL');
const SMOKE_TEST_PASSWORD = requiredEnv('SMOKE_TEST_PASSWORD');

const COGNITO_ENDPOINT = `https://cognito-idp.${AWS_REGION}.amazonaws.com/`;

/** @type {{ name: string; passed: boolean; error?: string }[]} */
const results = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`ERROR: Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

/**
 * Record a test result.
 * @param {string} name
 * @param {boolean} passed
 * @param {string} [error]
 */
function record(name, passed, error) {
  results.push({ name, passed, error });
  const icon = passed ? 'PASS' : 'FAIL';
  const msg = error ? ` — ${error}` : '';
  console.log(`  [${icon}] ${name}${msg}`);
}

/**
 * Authenticate with Cognito using USER_PASSWORD_AUTH flow via the REST API.
 * Returns the IdToken JWT.
 * @returns {Promise<string>}
 */
async function authenticate() {
  const body = JSON.stringify({
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: COGNITO_CLIENT_ID,
    AuthParameters: {
      USERNAME: SMOKE_TEST_EMAIL,
      PASSWORD: SMOKE_TEST_PASSWORD,
    },
  });

  const response = await fetch(COGNITO_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Cognito auth failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  const idToken = data?.AuthenticationResult?.IdToken;
  if (!idToken) {
    throw new Error('Cognito auth response missing IdToken');
  }
  return idToken;
}

/**
 * Make an API request and return { status, body }.
 * @param {string} method
 * @param {string} path
 * @param {object} [options]
 * @param {string} [options.token]
 * @param {unknown} [options.body]
 * @param {string} [options.origin]
 * @returns {Promise<{ status: number; body: unknown; headers: Headers }>}
 */
async function apiRequest(method, path, options = {}) {
  const url = `${API_URL}${path}`;
  /** @type {Record<string, string>} */
  const headers = { 'Content-Type': 'application/json' };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  if (options.origin) {
    headers['Origin'] = options.origin;
  }

  const fetchOptions = { method, headers };
  if (options.body !== undefined) {
    fetchOptions.body = JSON.stringify(options.body);
  }

  const response = await fetch(url, fetchOptions);
  let body;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    body = await response.json();
  } else {
    body = await response.text();
  }

  return { status: response.status, body, headers: response.headers };
}

// ---------------------------------------------------------------------------
// Test definitions
// ---------------------------------------------------------------------------

async function testUnauthenticatedAccess(token) {
  try {
    const { status } = await apiRequest('GET', '/expenses');
    record(
      'Unauthenticated GET /expenses returns 401',
      status === 401,
      status !== 401 ? `expected 401, got ${status}` : undefined,
    );
  } catch (err) {
    record('Unauthenticated GET /expenses returns 401', false, err.message);
  }
}

async function testListExpenses(token) {
  try {
    const { status, body } = await apiRequest('GET', '/expenses', { token });
    const passed = status === 200 && Array.isArray(body);
    record(
      'GET /expenses returns 200 with array',
      passed,
      !passed ? `status=${status}, isArray=${Array.isArray(body)}` : undefined,
    );
  } catch (err) {
    record('GET /expenses returns 200 with array', false, err.message);
  }
}

async function testCreateExpense(token) {
  const expense = {
    vendor: 'Smoke Test Vendor',
    description: 'Automated smoke test expense',
    amount: 1234,
    date: new Date().toISOString().split('T')[0],
    paidBy: 'Smoke Test Runner',
    category: 'Health, prevention & wellness',
  };

  try {
    const { status, body } = await apiRequest('POST', '/expenses', {
      token,
      body: expense,
    });
    const passed = status === 201 && body && typeof body.id === 'string';
    record(
      'POST /expenses returns 201 with expense id',
      passed,
      !passed ? `status=${status}, id=${body?.id}` : undefined,
    );
    return body?.id;
  } catch (err) {
    record('POST /expenses returns 201 with expense id', false, err.message);
    return null;
  }
}

async function testGetExpense(token, expenseId) {
  if (!expenseId) {
    record('GET /expenses/{id} returns 200', false, 'skipped — no expense id from create');
    return;
  }
  try {
    const { status, body } = await apiRequest('GET', `/expenses/${expenseId}`, { token });
    const passed = status === 200 && body?.id === expenseId;
    record(
      'GET /expenses/{id} returns 200 with matching expense',
      passed,
      !passed ? `status=${status}, bodyId=${body?.id}` : undefined,
    );
  } catch (err) {
    record('GET /expenses/{id} returns 200 with matching expense', false, err.message);
  }
}

async function testGetExpenseNotFound(token) {
  try {
    const { status } = await apiRequest('GET', '/expenses/nonexistent-id-000', { token });
    record(
      'GET /expenses/{id} returns 404 for missing expense',
      status === 404,
      status !== 404 ? `expected 404, got ${status}` : undefined,
    );
  } catch (err) {
    record('GET /expenses/{id} returns 404 for missing expense', false, err.message);
  }
}

async function testCategorize(token) {
  try {
    const { status, body } = await apiRequest('POST', '/expenses/categorize', {
      token,
      body: {
        vendor: 'CVS Pharmacy',
        description: 'Monthly prescription medications',
      },
    });
    const passed = status === 200 && body && typeof body.category === 'string';
    record(
      'POST /expenses/categorize returns 200 with category',
      passed,
      !passed ? `status=${status}, category=${body?.category}` : undefined,
    );
  } catch (err) {
    record('POST /expenses/categorize returns 200 with category', false, err.message);
  }
}

async function testReimburse(token, expenseId) {
  if (!expenseId) {
    record('PUT /expenses/{id}/reimburse returns 200', false, 'skipped — no expense id');
    return;
  }
  try {
    const { status } = await apiRequest('PUT', `/expenses/${expenseId}/reimburse`, { token });
    const passed = status === 200;
    record(
      'PUT /expenses/{id}/reimburse returns 200',
      passed,
      !passed ? `expected 200, got ${status}` : undefined,
    );
  } catch (err) {
    record('PUT /expenses/{id}/reimburse returns 200', false, err.message);
  }
}

async function testDashboardReimbursements(token) {
  try {
    const { status } = await apiRequest('GET', '/dashboard/reimbursements', { token });
    // Accept 200 for real handler or 501/200 for stub
    const passed = status === 200;
    record(
      'GET /dashboard/reimbursements returns 200',
      passed,
      !passed ? `expected 200, got ${status}` : undefined,
    );
  } catch (err) {
    record('GET /dashboard/reimbursements returns 200', false, err.message);
  }
}

async function testRequestUploadUrl(token) {
  try {
    const { status, body } = await apiRequest('POST', '/uploads/request-url', {
      token,
      body: {
        fileName: 'smoke-test-receipt.png',
        contentType: 'image/png',
      },
    });
    const passed = status === 200 && body && typeof body.uploadUrl === 'string';
    record(
      'POST /uploads/request-url returns 200 with uploadUrl',
      passed,
      !passed ? `status=${status}, hasUrl=${!!body?.uploadUrl}` : undefined,
    );
  } catch (err) {
    record('POST /uploads/request-url returns 200 with uploadUrl', false, err.message);
  }
}

async function testCorsHeaders(token) {
  try {
    const { status, headers } = await apiRequest('GET', '/expenses', {
      token,
      origin: 'http://localhost:5173',
    });
    const acaoHeader = headers.get('access-control-allow-origin');
    const passed = status === 200 && acaoHeader !== null;
    record(
      'CORS: response includes access-control-allow-origin header',
      passed,
      !passed ? `status=${status}, acao=${acaoHeader}` : undefined,
    );
  } catch (err) {
    record('CORS: response includes access-control-allow-origin header', false, err.message);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== ABLE Tracker Smoke Tests ===');
  console.log(`API: ${API_URL}`);
  console.log(`Region: ${AWS_REGION}`);
  console.log('');

  // Authenticate
  console.log('Authenticating with Cognito...');
  let token;
  try {
    token = await authenticate();
    record('Cognito authentication succeeds', true);
  } catch (err) {
    record('Cognito authentication succeeds', false, err.message);
    printSummary();
    process.exit(1);
  }
  console.log('');

  // Run tests sequentially (some depend on created resources)
  console.log('Running endpoint tests...');

  await testUnauthenticatedAccess();
  await testListExpenses(token);

  const expenseId = await testCreateExpense(token);
  await testGetExpense(token, expenseId);
  await testGetExpenseNotFound(token);

  await testCategorize(token);
  await testReimburse(token, expenseId);
  await testDashboardReimbursements(token);
  await testRequestUploadUrl(token);
  await testCorsHeaders(token);

  console.log('');
  printSummary();

  const failed = results.filter((r) => !r.passed).length;
  process.exit(failed > 0 ? 1 : 0);
}

function printSummary() {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log('=== Summary ===');
  console.log(`  Total:  ${total}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  if (failed > 0) {
    console.log('');
    console.log('Failed tests:');
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  - ${r.name}: ${r.error}`);
    }
  }

  console.log('');
}

main();

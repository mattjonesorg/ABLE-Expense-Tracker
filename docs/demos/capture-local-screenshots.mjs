/**
 * Playwright script to capture screenshots of the ABLE Tracker app
 * using the local Vite dev server with mock auth tokens injected
 * into sessionStorage. No real Cognito credentials needed.
 *
 * Usage:
 *   node docs/demos/capture-local-screenshots.mjs
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const WEB_DIR = path.join(__dirname, '..', '..', 'web');

const DEV_PORT = 5199; // Use a non-standard port to avoid conflicts
const APP_URL = `http://localhost:${DEV_PORT}`;

/**
 * Create a mock JWT token that the app's parseIdToken can decode.
 * The app only reads the payload — it does NOT verify the signature.
 */
function createMockJwt(payload) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const encode = (obj) =>
    Buffer.from(JSON.stringify(obj))
      .toString('base64url');
  // mock signature — app doesn't verify
  return `${encode(header)}.${encode(payload)}.mock-signature`;
}

function createMockTokens() {
  const now = Math.floor(Date.now() / 1000);
  const idPayload = {
    sub: 'mock-user-sub-001',
    email: 'demo@abletracker.example',
    'custom:role': 'authorized_rep',
    'custom:accountId': 'acct-demo-001',
    exp: now + 3600, // 1 hour from now
    iat: now,
    iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_TestPool',
  };

  return {
    idToken: createMockJwt(idPayload),
    accessToken: createMockJwt({ sub: idPayload.sub, exp: idPayload.exp }),
    refreshToken: 'mock-refresh-token',
  };
}

/**
 * Start the Vite dev server and wait for it to be ready.
 */
function startDevServer() {
  return new Promise((resolve, reject) => {
    const proc = spawn('pnpm', ['exec', 'vite', '--port', String(DEV_PORT), '--strictPort'], {
      cwd: WEB_DIR,
      env: {
        ...process.env,
        VITE_COGNITO_USER_POOL_ID: 'us-east-1_TestPool',
        VITE_COGNITO_CLIENT_ID: 'test-client-id-000000',
        VITE_AWS_REGION: 'us-east-1',
        VITE_API_URL: 'https://test-api.example.com',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    const timeout = setTimeout(() => {
      reject(new Error(`Dev server did not start within 30s. Output:\n${output}`));
    }, 30000);

    proc.stdout.on('data', (data) => {
      output += data.toString();
      // Vite prints the URL when ready
      if (output.includes(`localhost:${DEV_PORT}`) || output.includes('ready in')) {
        clearTimeout(timeout);
        // Give it a moment to settle
        setTimeout(() => resolve(proc), 1000);
      }
    });

    proc.stderr.on('data', (data) => {
      output += data.toString();
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    proc.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        clearTimeout(timeout);
        reject(new Error(`Dev server exited with code ${code}. Output:\n${output}`));
      }
    });
  });
}

async function injectMockAuth(page) {
  const tokens = createMockTokens();
  await page.evaluate((t) => {
    sessionStorage.setItem('able_tracker_tokens', JSON.stringify(t));
  }, tokens);
}

async function main() {
  console.log('Starting Vite dev server...');
  const devServer = await startDevServer();
  console.log(`Dev server running at ${APP_URL}`);

  const browser = await chromium.launch({ headless: true });

  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  });
  const page = await desktopContext.newPage();

  const mobileContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
  });
  const mobilePage = await mobileContext.newPage();

  // Suppress console errors from missing API calls (expected)
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('test-api.example.com')) {
      console.log(`  [CONSOLE] ${msg.text()}`);
    }
  });

  try {
    // -------------------------------------------------------
    // Screenshots 01 and 02 already captured from live site
    // Only capture if they don't exist
    // -------------------------------------------------------

    // -------------------------------------------------------
    // 03 — Dashboard (with mock auth)
    // -------------------------------------------------------
    console.log('Capturing 03-dashboard...');
    await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle' });
    await injectMockAuth(page);
    await page.goto(`${APP_URL}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Dashboard', { timeout: 10000 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '03-dashboard.png'),
      fullPage: false,
    });
    console.log('  OK');

    // -------------------------------------------------------
    // 04 — Navigation sidebar
    // -------------------------------------------------------
    console.log('Capturing 04-navigation...');
    // At desktop width, sidebar is always visible — same as dashboard but
    // highlighting the navigation area
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '04-navigation.png'),
      fullPage: false,
    });
    console.log('  OK');

    // -------------------------------------------------------
    // 05 — Expense form (empty)
    // -------------------------------------------------------
    console.log('Capturing 05-expense-form...');
    await page.goto(`${APP_URL}/expenses/new`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=New Expense', { timeout: 10000 });
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '05-expense-form.png'),
      fullPage: true,
    });
    console.log('  OK');

    // -------------------------------------------------------
    // 06 — AI categorization (Suggest Category button visible)
    // -------------------------------------------------------
    console.log('Capturing 06-ai-categorization...');
    // Fill in vendor and description to contextualize the AI feature
    const vendorInput = page.locator('input').first();
    await vendorInput.fill('University Bookstore');
    const descTextarea = page.locator('textarea').first();
    await descTextarea.fill('Textbooks for fall semester college courses');
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '06-ai-categorization.png'),
      fullPage: true,
    });
    console.log('  OK');

    // -------------------------------------------------------
    // 07 — Expense list page (loading/empty — API is fake)
    // -------------------------------------------------------
    console.log('Capturing 07-expense-list...');
    await page.goto(`${APP_URL}/expenses`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Expenses', { timeout: 10000 });
    await page.waitForTimeout(2000); // Let the API call fail and show empty/loading state
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '07-expense-list.png'),
      fullPage: false,
    });
    console.log('  OK');

    // -------------------------------------------------------
    // 08 — Empty state
    // -------------------------------------------------------
    console.log('Capturing 08-expense-list-empty...');
    // With mock API, this should show the empty state or loading
    const emptyVisible = await page.locator('text=No expenses yet').count();
    console.log(`  (empty state visible: ${emptyVisible > 0})`);
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '08-expense-list-empty.png'),
      fullPage: false,
    });
    console.log('  OK');

    // -------------------------------------------------------
    // 09 — Mobile navigation (hamburger menu)
    // -------------------------------------------------------
    console.log('Capturing 09-mobile-nav...');
    await mobilePage.goto(`${APP_URL}/login`, { waitUntil: 'networkidle' });
    await injectMockAuth(mobilePage);
    await mobilePage.goto(`${APP_URL}/`, { waitUntil: 'networkidle' });
    await mobilePage.waitForTimeout(1000);

    const mobileOnDashboard = await mobilePage.locator('text=Dashboard').count();
    if (mobileOnDashboard > 0) {
      const burger = mobilePage.locator('button[aria-label="Toggle navigation"]');
      if (await burger.count() > 0) {
        await burger.click();
        await mobilePage.waitForTimeout(500);
      }
    }
    await mobilePage.screenshot({
      path: path.join(SCREENSHOTS_DIR, '09-mobile-nav.png'),
      fullPage: false,
    });
    console.log('  OK');

    // -------------------------------------------------------
    // 10 — Logout button
    // -------------------------------------------------------
    console.log('Capturing 10-logout...');
    await page.goto(`${APP_URL}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Dashboard', { timeout: 10000 });
    const logoutBtn = page.locator('button[aria-label="Logout"]');
    if (await logoutBtn.count() > 0) {
      await logoutBtn.hover();
      await page.waitForTimeout(300);
    }
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '10-logout.png'),
      fullPage: false,
    });
    console.log('  OK');

    console.log('\nAll screenshots captured successfully!');

  } catch (error) {
    console.error('Error capturing screenshots:', error.message);
    try {
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'debug-local-error.png'),
        fullPage: true,
      });
      console.log('Debug screenshot saved');
    } catch {
      // ignore
    }
    throw error;
  } finally {
    await browser.close();
    devServer.kill('SIGTERM');
    console.log('Dev server stopped.');
  }
}

main().catch((error) => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});

/**
 * Playwright script to capture screenshots of the ABLE Tracker app
 * for the product demo documentation.
 *
 * Usage:
 *   DEMO_EMAIL=user@example.com DEMO_PASSWORD=yourpass node docs/demos/capture-screenshots.mjs
 *
 * Environment variables:
 *   DEMO_EMAIL    — login email (required)
 *   DEMO_PASSWORD — login password (required)
 *   DEMO_URL      — app URL (defaults to https://d360ri42g0q6k2.cloudfront.net)
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');

const APP_URL = process.env.DEMO_URL || 'https://d360ri42g0q6k2.cloudfront.net';
const EMAIL = process.env.DEMO_EMAIL;
const PASSWORD = process.env.DEMO_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error('Error: DEMO_EMAIL and DEMO_PASSWORD environment variables are required.');
  process.exit(1);
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  // Desktop context (1280x800)
  const desktopContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  });
  const page = await desktopContext.newPage();

  // Log console messages for debugging
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log(`  [BROWSER ERROR] ${msg.text()}`);
    }
  });

  // Log network failures
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().includes('cognito')) {
      console.log(`  [COGNITO ${response.status()}] ${response.url()}`);
    }
  });

  // Mobile context (375x812 — iPhone-sized)
  const mobileContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
  });
  const mobilePage = await mobileContext.newPage();

  let loginSucceeded = false;

  try {
    // -------------------------------------------------------
    // 01 — Login page
    // -------------------------------------------------------
    console.log('Capturing 01-login-page...');
    await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=ABLE Tracker', { timeout: 15000 });
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '01-login-page.png'),
      fullPage: false,
    });
    console.log('  OK');

    // -------------------------------------------------------
    // 02 — Auth redirect (unauthenticated user hitting /expenses)
    // -------------------------------------------------------
    console.log('Capturing 02-auth-redirect...');
    await page.goto(`${APP_URL}/expenses`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Sign in', { timeout: 10000 });
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, '02-auth-redirect.png'),
      fullPage: false,
    });
    console.log('  OK');

    // -------------------------------------------------------
    // Login for authenticated screenshots
    // -------------------------------------------------------
    console.log('Logging in...');
    await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle' });
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);

    // Click submit and wait for either navigation to dashboard or error notification
    await page.click('button[type="submit"]');

    // Wait for either dashboard to appear or a notification (error) to appear
    const result = await Promise.race([
      page.waitForSelector('text=Dashboard', { timeout: 20000 }).then(() => 'dashboard'),
      page.waitForSelector('[data-mantine-notification]', { timeout: 20000 }).then(() => 'notification'),
      page.waitForSelector('.mantine-Notification-root', { timeout: 20000 }).then(() => 'notification'),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 25000)),
    ]);

    if (result === 'dashboard') {
      console.log('  Login succeeded!');
      loginSucceeded = true;
      await page.waitForTimeout(500);
    } else if (result === 'notification') {
      console.log('  Login failed — error notification appeared');
      // Capture the login failure for diagnostics
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'debug-login-error.png'),
        fullPage: false,
      });
      // Try to read the notification text
      const notifText = await page.locator('.mantine-Notification-root, [data-mantine-notification]').first().textContent().catch(() => 'unknown');
      console.log(`  Notification text: ${notifText}`);
    } else {
      console.log('  Login timed out — checking page state...');
      const url = page.url();
      console.log(`  Current URL: ${url}`);
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'debug-login-timeout.png'),
        fullPage: false,
      });
      // Check if we ended up on dashboard despite no match
      const dashboardVisible = await page.locator('text=Dashboard').count();
      if (dashboardVisible > 0) {
        console.log('  Actually on dashboard — continuing');
        loginSucceeded = true;
      }
    }

    if (loginSucceeded) {
      // -------------------------------------------------------
      // 03 — Dashboard
      // -------------------------------------------------------
      console.log('Capturing 03-dashboard...');
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '03-dashboard.png'),
        fullPage: false,
      });
      console.log('  OK');

      // -------------------------------------------------------
      // 04 — Navigation sidebar
      // -------------------------------------------------------
      console.log('Capturing 04-navigation...');
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '04-navigation.png'),
        fullPage: false,
      });
      console.log('  OK');

      // -------------------------------------------------------
      // 05 — Expense form (empty)
      // -------------------------------------------------------
      console.log('Capturing 05-expense-form...');
      const newExpenseNav = page.locator('a[href="/expenses/new"]').first();
      await newExpenseNav.click();
      await page.waitForURL('**/expenses/new', { timeout: 10000 });
      await page.waitForTimeout(500);
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '05-expense-form.png'),
        fullPage: true,
      });
      console.log('  OK');

      // -------------------------------------------------------
      // 06 — AI categorization (Suggest Category button)
      // -------------------------------------------------------
      console.log('Capturing 06-ai-categorization...');
      // Fill in vendor and description to show the AI suggest flow
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
      // 07 — Expense list page
      // -------------------------------------------------------
      console.log('Capturing 07-expense-list...');
      const expensesNavLink = page.locator('a[href="/expenses"]').first();
      await expensesNavLink.click();
      await page.waitForURL('**/expenses', { timeout: 10000 });
      await page.waitForTimeout(2000); // Wait for API call
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '07-expense-list.png'),
        fullPage: false,
      });
      console.log('  OK');

      // -------------------------------------------------------
      // 08 — Empty state
      // -------------------------------------------------------
      console.log('Capturing 08-expense-list-empty...');
      const emptyText = await page.locator('text=No expenses yet').count();
      if (emptyText > 0) {
        console.log('  (empty state found)');
      } else {
        console.log('  (expenses exist — capturing current view)');
      }
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, '08-expense-list-empty.png'),
        fullPage: false,
      });
      console.log('  OK');

      // -------------------------------------------------------
      // 09 — Mobile navigation (hamburger menu)
      // -------------------------------------------------------
      console.log('Capturing 09-mobile-nav...');
      // Copy cookies and session storage to mobile context
      const cookies = await desktopContext.cookies();
      await mobileContext.addCookies(cookies);

      const sessionData = await page.evaluate(() => {
        const data = {};
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key) {
            data[key] = sessionStorage.getItem(key);
          }
        }
        return data;
      });

      // Navigate to the app in mobile, inject tokens, then reload
      await mobilePage.goto(`${APP_URL}/login`, { waitUntil: 'load', timeout: 15000 });
      await mobilePage.evaluate((data) => {
        for (const [key, value] of Object.entries(data)) {
          sessionStorage.setItem(key, value);
        }
      }, sessionData);
      await mobilePage.goto(`${APP_URL}/`, { waitUntil: 'load', timeout: 15000 });
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

    } else {
      console.log('\nLogin failed. Capturing remaining screenshots from local dev server approach...');
      console.log('Generating placeholder screenshots for authenticated pages...');

      // Since login failed, we still have 01 and 02.
      // Report the login issue.
      console.log('\nISSUE: Login with provided credentials failed against the live site.');
      console.log('The login page and auth redirect screenshots were captured successfully.');
      console.log('Authenticated screenshots (03-10) could not be captured.');
    }

    console.log('\nScreenshot capture complete!');

  } catch (error) {
    console.error('Error capturing screenshots:', error.message);
    try {
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'debug-error.png'),
        fullPage: true,
      });
      console.log('Debug screenshot saved to debug-error.png');
    } catch {
      // ignore
    }
    throw error;
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});

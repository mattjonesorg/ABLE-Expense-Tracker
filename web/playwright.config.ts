import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E test configuration for ABLE Tracker web app.
 *
 * Environment variables:
 *   E2E_BASE_URL  - Base URL of the running app (default: http://localhost:5173)
 *   CI            - Set to "true" in CI environments (limits to Chromium only)
 */
export default defineConfig({
  testDir: './e2e',
  /* Run tests sequentially in CI for stability */
  fullyParallel: !process.env.CI,
  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,
  /* Retry failed tests once in CI */
  retries: process.env.CI ? 1 : 0,
  /* Single worker in CI for stability */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter: HTML for local, list for CI */
  reporter: process.env.CI ? 'list' : 'html',
  /* Shared settings for all projects */
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    /* Capture screenshot on failure */
    screenshot: 'only-on-failure',
    /* Capture trace on first retry */
    trace: 'on-first-retry',
    /* Reasonable action timeout */
    actionTimeout: 10_000,
  },
  /* Global test timeout */
  timeout: 30_000,
  /* Expect timeout */
  expect: {
    timeout: 5_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    /* Only run additional browsers locally — skip in CI for speed */
    ...(process.env.CI
      ? []
      : [
          {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
          },
          {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
          },
        ]),
  ],
});

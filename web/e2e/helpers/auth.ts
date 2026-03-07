import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Log in to the ABLE Tracker app via the login form.
 *
 * Navigates to /login, fills in email and password, submits the form,
 * and waits for the Dashboard heading to appear.
 *
 * @param page - Playwright Page object
 * @param email - User email address (defaults to E2E_EMAIL env var)
 * @param password - User password (defaults to E2E_PASSWORD env var)
 */
export async function login(
  page: Page,
  email?: string,
  password?: string,
): Promise<void> {
  const userEmail = email ?? process.env.E2E_EMAIL;
  const userPassword = password ?? process.env.E2E_PASSWORD;

  if (!userEmail || !userPassword) {
    throw new Error(
      'E2E login credentials not provided. Set E2E_EMAIL and E2E_PASSWORD environment variables or pass them as arguments.',
    );
  }

  await page.goto('/login');

  // Fill in the login form using accessible selectors
  await page.getByLabel('Email').fill(userEmail);
  await page.getByLabel('Password').fill(userPassword);

  // Submit the form
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Wait for Dashboard to appear (confirms successful login)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}

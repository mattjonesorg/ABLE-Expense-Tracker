import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Login flow', () => {
  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login');

    // Page title / heading
    await expect(
      page.getByRole('heading', { name: 'ABLE Tracker' }),
    ).toBeVisible();

    // Email and password fields
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();

    // Sign in button
    await expect(
      page.getByRole('button', { name: 'Sign in' }),
    ).toBeVisible();
  });

  test('unauthenticated user is redirected to login', async ({ page }) => {
    // Navigate to a protected route
    await page.goto('/');

    // Should end up on the login page
    await expect(page).toHaveURL(/\/login/);
  });

  test('successful login reaches Dashboard', async ({ page }) => {
    await login(page);

    // Verify we see the Dashboard
    await expect(
      page.getByRole('heading', { name: 'Dashboard' }),
    ).toBeVisible();

    // Verify the URL is the root (dashboard)
    await expect(page).toHaveURL(/\/$/);
  });

  test('logout returns to login page', async ({ page }) => {
    // First, log in
    await login(page);

    // Click the Logout button
    await page.getByRole('button', { name: 'Logout' }).click();

    // Should be back on the login page
    await expect(
      page.getByRole('heading', { name: 'ABLE Tracker' }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

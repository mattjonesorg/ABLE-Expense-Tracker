import type { Plugin } from 'vite';

/**
 * The VITE_* environment variables required for the ABLE Tracker frontend.
 * These must match the variables consumed by config.ts.
 */
export const REQUIRED_ENV_VARS = [
  'VITE_COGNITO_USER_POOL_ID',
  'VITE_COGNITO_CLIENT_ID',
  'VITE_AWS_REGION',
  'VITE_API_URL',
] as const;

/**
 * Validates that all required env vars are present and non-empty.
 * Returns an array of missing variable names (empty array if all present).
 */
export function validateRequiredEnvVars(
  required: readonly string[],
  env: Record<string, string | undefined>,
): string[] {
  return required.filter((name) => {
    const value = env[name];
    return !value || value.trim() === '';
  });
}

/**
 * Vite plugin that checks required VITE_* env vars at build time.
 * Fails the build immediately with a clear error if any are missing.
 * Skips validation during vitest runs and when SKIP_ENV_VALIDATION is set.
 */
export function envValidationPlugin(required: readonly string[]): Plugin {
  return {
    name: 'validate-env',
    config(_config, { command }) {
      // Skip during vitest — tests stub env vars individually
      if (process.env['VITEST']) {
        return;
      }
      // Skip when explicitly opted out (e.g., CI test-only builds that don't deploy)
      if (process.env['SKIP_ENV_VALIDATION']) {
        return;
      }
      const missing = validateRequiredEnvVars(required, process.env);
      if (missing.length > 0) {
        throw new Error(
          `\n\nMissing required environment variables:\n` +
            missing.map((v) => `  - ${v}`).join('\n') +
            `\n\nFor local development, create web/.env.local with these variables.\n` +
            `See deployment.env.example for documentation.\n`,
        );
      }
    },
  };
}

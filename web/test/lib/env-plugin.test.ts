import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { envValidationPlugin } from '../../src/lib/validate-env';

describe('envValidationPlugin', () => {
  const savedVitest = process.env['VITEST'];

  beforeEach(() => {
    vi.resetModules();
    // Remove VITEST so the plugin actually runs validation in tests
    delete process.env['VITEST'];
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    // Restore VITEST
    process.env['VITEST'] = savedVitest;
  });

  /** Helper to invoke the config hook the way Vite does */
  function callConfigHook(plugin: ReturnType<typeof envValidationPlugin>) {
    const configHook = plugin.config as (
      config: Record<string, unknown>,
      env: { command: string },
    ) => void;
    configHook({}, { command: 'build' });
  }

  it('returns a Vite plugin with the correct name', () => {
    const plugin = envValidationPlugin(['VITE_TEST']);
    expect(plugin.name).toBe('validate-env');
  });

  it('has a config hook', () => {
    const plugin = envValidationPlugin(['VITE_TEST']);
    expect(plugin.config).toBeDefined();
  });

  it('does not throw when all env vars are present', () => {
    vi.stubEnv('VITE_COGNITO_USER_POOL_ID', 'us-east-1_TestPool');
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'test-client-id');

    const plugin = envValidationPlugin([
      'VITE_COGNITO_USER_POOL_ID',
      'VITE_COGNITO_CLIENT_ID',
    ]);

    expect(() => callConfigHook(plugin)).not.toThrow();
  });

  it('throws with a clear error listing missing vars', () => {
    delete process.env['VITE_COGNITO_CLIENT_ID'];
    delete process.env['VITE_API_URL'];
    vi.stubEnv('VITE_COGNITO_USER_POOL_ID', 'us-east-1_TestPool');

    const plugin = envValidationPlugin([
      'VITE_COGNITO_USER_POOL_ID',
      'VITE_COGNITO_CLIENT_ID',
      'VITE_API_URL',
    ]);

    expect(() => callConfigHook(plugin)).toThrow('VITE_COGNITO_CLIENT_ID');
    expect(() => callConfigHook(plugin)).toThrow('VITE_API_URL');
  });

  it('error message mentions .env.local', () => {
    delete process.env['VITE_MISSING_VAR'];
    const plugin = envValidationPlugin(['VITE_MISSING_VAR']);
    expect(() => callConfigHook(plugin)).toThrow('.env.local');
  });

  it('error message mentions deployment.env.example', () => {
    delete process.env['VITE_MISSING_VAR'];
    const plugin = envValidationPlugin(['VITE_MISSING_VAR']);
    expect(() => callConfigHook(plugin)).toThrow('deployment.env.example');
  });

  it('skips validation when VITEST env var is set', () => {
    process.env['VITEST'] = 'true';
    delete process.env['VITE_MISSING_VAR'];

    const plugin = envValidationPlugin(['VITE_MISSING_VAR']);
    expect(() => callConfigHook(plugin)).not.toThrow();
  });
});

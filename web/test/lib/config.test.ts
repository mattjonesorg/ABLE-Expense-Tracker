import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CognitoConfig } from '../../src/lib/config';

describe('config', () => {
  beforeEach(() => {
    // Reset module cache before each test so env changes take effect
    vi.resetModules();
  });

  afterEach(() => {
    // Restore all stubbed env vars
    vi.unstubAllEnvs();
  });

  /**
   * Helper: stub all required VITE_* env vars so the config module can load.
   */
  function stubAllEnvVars() {
    vi.stubEnv('VITE_COGNITO_USER_POOL_ID', 'us-east-1_TestPool');
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'test-client-id');
    vi.stubEnv('VITE_AWS_REGION', 'us-east-1');
    vi.stubEnv('VITE_API_URL', 'https://test.example.com');
  }

  it('exports a getCognitoConfig function', async () => {
    stubAllEnvVars();

    const { getCognitoConfig } = await import('../../src/lib/config');
    expect(typeof getCognitoConfig).toBe('function');
  });

  it('throws when VITE_COGNITO_USER_POOL_ID is missing', async () => {
    vi.stubEnv('VITE_COGNITO_USER_POOL_ID', '');
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'test-client-id');
    vi.stubEnv('VITE_AWS_REGION', 'us-east-1');
    vi.stubEnv('VITE_API_URL', 'https://test.example.com');

    const { getCognitoConfig } = await import('../../src/lib/config');
    expect(() => getCognitoConfig()).toThrow('VITE_COGNITO_USER_POOL_ID');
  });

  it('throws when VITE_COGNITO_CLIENT_ID is missing', async () => {
    vi.stubEnv('VITE_COGNITO_USER_POOL_ID', 'us-east-1_TestPool');
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', '');
    vi.stubEnv('VITE_AWS_REGION', 'us-east-1');
    vi.stubEnv('VITE_API_URL', 'https://test.example.com');

    const { getCognitoConfig } = await import('../../src/lib/config');
    expect(() => getCognitoConfig()).toThrow('VITE_COGNITO_CLIENT_ID');
  });

  it('throws when VITE_AWS_REGION is missing', async () => {
    vi.stubEnv('VITE_COGNITO_USER_POOL_ID', 'us-east-1_TestPool');
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'test-client-id');
    vi.stubEnv('VITE_AWS_REGION', '');
    vi.stubEnv('VITE_API_URL', 'https://test.example.com');

    const { getCognitoConfig } = await import('../../src/lib/config');
    expect(() => getCognitoConfig()).toThrow('VITE_AWS_REGION');
  });

  it('error message points to deployment.env.example', async () => {
    vi.stubEnv('VITE_COGNITO_USER_POOL_ID', '');
    vi.stubEnv('VITE_API_URL', 'https://test.example.com');

    const { getCognitoConfig } = await import('../../src/lib/config');
    expect(() => getCognitoConfig()).toThrow('deployment.env.example');
  });

  it('derives cognitoEndpoint from region', async () => {
    vi.stubEnv('VITE_COGNITO_USER_POOL_ID', 'us-west-2_TestPool');
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'test-client-id');
    vi.stubEnv('VITE_AWS_REGION', 'us-west-2');
    vi.stubEnv('VITE_API_URL', 'https://test.example.com');

    const { getCognitoConfig } = await import('../../src/lib/config');
    const config = getCognitoConfig();

    expect(config.cognitoEndpoint).toBe(
      'https://cognito-idp.us-west-2.amazonaws.com/',
    );
  });

  it('reads from VITE_ environment variables when set', async () => {
    vi.stubEnv('VITE_COGNITO_USER_POOL_ID', 'us-west-2_TestPool');
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'test-client-id-123');
    vi.stubEnv('VITE_AWS_REGION', 'us-west-2');
    vi.stubEnv('VITE_API_URL', 'https://test.example.com');

    const { getCognitoConfig } = await import('../../src/lib/config');
    const config: CognitoConfig = getCognitoConfig();

    expect(config.userPoolId).toBe('us-west-2_TestPool');
    expect(config.clientId).toBe('test-client-id-123');
    expect(config.region).toBe('us-west-2');
    expect(config.cognitoEndpoint).toBe(
      'https://cognito-idp.us-west-2.amazonaws.com/',
    );
  });

  it('throws when VITE_API_URL is missing', async () => {
    vi.stubEnv('VITE_COGNITO_USER_POOL_ID', 'us-east-1_TestPool');
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'test-client-id');
    vi.stubEnv('VITE_AWS_REGION', 'us-east-1');
    vi.stubEnv('VITE_API_URL', '');

    // API_URL is evaluated at module load time via requireEnv
    await expect(import('../../src/lib/config')).rejects.toThrow('VITE_API_URL');
  });

  it('API_URL reads from VITE_API_URL environment variable', async () => {
    vi.stubEnv('VITE_COGNITO_USER_POOL_ID', 'us-east-1_TestPool');
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'test-client-id');
    vi.stubEnv('VITE_AWS_REGION', 'us-east-1');
    vi.stubEnv('VITE_API_URL', 'https://custom-api.example.com');

    const { API_URL } = await import('../../src/lib/config');

    expect(typeof API_URL).toBe('string');
    expect(API_URL).toBe('https://custom-api.example.com');
    expect(API_URL.endsWith('/')).toBe(false);
    expect(API_URL.startsWith('https://')).toBe(true);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CognitoConfig } from '../../src/lib/config';

describe('config', () => {
  const originalEnv = import.meta.env;

  beforeEach(() => {
    // Reset module cache before each test so env changes take effect
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original env
    import.meta.env = originalEnv;
  });

  it('exports a getCognitoConfig function', async () => {
    const { getCognitoConfig } = await import('../../src/lib/config');
    expect(typeof getCognitoConfig).toBe('function');
  });

  it('returns default values when no environment variables are set', async () => {
    const { getCognitoConfig } = await import('../../src/lib/config');
    const config: CognitoConfig = getCognitoConfig();

    expect(config.userPoolId).toBe('us-east-1_opSjkMtF1');
    expect(config.clientId).toBe('75cl182936abdsr5b4ur97afs8');
    expect(config.region).toBe('us-east-1');
  });

  it('derives cognitoEndpoint from region', async () => {
    const { getCognitoConfig } = await import('../../src/lib/config');
    const config = getCognitoConfig();

    expect(config.cognitoEndpoint).toBe(
      'https://cognito-idp.us-east-1.amazonaws.com/',
    );
  });

  it('reads from VITE_ environment variables when set', async () => {
    // Override env values
    import.meta.env.VITE_COGNITO_USER_POOL_ID = 'us-west-2_TestPool';
    import.meta.env.VITE_COGNITO_CLIENT_ID = 'test-client-id-123';
    import.meta.env.VITE_AWS_REGION = 'us-west-2';

    const { getCognitoConfig } = await import('../../src/lib/config');
    const config = getCognitoConfig();

    expect(config.userPoolId).toBe('us-west-2_TestPool');
    expect(config.clientId).toBe('test-client-id-123');
    expect(config.region).toBe('us-west-2');
    expect(config.cognitoEndpoint).toBe(
      'https://cognito-idp.us-west-2.amazonaws.com/',
    );

    // Clean up
    delete import.meta.env.VITE_COGNITO_USER_POOL_ID;
    delete import.meta.env.VITE_COGNITO_CLIENT_ID;
    delete import.meta.env.VITE_AWS_REGION;
  });
});

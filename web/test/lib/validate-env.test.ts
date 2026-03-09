import { describe, it, expect } from 'vitest';
import { validateRequiredEnvVars } from '../../src/lib/validate-env';

const REQUIRED_VARS = [
  'VITE_COGNITO_USER_POOL_ID',
  'VITE_COGNITO_CLIENT_ID',
  'VITE_AWS_REGION',
  'VITE_API_URL',
];

describe('validateRequiredEnvVars', () => {
  it('returns no errors when all required env vars are present', () => {
    const env: Record<string, string> = {
      VITE_COGNITO_USER_POOL_ID: 'us-east-1_TestPool',
      VITE_COGNITO_CLIENT_ID: 'test-client-id',
      VITE_AWS_REGION: 'us-east-1',
      VITE_API_URL: 'https://api.example.com',
    };
    const errors = validateRequiredEnvVars(REQUIRED_VARS, env);
    expect(errors).toEqual([]);
  });

  it('returns errors for missing env vars', () => {
    const env: Record<string, string> = {
      VITE_COGNITO_USER_POOL_ID: 'us-east-1_TestPool',
      VITE_AWS_REGION: 'us-east-1',
    };
    const errors = validateRequiredEnvVars(REQUIRED_VARS, env);
    expect(errors).toContain('VITE_COGNITO_CLIENT_ID');
    expect(errors).toContain('VITE_API_URL');
    expect(errors).toHaveLength(2);
  });

  it('returns errors for empty string env vars', () => {
    const env: Record<string, string> = {
      VITE_COGNITO_USER_POOL_ID: 'us-east-1_TestPool',
      VITE_COGNITO_CLIENT_ID: '',
      VITE_AWS_REGION: 'us-east-1',
      VITE_API_URL: '',
    };
    const errors = validateRequiredEnvVars(REQUIRED_VARS, env);
    expect(errors).toContain('VITE_COGNITO_CLIENT_ID');
    expect(errors).toContain('VITE_API_URL');
    expect(errors).toHaveLength(2);
  });

  it('returns errors for whitespace-only env vars', () => {
    const env: Record<string, string> = {
      VITE_COGNITO_USER_POOL_ID: '  ',
      VITE_COGNITO_CLIENT_ID: 'test-client-id',
      VITE_AWS_REGION: 'us-east-1',
      VITE_API_URL: 'https://api.example.com',
    };
    const errors = validateRequiredEnvVars(REQUIRED_VARS, env);
    expect(errors).toContain('VITE_COGNITO_USER_POOL_ID');
    expect(errors).toHaveLength(1);
  });

  it('returns all vars as errors when env is empty', () => {
    const errors = validateRequiredEnvVars(REQUIRED_VARS, {});
    expect(errors).toEqual(REQUIRED_VARS);
  });

  it('returns empty array when required list is empty', () => {
    const errors = validateRequiredEnvVars([], {});
    expect(errors).toEqual([]);
  });
});

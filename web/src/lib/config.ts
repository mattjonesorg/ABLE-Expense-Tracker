/**
 * Environment configuration for the ABLE Tracker frontend.
 * Reads from Vite environment variables with sensible defaults
 * for the deployed ABLE Tracker infrastructure.
 */

export interface CognitoConfig {
  /** Cognito User Pool ID (e.g., us-east-1_opSjkMtF1) */
  userPoolId: string;
  /** Cognito App Client ID */
  clientId: string;
  /** AWS region */
  region: string;
  /** Full Cognito IDP endpoint URL */
  cognitoEndpoint: string;
}

/**
 * Returns the Cognito configuration, reading from VITE_ environment
 * variables with fallback defaults for the deployed infrastructure.
 */
export function getCognitoConfig(): CognitoConfig {
  const userPoolId =
    (import.meta.env.VITE_COGNITO_USER_POOL_ID as string | undefined) ??
    'us-east-1_opSjkMtF1';
  const clientId =
    (import.meta.env.VITE_COGNITO_CLIENT_ID as string | undefined) ??
    '75cl182936abdsr5b4ur97afs8';
  const region =
    (import.meta.env.VITE_AWS_REGION as string | undefined) ?? 'us-east-1';

  return {
    userPoolId,
    clientId,
    region,
    cognitoEndpoint: `https://cognito-idp.${region}.amazonaws.com/`,
  };
}

/** Base URL for the ABLE Tracker API (no trailing slash) */
export const API_URL: string =
  (import.meta.env['VITE_API_URL'] as string | undefined) ??
  'https://04xlqwybf6.execute-api.us-east-1.amazonaws.com';

/**
 * Environment configuration for the ABLE Tracker frontend.
 *
 * All deployment-specific values are read from VITE_* environment variables.
 * There are NO hardcoded defaults -- each deployer must configure their own
 * values. See deployment.env.example in the repo root for documentation.
 *
 * For local development, create a web/.env.local file with:
 *   VITE_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
 *   VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
 *   VITE_AWS_REGION=us-east-1
 *   VITE_API_URL=https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com
 */

export interface CognitoConfig {
  /** Cognito User Pool ID (e.g., us-east-1_XXXXXXXXX) */
  userPoolId: string;
  /** Cognito App Client ID */
  clientId: string;
  /** AWS region */
  region: string;
  /** Full Cognito IDP endpoint URL */
  cognitoEndpoint: string;
}

/**
 * Reads a required VITE_* environment variable. Throws a clear error
 * if the variable is not set, pointing the developer to the setup docs.
 */
function requireEnv(name: string): string {
  const value = import.meta.env[name] as string | undefined;
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Copy deployment.env.example to deployment.env and set your values, ` +
        `then create web/.env.local with the corresponding VITE_* variables. ` +
        `See deployment.env.example for details.`
    );
  }
  return value;
}

/**
 * Returns the Cognito configuration, reading from VITE_* environment
 * variables. Throws if any required variable is missing.
 */
export function getCognitoConfig(): CognitoConfig {
  const userPoolId = requireEnv('VITE_COGNITO_USER_POOL_ID');
  const clientId = requireEnv('VITE_COGNITO_CLIENT_ID');
  const region = requireEnv('VITE_AWS_REGION');

  return {
    userPoolId,
    clientId,
    region,
    cognitoEndpoint: `https://cognito-idp.${region}.amazonaws.com/`,
  };
}

/** Base URL for the ABLE Tracker API (no trailing slash) */
export const API_URL: string = requireEnv('VITE_API_URL');

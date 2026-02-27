/**
 * Environment configuration for the ABLE Tracker frontend.
 * Values are injected at build time by Vite via import.meta.env.
 */

/** Base URL for the ABLE Tracker API (no trailing slash) */
export const API_URL: string =
  import.meta.env['VITE_API_URL'] as string ??
  'https://04xlqwybf6.execute-api.us-east-1.amazonaws.com';

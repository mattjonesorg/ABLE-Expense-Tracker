import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { envValidationPlugin, REQUIRED_ENV_VARS } from './src/lib/validate-env';

export default defineConfig({
  plugins: [react(), envValidationPlugin(REQUIRED_ENV_VARS)],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    passWithNoTests: true,
    exclude: ['e2e/**', 'node_modules/**'],
  },
});

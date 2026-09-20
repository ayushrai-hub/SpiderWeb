import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', '**/node_modules/**'],
    // Integration tests share one database; running files in parallel would
    // make row counts non-deterministic.
    fileParallelism: false,
    globalSetup: ['tests/setup/global-setup.ts'],
    setupFiles: ['tests/setup/setup-files.ts'],
    testTimeout: 60000,
    hookTimeout: 60000,
    server: {
      deps: {
        inline: ['@intel/shared', '@intel/database', '@intel/ingestion', '@intel/analytics'],
      },
    },
  },
  resolve: {
    alias: [
      { find: '@intel/shared', replacement: path.resolve(__dirname, 'packages/shared/src') },
      { find: '@intel/database', replacement: path.resolve(__dirname, 'packages/database/src') },
      { find: '@intel/ingestion', replacement: path.resolve(__dirname, 'packages/ingestion/src') },
      { find: '@intel/analytics', replacement: path.resolve(__dirname, 'packages/analytics/src') },
    ],
  },
});

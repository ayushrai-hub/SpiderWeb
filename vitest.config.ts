import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    server: {
      deps: {
        inline: ['@intel/shared', '@intel/types', '@intel/database', '@intel/ingestion'],
      },
    },
  },
  resolve: {
    alias: {
      '@intel/shared': path.resolve(__dirname, 'packages/shared/src'),
      '@intel/types': path.resolve(__dirname, 'packages/types/src'),
      '@intel/database': path.resolve(__dirname, 'packages/database/src'),
      '@intel/ingestion': path.resolve(__dirname, 'packages/ingestion/src'),
    },
  },
});

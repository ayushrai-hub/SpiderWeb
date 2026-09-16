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
    alias: [
      { find: '@intel/shared', replacement: path.resolve(__dirname, 'packages/shared/src') },
      { find: '@intel/types', replacement: path.resolve(__dirname, 'packages/types/src') },
      { find: '@intel/database', replacement: path.resolve(__dirname, 'packages/database/src') },
      { find: '@intel/ingestion', replacement: path.resolve(__dirname, 'packages/ingestion/src') },
      // fflate is a dependency of @intel/ingestion, not the root — resolve from there
      { find: /^fflate$/, replacement: path.resolve(__dirname, 'packages/ingestion/node_modules/fflate') },
    ],
  },
});

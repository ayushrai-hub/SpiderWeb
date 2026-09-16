import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    deps: {
      optimizer: {
        ssr: {
          include: ['postgres', 'ioredis', '@aws-sdk/client-s3'],
        },
      },
    },
  },
});

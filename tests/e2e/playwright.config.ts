import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests drive the real UI against a real API and database.
 *
 * They assume `pnpm dev` is already running (or start it themselves). The
 * suite clears and re-imports the workspace, so point DATABASE_URL at a
 * scratch database before running it against anything you care about.
 */
export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  // The suite mutates one shared workspace; parallel files would race.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
      testIgnore: /responsive\.spec\.ts/,
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: 'pnpm --dir ../.. dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});

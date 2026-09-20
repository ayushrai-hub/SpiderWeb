import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { join } from 'node:path';
import { ARTIFACTS } from '../global-setup';

export const API_BASE = process.env.E2E_API_URL ?? 'http://localhost:3001';

export function archive(name: string): string {
  return join(ARTIFACTS, name);
}

/** Remove every imported record so a run starts from the onboarding state. */
export async function resetWorkspace(request: APIRequestContext): Promise<void> {
  const response = await request.post(`${API_BASE}/api/v1/network/reset`, {
    data: { confirm: 'DELETE' },
  });
  expect(response.ok(), `reset failed: ${await response.text()}`).toBeTruthy();
}

/** Upload an archive through the UI and wait for processing to finish. */
export async function importArchive(page: Page, file: string): Promise<void> {
  await page.goto('/imports');
  await page.setInputFiles('input[type="file"]', archive(file));
  await expect(page).toHaveURL(/\/imports\/[0-9a-f-]{36}/, { timeout: 30_000 });
  await expect(page.getByText(/^(Completed|Partially completed|Failed)$/).first()).toBeVisible({
    timeout: 40_000,
  });
}

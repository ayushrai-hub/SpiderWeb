import { expect, test } from '@playwright/test';
import { importArchive, resetWorkspace } from './fixtures';

/** Destructive and export actions, including their safeguards. */
test.describe.configure({ mode: 'serial' });

test.describe('data management', () => {
  test.beforeAll(async ({ request }) => {
    await resetWorkspace(request);
  });

  test('settings shows the workspace and its data', async ({ page }) => {
    await importArchive(page, 'linkedin-export.zip');
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await expect(page.getByText('you@localhost')).toBeVisible();
    await expect(page.getByText('Alex Rivera')).toBeVisible();
    await expect(page.getByText('This build runs as a single local operator')).toBeVisible();
  });

  test('exports download real files', async ({ page }) => {
    await page.goto('/settings');
    for (const [label, expected] of [
      ['Download connections (CSV)', 'spiderweb-connections.csv'],
      ['Download companies (CSV)', 'spiderweb-companies.csv'],
      ['Download analytics (JSON)', 'spiderweb-network.json'],
    ] as const) {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('link', { name: label }).click(),
      ]);
      expect(download.suggestedFilename()).toBe(expected);
    }
  });

  test('recalculating analytics reports success', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Recalculate analytics' }).click();
    await expect(page.getByText('Derived analytics recalculated.')).toBeVisible();
  });

  test('deleting an import is confirmed first and can keep the data', async ({ page }) => {
    await page.goto('/imports');
    await page.locator('tbody tr').first().getByRole('link').click();
    await expect(page).toHaveURL(/\/imports\/[0-9a-f-]{36}/);

    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete this import?' });
    await expect(dialog).toBeVisible();

    // Cancelling leaves everything alone.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.getByRole('button', { name: 'Delete import' }).click();
    await expect(page).toHaveURL(/\/imports$/);
    await expect(page.getByText('No imports yet')).toBeVisible();

    // The network itself was kept, because the box was left unticked.
    await page.goto('/people');
    await expect(page.getByText(/12 of your connections match/)).toBeVisible();
  });

  test('wiping the network requires typing DELETE', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('button', { name: 'Delete all imported data' }).click();

    const dialog = page.getByRole('dialog', { name: 'Delete all imported data?' });
    await expect(dialog).toBeVisible();
    const confirm = dialog.getByRole('button', { name: 'Delete everything' });
    await expect(confirm).toBeDisabled();

    await dialog.getByLabel('Type DELETE to confirm').fill('delete');
    await expect(confirm).toBeDisabled();

    await dialog.getByLabel('Type DELETE to confirm').fill('DELETE');
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page.getByText(/Deleted 13 people/)).toBeVisible();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome to SpiderWeb' })).toBeVisible();
  });
});

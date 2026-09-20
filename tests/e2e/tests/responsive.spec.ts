import { expect, test } from '@playwright/test';

/**
 * Mobile viewport checks. Runs in the `mobile` project (Pixel 7) and assumes
 * the workspace already has data from the desktop journey run.
 */
test.describe('mobile layout', () => {
  test('the sidebar collapses into a working drawer', async ({ page }) => {
    await page.goto('/');
    // The desktop sidebar is hidden below lg.
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();

    await page.getByRole('button', { name: 'Open menu' }).click();
    const drawer = page.getByRole('dialog', { name: 'Navigation' });
    await expect(drawer).toBeVisible();

    await drawer.getByRole('link', { name: 'People', exact: true }).click();
    await expect(page).toHaveURL(/\/people$/);
    await expect(drawer).toBeHidden();
  });

  test('search is reachable without the drawer', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('combobox')).toBeVisible();
  });

  test('tables scroll horizontally instead of overflowing the page', async ({ page }) => {
    await page.goto('/people');
    await expect(page.locator('table').first()).toBeVisible();
    const overflowsBody = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(overflowsBody).toBe(false);
  });

  for (const path of ['/', '/people', '/companies', '/analytics', '/graph', '/imports', '/settings']) {
    test(`${path} fits the viewport`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      );
      expect(overflows, `${path} scrolls horizontally on mobile`).toBe(false);
    });
  }

  test('the upload control is usable on a phone', async ({ page }) => {
    await page.goto('/imports');
    await expect(page.getByRole('button', { name: 'Choose files' })).toBeVisible();
    await expect(page.getByText('Drop your LinkedIn export here')).toBeVisible();
  });
});

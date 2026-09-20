import { expect, test } from '@playwright/test';
import { archive, importArchive, resetWorkspace } from './fixtures';

/**
 * The full journey a real user takes, in order, against a real API and
 * database: empty state → import → dashboard → search → filter → profile →
 * company → graph → notes → second import → persistence.
 */
test.describe.configure({ mode: 'serial' });

test.describe('first run', () => {
  test.beforeAll(async ({ request }) => {
    await resetWorkspace(request);
  });

  test('a new workspace explains what to do instead of showing an empty dashboard', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Welcome to SpiderWeb' })).toBeVisible();
    await expect(
      page.getByText('Turn your LinkedIn export into a network you can actually query')
    ).toBeVisible();
    await expect(page.getByText('Request your archive')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose files' })).toBeVisible();
  });

  test('list pages explain the empty state rather than erroring', async ({ page }) => {
    await page.goto('/people');
    await expect(page.getByText('No people yet')).toBeVisible();
    await page.goto('/companies');
    await expect(page.getByText('No companies yet')).toBeVisible();
    await page.goto('/analytics');
    await expect(page.getByText('No data to analyse yet')).toBeVisible();
    await page.goto('/graph');
    await expect(page.getByText('Nothing to draw yet')).toBeVisible();
  });

  test('rejects a file that is not a LinkedIn export, with a reason', async ({ page }) => {
    await page.goto('/imports');
    await page.setInputFiles('input[type="file"]', archive('resume.pdf'));
    await expect(page.getByText(/Upload failed/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/\.pdf is not supported/)).toBeVisible();
  });
});

test.describe('importing a LinkedIn archive', () => {
  test.beforeAll(async ({ request }) => {
    await resetWorkspace(request);
  });

  test('uploads, processes and reports exactly what happened', async ({ page }) => {
    await importArchive(page, 'linkedin-export.zip');

    await expect(page.getByText('Completed').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Files read' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'connections', exact: true })).toBeVisible();
    // Datasets SpiderWeb deliberately skips are named, not silently dropped.
    await expect(page.getByText(/Advertising data/).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What was created' })).toBeVisible();
  });

  test('the dashboard fills with real numbers', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('Alex Rivera')).toBeVisible();

    await expect(page.locator('[data-stat="Connections"]')).toContainText('12');
    await expect(page.locator('[data-stat="Companies"]')).toContainText('9');

    await expect(page.getByRole('heading', { name: 'Network growth' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Where your network works' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Acme Corp/ }).first()).toBeVisible();
  });

  test('global search finds a person and navigates to them', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('combobox').fill('Jane');
    const personHit = page.getByRole('option', { name: /Jane Smith Senior Engineer/ });
    await expect(personHit).toBeVisible({ timeout: 10_000 });
    await personHit.click();
    await expect(page).toHaveURL(/\/people\/[0-9a-f-]{36}/);
    await expect(page.getByRole('heading', { name: 'Jane Smith' })).toBeVisible();
  });

  test('filters combine and narrow the list', async ({ page }) => {
    await page.goto('/people');
    await expect(page.getByText(/12 of your connections match/)).toBeVisible();

    // Company filter alone.
    await page.getByLabel('Current company').selectOption('Acme Corp');
    await expect(page.getByText(/3 of your connections match/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Frank Chen' })).toBeVisible();

    // Company + title narrows further: only Jane and Frank are "… Engineer".
    await page.getByLabel('Job title').selectOption('Staff Engineer');
    await expect(page.getByText(/1 of your connections match/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Frank Chen' })).toBeVisible();

    await page.getByRole('button', { name: /Clear \d+ filters?/ }).click();
    await expect(page.getByText(/12 of your connections match/)).toBeVisible();

    // A signal chip narrows on its own.
    await page.getByRole('button', { name: /No employer recorded/ }).click();
    await expect(page.getByText(/1 of your connections match/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Noor Haddad' })).toBeVisible();
  });

  test('search with a typo still finds the person', async ({ page }) => {
    await page.goto('/people');
    await page.getByLabel('Search', { exact: true }).fill('okonkw');
    await expect(page.getByRole('link', { name: 'Grace Okonkwo' })).toBeVisible({ timeout: 10_000 });
  });

  test('a profile shows the imported facts and the signals derived from them', async ({ page }) => {
    await page.goto('/people');
    await page.getByRole('link', { name: 'Jane Smith' }).click();

    await expect(page.getByRole('heading', { name: 'Jane Smith' })).toBeVisible();
    await expect(page.getByText('Senior Engineer at Acme Corp').first()).toBeVisible();
    await expect(page.getByText('jane.smith@example.com')).toBeVisible();
    await expect(page.getByRole('link', { name: /Open on LinkedIn/ })).toHaveAttribute(
      'href',
      'https://www.linkedin.com/in/janesmith'
    );
    await expect(page.getByRole('heading', { name: 'Experience' })).toBeVisible();
    await expect(page.getByText('Shared employer:')).toBeVisible();
  });

  test('notes and tags save and appear in filters', async ({ page }) => {
    await page.goto('/people');
    await page.getByRole('link', { name: 'Frank Chen' }).click();

    await page.getByLabel('New note').fill('Met at KubeCon; interested in platform work.');
    await page.getByRole('button', { name: 'Add note' }).click();
    await expect(page.getByText('Met at KubeCon; interested in platform work.')).toBeVisible();

    await page.getByLabel('Tags, comma separated').fill('mentor, hiring');
    await page.getByRole('button', { name: 'Save tags' }).click();
    await expect(page.getByText('Tags updated.')).toBeVisible();
    // Wait for the saved tags to render before navigating away, so the
    // assertion below cannot race the mutation.
    await expect(page.locator('.badge', { hasText: 'mentor' })).toBeVisible();

    await page.goto('/people?tag=mentor');
    await expect(page.getByRole('link', { name: 'Frank Chen' })).toBeVisible();
  });

  test('a company page shows who you know there', async ({ page }) => {
    await page.goto('/companies');
    await page.getByRole('link', { name: 'Acme Corp' }).click();
    await expect(page.getByRole('heading', { name: 'Acme Corp' })).toBeVisible();
    await expect(page.getByText('You have worked here')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Jane Smith' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Common titles' })).toBeVisible();
  });

  test('the graph renders, is aggregated, and drills into a company', async ({ page }) => {
    await page.goto('/graph');
    await expect(page.getByRole('img', { name: /Network graph with \d+ nodes/ })).toBeVisible();

    await page
      .getByRole('button', { name: /Acme Corp/ })
      .first()
      .click();
    await expect(page).toHaveURL(/companyId=/);
    await expect(page.getByRole('button', { name: /Jane Smith/ })).toBeVisible({ timeout: 15_000 });
  });

  test('conversations list and thread render imported messages', async ({ page }) => {
    await page.goto('/conversations');
    await expect(page.getByText(/2 message threads/)).toBeVisible();
    await page.getByRole('link', { name: /Jane Smith/ }).click();

    await expect(page).toHaveURL(/\/conversations\/[0-9a-f-]{36}/);
    await expect(page.getByText('Hi Alex — are you hiring for platform roles?')).toBeVisible();
    // Direction comes from the export's FOLDER column and your own profile.
    await expect(page.getByText('You', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'View profile' })).toBeVisible();
  });

  test('jobs list shows who you know at each company', async ({ page }) => {
    await page.goto('/jobs');
    const globexRow = page.locator('tbody tr', { hasText: 'VP Platform' });
    await expect(globexRow.getByRole('link', { name: 'Globex' })).toBeVisible();
    await expect(globexRow.getByText('Applied')).toBeVisible();
  });

  test('analytics only shows charts it has data for', async ({ page }) => {
    await page.goto('/analytics');
    await expect(page.getByRole('heading', { name: 'Network growth' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Company concentration' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Reconnect opportunities' })).toBeVisible();
    // Location/industry are absent from Connections.csv and are explained, not faked.
    await expect(page.getByText(/breakdowns are empty/)).toBeVisible();
  });
});

test.describe('a second import', () => {
  test('adds new people, records a career move and preserves notes', async ({ page }) => {
    await importArchive(page, 'linkedin-export-v2.zip');

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Career moves' })).toBeVisible();
    await expect(page.getByText('Acme Corp → Globex')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Jane Smith' }).first()).toBeVisible();

    await page.goto('/people');
    await expect(page.getByText(/13 of your connections match/)).toBeVisible();

    await page.goto('/people?tag=mentor');
    await page.getByRole('link', { name: 'Frank Chen' }).click();
    await expect(page.getByText('Met at KubeCon; interested in platform work.')).toBeVisible();
  });

  test('import history lists both imports with their outcomes', async ({ page }) => {
    await page.goto('/imports');
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(page.getByText('Completed').first()).toBeVisible();
  });

  test('data survives a full reload', async ({ page }) => {
    await page.goto('/people');
    await page.reload();
    await expect(page.getByText(/13 of your connections match/)).toBeVisible();
  });
});

test.describe('navigation', () => {
  const pages = [
    ['Dashboard', '/', 'Dashboard'],
    ['Analytics', '/analytics', 'Analytics'],
    ['Network graph', '/graph', 'Network graph'],
    ['People', '/people', 'People'],
    ['Companies', '/companies', 'Companies'],
    ['Conversations', '/conversations', 'Conversations'],
    ['Jobs', '/jobs', 'Jobs'],
    ['Imports', '/imports', 'Imports'],
    ['Settings', '/settings', 'Settings'],
  ] as const;

  for (const [linkName, url, heading] of pages) {
    test(`the ${linkName} nav item works`, async ({ page }) => {
      await page.goto('/');
      await page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('link', { name: linkName, exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp(`${url.replace('/', '\\/')}$`));
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    });
  }

  test("an unknown route shows Next's 404, not a crash", async ({ page }) => {
    const response = await page.goto('/does-not-exist');
    expect(response?.status()).toBe(404);
  });
});

test.describe('console hygiene', () => {
  test('no page logs a console error', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    for (const url of [
      '/',
      '/people',
      '/companies',
      '/graph',
      '/analytics',
      '/conversations',
      '/jobs',
      '/imports',
      '/settings',
    ]) {
      await page.goto(url);
      await page.waitForLoadState('networkidle');
    }
    expect(errors).toEqual([]);
  });
});

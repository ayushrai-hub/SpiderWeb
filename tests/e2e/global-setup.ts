import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildArchive, buildIrrelevantArchive, CONNECTIONS_V2 } from '../fixtures/linkedin-export';

export const ARTIFACTS = join(__dirname, '.artifacts');

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

const ROUTES = [
  '/',
  '/people',
  '/companies',
  '/graph',
  '/analytics',
  '/conversations',
  '/jobs',
  '/imports',
  '/settings',
];

export default async function globalSetup(): Promise<void> {
  // Archives the specs upload. Generated, not committed as binaries.
  mkdirSync(ARTIFACTS, { recursive: true });
  writeFileSync(join(ARTIFACTS, 'linkedin-export.zip'), buildArchive());
  writeFileSync(join(ARTIFACTS, 'linkedin-export-v2.zip'), buildArchive({ connections: CONNECTIONS_V2 }));
  writeFileSync(join(ARTIFACTS, 'not-linkedin.zip'), buildIrrelevantArchive());
  writeFileSync(join(ARTIFACTS, 'resume.pdf'), '%PDF-1.4 not a linkedin export');

  await warmUpRoutes();
}

/**
 * `next dev` compiles a route the first time it is requested, which can take
 * far longer than a per-assertion timeout. Request every route once up front so
 * the suite measures the app, not the bundler.
 */
async function warmUpRoutes(): Promise<void> {
  const deadline = Date.now() + 120_000;
  for (const route of ROUTES) {
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`${BASE_URL}${route}`, { signal: AbortSignal.timeout(90_000) });
        if (response.ok) {
          await response.text();
          break;
        }
      } catch {
        // Server not up yet; retry until the deadline.
      }
      await new Promise((r) => setTimeout(r, 1_000));
    }
  }
}

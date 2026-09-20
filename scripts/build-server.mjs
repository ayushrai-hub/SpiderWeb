#!/usr/bin/env node
/**
 * Bundle a server entrypoint for production.
 *
 * Workspace packages (`@intel/*`) are TypeScript source, so they are inlined
 * into the bundle. Everything from node_modules stays external and is
 * installed normally at deploy time.
 *
 * Usage: node scripts/build-server.mjs <entry.ts> <outfile.js>
 */
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [entry, outfile] = process.argv.slice(2);

if (!entry || !outfile) {
  console.error('Usage: build-server.mjs <entry> <outfile>');
  process.exit(1);
}

/** Every runtime dependency declared by the package being built. */
function externals(packageJsonPath) {
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  return Object.keys(pkg.dependencies ?? {}).filter((name) => !name.startsWith('@intel/'));
}

const packageJson = resolve(dirname(resolve(entry)), '..', 'package.json');

await build({
  entryPoints: [resolve(entry)],
  outfile: resolve(outfile),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  external: [...externals(packageJson), 'pino-pretty'],
  logLevel: 'info',
  banner: {
    // Some CommonJS dependencies expect these to exist in an ESM bundle.
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "import { fileURLToPath as __fileURLToPath } from 'node:url';",
      "import { dirname as __dirname_ } from 'node:path';",
      'const require = __createRequire(import.meta.url);',
      'const __filename = __fileURLToPath(import.meta.url);',
      'const __dirname = __dirname_(__filename);',
    ].join('\n'),
  },
  absWorkingDir: root,
});

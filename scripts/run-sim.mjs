// Runner for the sim CLI. The sim/ sources use extensionless, vite-resolved imports
// and Node's native node:sqlite, so they need a resolver + TS strip to run. vite-node
// would do it but isn't installed (and the plan keeps the sim offline/zero-dep), so we
// bundle the entry with esbuild — which IS present — and import the result.
//
// The bundle is written next to the entry (sim/src/cli/) on purpose: load-db.ts finds
// the seed DB via `import.meta.url` + '../../../docs/db', which resolves correctly only
// from a file three levels below the repo root. sim/src/cli/ is exactly that depth, so
// the bundled module's own URL still points the DB loader at docs/db. The file is
// git-ignored and overwritten on each run.

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const entry = resolve(root, 'sim/src/cli/main.ts');
const outfile = resolve(root, 'sim/src/cli/.cli-bundle.mjs');

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Keep Node builtins (node:sqlite, node:fs, node:readline/promises, …) external so
  // the real runtime modules are used, not bundled shims.
  packages: 'external',
  logLevel: 'warning',
});

await import(pathToFileURL(outfile).href);

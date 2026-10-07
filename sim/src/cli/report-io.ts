// The only file-writing in the CLI: serialize a RunReport to JSON under the run's
// output directory. Kept apart from config.ts (pure) and the menus (prompts) so the
// one piece that touches the filesystem is small and obvious. The path is derived
// from the report's runKey, which already encodes level/role/effort, so repeated
// runs with the same config overwrite rather than pile up.

import { mkdirSync, writeFileSync } from 'node:fs';
import type { RunReport } from '../opt/reports';

/** Write `report` as pretty JSON to `<outDir>/<runKey>.json`; returns the path. */
export function writeReport(report: RunReport, outDir: string): string {
  mkdirSync(outDir, { recursive: true });
  const path = `${outDir}/${report.runKey}.json`;
  writeFileSync(path, JSON.stringify(report, null, 2));
  return path;
}

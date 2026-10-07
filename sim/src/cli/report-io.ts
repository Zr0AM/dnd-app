// The filesystem edge of the CLI: writing a RunReport out, and listing/reading the
// ones already written. Kept apart from config.ts (pure) and the menus (prompts) so
// the pieces that touch disk are small and swappable — flows take a CliIo so tests
// inject an in-memory fake and never hit the real filesystem. The report path is
// derived from the run's runKey (level/role/effort), so repeated runs with the same
// config overwrite rather than pile up.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import type { RunReport } from '../opt/reports';

/** The disk operations the flows need, behind an interface for testing. */
export interface CliIo {
  /** Write `report` as JSON under `outDir`; returns the written path. */
  writeReport(report: RunReport, outDir: string): string;
  /** The saved report filenames (basenames, `*.json`) in `dir`, or [] if none. */
  listReports(dir: string): string[];
  /** Parse a saved report file. */
  readReport(path: string): RunReport;
}

/** Write `report` as pretty JSON to `<outDir>/<runKey>.json`; returns the path. */
export function writeReport(report: RunReport, outDir: string): string {
  mkdirSync(outDir, { recursive: true });
  const path = `${outDir}/${report.runKey}.json`;
  writeFileSync(path, JSON.stringify(report, null, 2));
  return path;
}

/** List the `*.json` basenames in `dir` (empty when the directory is absent). */
export function listReports(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .sort();
}

/** Read and parse a saved report. */
export function readReport(path: string): RunReport {
  return JSON.parse(readFileSync(path, 'utf8')) as RunReport;
}

/** The real filesystem-backed IO. */
export const liveIo: CliIo = { writeReport, listReports, readReport };

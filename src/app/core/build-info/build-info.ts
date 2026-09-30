import { InjectionToken } from '@angular/core';
import { BUILD_INFO_VALUES } from './build-info.values';

export interface BuildInfo {
  /** package.json version. */
  readonly version: string;
  /** Short git commit, or 'unknown'. */
  readonly commit: string;
  /** UTC build date (YYYY-MM-DD), or 'unknown'. */
  readonly date: string;
}

/** Injectable so tests (and anything else) can supply their own value. */
export const BUILD_INFO = new InjectionToken<BuildInfo>('BUILD_INFO', {
  providedIn: 'root',
  factory: () => BUILD_INFO_VALUES,
});

/** e.g. "v0.1.0 · a1b2c3d · built 2026-09-30"; unknown parts are left out. */
export function formatBuildInfo(info: BuildInfo): string {
  return [
    `v${info.version}`,
    info.commit !== 'unknown' ? info.commit : null,
    info.date !== 'unknown' ? `built ${info.date}` : null,
  ]
    .filter((part) => part !== null)
    .join(' · ');
}

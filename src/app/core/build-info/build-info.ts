import { InjectionToken } from '@angular/core';
import { BUILD_INFO_VALUES } from './build-info.values';

export interface BuildInfo {
  /** Short git commit, or 'unknown'. */
  readonly commit: string;
  /**
   * Build number "<UTC date>_<GitHub Actions run>", e.g. "2026-10-01_042" ("_dev" suffix for a
   * local build, "_000" if the run number could not be determined), or 'unknown'.
   */
  readonly build: string;
}

/** Injectable so tests (and anything else) can supply their own value. */
export const BUILD_INFO = new InjectionToken<BuildInfo>('BUILD_INFO', {
  providedIn: 'root',
  factory: () => BUILD_INFO_VALUES,
});

/** e.g. "2026-09-30_042 · a1b2c3d"; unknown parts are left out (empty if both are). */
export function formatBuildInfo(info: BuildInfo): string {
  return [
    info.build !== 'unknown' ? info.build : null,
    info.commit !== 'unknown' ? info.commit : null,
  ]
    .filter((part) => part !== null)
    .join(' · ');
}

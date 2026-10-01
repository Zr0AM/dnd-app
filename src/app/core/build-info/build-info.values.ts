import type { BuildInfo } from './build-info';

// Committed placeholder so a fresh clone compiles without running the generator.
// `ng build` / `ng serve` replace this file with build-info.values.generated.ts
// (see fileReplacements in angular.json and scripts/generate-build-info.mjs).
export const BUILD_INFO_VALUES: BuildInfo = {
  commit: 'unknown',
  build: 'unknown',
};

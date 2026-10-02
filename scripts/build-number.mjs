// Build-number helpers for scripts/generate-build-info.mjs. Kept free of side effects (no file or
// process access) so they can be unit-tested from src/ with a stubbed clock.
//
// The build number reads "<UTC date>_<run>", e.g. 2026-10-01_042, where <run> is the number of the
// GitHub Actions "Build" workflow run for the commit being built.

const MAX_DATE_YEAR = 9999;

/**
 * UTC build date. Honours SOURCE_DATE_EPOCH (seconds) for reproducible builds, else `now`.
 * A blank, negative, non-numeric or out-of-range value (too large for a Date, or beyond year 9999,
 * where ISO 8601 switches to a signed extended year) is ignored.
 */
export function resolveBuildDate(sourceDateEpoch, now = new Date()) {
  const epoch = Number(sourceDateEpoch);
  if (Number.isFinite(epoch) && epoch > 0) {
    const date = new Date(epoch * 1000);
    if (!Number.isNaN(date.getTime()) && date.getUTCFullYear() <= MAX_DATE_YEAR) {
      return date;
    }
  }
  return now;
}

/**
 * "<yyyy-mm-dd>_<run>" using the UTC date. `run` is the workflow run number (padded to at least
 * three digits, more when it is larger), or 'dev' for a local build. Anything else renders as
 * 000.
 */
export function formatBuildNumber(date, run) {
  const day = date.toISOString().slice(0, 10);
  if (run === 'dev') {
    return `${day}_dev`;
  }
  const valid = Number.isSafeInteger(run) && run > 0;
  return `${day}_${String(valid ? run : 0).padStart(3, '0')}`;
}

/** A positive integer from an environment value such as GITHUB_RUN_NUMBER, else null. */
export function parseRunNumber(value) {
  if (typeof value !== 'string' || !/^[0-9]{1,15}$/.test(value.trim())) {
    return null;
  }
  const run = Number(value.trim());
  return run > 0 ? run : null;
}

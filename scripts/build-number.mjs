// Build-number helpers for scripts/generate-build-info.mjs. Kept free of side effects (no file or
// process access) so they can be unit-tested from src/ with a stubbed fetch and clock.
//
// The build number reads "<UTC date>_<run>", e.g. 2026-10-01_042, where <run> is the number of the
// GitHub Actions "Build" workflow run for the commit being built.

export const DEFAULT_REPO = 'Zr0AM/dnd-app';
export const WORKFLOW_FILE = 'build.yml';

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
 * three digits, more when it is larger), or 'dev' for a local build. Anything else (including
 * 0, which the caller uses for a failed lookup) renders as 000.
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

/**
 * Picks the run number out of a GitHub "list workflow runs" response: the newest run for the
 * commit, preferring push and pull_request runs over manual or scheduled ones.
 */
export function pickRunNumber(body, sha) {
  const runs = Array.isArray(body?.workflow_runs) ? body.workflow_runs : [];
  const forSha = runs.filter(
    (run) =>
      Number.isSafeInteger(run?.run_number) &&
      run.run_number > 0 &&
      (typeof run.head_sha !== 'string' ||
        run.head_sha.toLowerCase().startsWith(sha.toLowerCase())),
  );
  const preferred = forSha.filter((run) => run.event === 'push' || run.event === 'pull_request');
  const pool = preferred.length > 0 ? preferred : forSha;
  // Run numbers only ever increase, so the highest one is the most recent run.
  return pool.length > 0 ? Math.max(...pool.map((run) => run.run_number)) : null;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Looks the Actions run number for `sha` up through the GitHub REST API. Cloudflare Pages builds
 * the same commit that Actions builds, but outside Actions, so GITHUB_RUN_NUMBER is not available
 * there. The Pages build and the Actions run start at about the same time, so an empty result or
 * a transient failure is retried a few times.
 *
 * Never throws. Resolves to { runNumber, error }: runNumber is null on failure and `error` says
 * why (never contains the token).
 */
export async function lookupRunNumber({
  sha,
  token,
  repo = DEFAULT_REPO,
  fetchImpl = globalThis.fetch,
  attempts = 4,
  timeoutMs = 8000,
  retryDelayMs = 3000,
  sleep = delay,
}) {
  const url =
    `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/runs` +
    `?head_sha=${encodeURIComponent(sha)}&per_page=20`;
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'dnd-app-build-info',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let error = 'no attempt made';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt > 1) {
      await sleep(retryDelayMs);
    }
    try {
      const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) {
        error = `GitHub API answered HTTP ${response.status}`;
        // Rate limiting and client errors will not clear up within a few seconds.
        if (response.status < 500) {
          break;
        }
        continue;
      }
      const runNumber = pickRunNumber(await response.json(), sha);
      if (runNumber !== null) {
        return { runNumber, error: null };
      }
      error = 'no Build workflow run found for this commit yet';
    } catch (cause) {
      const timedOut = cause?.name === 'TimeoutError' || cause?.name === 'AbortError';
      error = timedOut
        ? `request timed out after ${timeoutMs} ms`
        : `request failed (${cause?.message ?? cause})`;
    }
  }
  return { runNumber: null, error };
}

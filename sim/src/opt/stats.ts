// Statistics for the evaluation: confidence intervals so a result reports not
// just a mean but how tightly it is known (metrics spec, Phase 5). Win rate is a
// proportion, so it uses a Wilson score interval (well-behaved near 0 and 1);
// the continuous means use a normal-approximation interval on the sample standard
// error. These also underpin the sequential-stopping rule the GA uses later.

/** A confidence interval around a point estimate. */
export interface Interval {
  readonly point: number;
  readonly lo: number;
  readonly hi: number;
  readonly halfWidth: number;
}

/** z for common confidence levels (two-sided). */
export const Z_95 = 1.959964;
export const Z_90 = 1.644854;

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** Sample standard deviation (Bessel-corrected, n-1). */
export function sampleStdDev(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const m = mean(values);
  let ss = 0;
  for (const v of values) ss += (v - m) * (v - m);
  return Math.sqrt(ss / (n - 1));
}

/**
 * Wilson score interval for a proportion (successes out of n), clamped to [0, 1].
 * More accurate than the normal approximation, especially for extreme rates.
 */
export function wilsonInterval(successes: number, n: number, z = Z_95): Interval {
  if (n === 0) return { point: 0, lo: 0, hi: 1, halfWidth: 0.5 };
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  const lo = Math.max(0, center - margin);
  const hi = Math.min(1, center + margin);
  return { point: p, lo, hi, halfWidth: (hi - lo) / 2 };
}

/** Normal-approximation confidence interval for the mean of a sample. */
export function meanInterval(values: readonly number[], z = Z_95): Interval {
  const n = values.length;
  const m = mean(values);
  if (n < 2) return { point: m, lo: m, hi: m, halfWidth: 0 };
  const se = sampleStdDev(values) / Math.sqrt(n);
  const half = z * se;
  return { point: m, lo: m - half, hi: m + half, halfWidth: half };
}

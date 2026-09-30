// Dependency-free so it can be unit-tested from src/ (the test runner only
// covers src/**/*.spec.ts) and bundled into the Pages Function.

// Returns the query string to send upstream: every caller param is kept, but
// `active` is forced to 1 so inactive catalog rows can never be requested.
// Any caller-supplied `active` (any casing, any number of times) is dropped.
export function withActiveOnly(search: string): string {
  const params = new URLSearchParams(search);
  for (const key of [...params.keys()]) {
    if (key.toLowerCase() === 'active') {
      params.delete(key);
    }
  }
  params.set('active', '1');
  return `?${params}`;
}

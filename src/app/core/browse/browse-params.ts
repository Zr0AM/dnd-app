// Helpers shared by the Spells, Monsters and Equipment screens for turning raw
// query-param strings into safe state. Absent params arrive as `undefined`;
// malformed values from hand-edited URLs fall back to the default.

export function toPositiveInt(value: string | undefined): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export function toPageSize(value: string | undefined): number {
  const n = Math.floor(Number(value));
  return [10, 25, 50].includes(n) ? n : 25;
}

export function toText(value: string | undefined): string {
  return value ?? '';
}

export function oneOf<T extends string>(allowed: readonly T[], fallback: T) {
  return (value: string | undefined): T =>
    value !== undefined && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

export function toDirection(value: string | undefined): 'asc' | 'desc' {
  return value === 'desc' ? 'desc' : 'asc';
}

export function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

import { MAX_CR } from './hoard-tables';

// A hoard code pairs the CR with the seed, e.g. "CR13-1K3F9QX", because the
// same seed rolls differently at each CR.
const CODE_PATTERN = /^CR(\d{1,2})-([0-9A-Z]{1,7})$/;

export function formatHoardCode(cr: number, seed: number): string {
  return `CR${cr}-${seed.toString(36).toUpperCase().padStart(7, '0')}`;
}

export function parseHoardCode(raw: string): { cr: number; seed: number } | null {
  const match = CODE_PATTERN.exec(raw.trim().toUpperCase());
  if (!match) {
    return null;
  }
  const cr = Number(match[1]);
  const seed = Number.parseInt(match[2], 36);
  return cr <= MAX_CR && seed <= 0xffffffff ? { cr, seed } : null;
}

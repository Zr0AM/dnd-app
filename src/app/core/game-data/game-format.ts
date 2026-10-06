const ORDINAL_SUFFIX: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' };

export function formatSpellLevel(level: number): string {
  return level === 0 ? 'Cantrip' : `${level}${ORDINAL_SUFFIX[level] ?? 'th'}`;
}

// Prices are stored in copper; show them in the largest coin that divides evenly.
export function formatCp(cp: number | null | undefined): string {
  if (cp === null || cp === undefined) {
    return '—';
  }
  if (cp !== 0 && cp % 100 === 0) {
    return `${(cp / 100).toLocaleString('en-US')} gp`;
  }
  if (cp !== 0 && cp % 10 === 0) {
    return `${cp / 10} sp`;
  }
  return `${cp} cp`;
}

export function formatWeight(lb: number | null | undefined): string {
  return lb === null || lb === undefined ? '—' : `${lb} lb`;
}

export function abilityModifier(score: number): string {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export function formatSpellComponents(spell: {
  spellVerbal: number;
  spellSomatic: number;
  spellMaterial: string | null;
}): string {
  const parts: string[] = [];
  if (spell.spellVerbal) {
    parts.push('V');
  }
  if (spell.spellSomatic) {
    parts.push('S');
  }
  if (spell.spellMaterial) {
    parts.push('M');
  }
  return parts.join(', ') || 'None';
}

// 'Wizard, Sorcerer' -> ['Wizard', 'Sorcerer']; ' or ' separates monster sizes.
export function splitList(value: string | null | undefined, separator: string): string[] {
  return value ? value.split(separator).map((part) => part.trim()).filter(Boolean) : [];
}

// Capitalises a stored lowercase enum such as 'ammunition' for display.
export function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

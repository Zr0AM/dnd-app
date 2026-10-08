// Core combat vocabulary, mirroring the seeded reference tables so the engine and
// the content compiler share one set of names. Values come from docs/db/seed
// (01-reference.sql): six abilities, 13 damage types, 15 conditions, six sizes.

/** The six ability scores. */
export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type Ability = (typeof ABILITIES)[number];

/** The 13 damage types (SRD DamageType). */
export const DAMAGE_TYPES = [
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
] as const;
export type DamageType = (typeof DAMAGE_TYPES)[number];

/** The 15 conditions (SRD Condition). Exhaustion also carries a level elsewhere. */
export const CONDITIONS = [
  'blinded',
  'charmed',
  'deafened',
  'exhaustion',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
] as const;
export type Condition = (typeof CONDITIONS)[number];

/** Creature sizes with the space each occupies, in feet (SRD CreatureSize). */
export const SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'] as const;
export type Size = (typeof SIZES)[number];

/** Edge length in feet of the square a creature of each size occupies. */
export const SIZE_SPACE_FT: Readonly<Record<Size, number>> = {
  tiny: 2.5,
  small: 5,
  medium: 5,
  large: 10,
  huge: 15,
  gargantuan: 20,
};

/** How defenses reduce incoming damage of a type. */
export type DamageResponse = 'normal' | 'resistant' | 'vulnerable' | 'immune';

/** The 2024 ability modifier: floor((score - 10) / 2). */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * Proficiency bonus by total character level (SRD Character Advancement):
 * +2 at 1–4, +3 at 5–8, +4 at 9–12, +5 at 13–16, +6 at 17–20.
 */
export function proficiencyBonus(level: number): number {
  if (level < 1 || level > 20 || !Number.isInteger(level)) {
    throw new RangeError(`level must be an integer in 1..20, got ${level}`);
  }
  return 2 + Math.floor((level - 1) / 4);
}

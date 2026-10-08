// Maps from the seed database's integer IDs to the engine's string codes, for
// the content compiler. IDs come from docs/db/seed/01-reference.sql and are
// stable (seeded by natural key). Kept here so the pure compiler can translate
// raw DB rows without a database connection.

import type { Ability, Condition, DamageType } from '../core/types';

export const ABILITY_BY_ID: Readonly<Record<number, Ability>> = {
  1: 'str',
  2: 'dex',
  3: 'con',
  4: 'int',
  5: 'wis',
  6: 'cha',
};

export const DAMAGE_TYPE_BY_ID: Readonly<Record<number, DamageType>> = {
  1: 'acid',
  2: 'bludgeoning',
  3: 'cold',
  4: 'fire',
  5: 'force',
  6: 'lightning',
  7: 'necrotic',
  8: 'piercing',
  9: 'poison',
  10: 'psychic',
  11: 'radiant',
  12: 'slashing',
  13: 'thunder',
};

export const CONDITION_BY_ID: Readonly<Record<number, Condition>> = {
  1: 'blinded',
  2: 'charmed',
  3: 'deafened',
  4: 'exhaustion',
  5: 'frightened',
  6: 'grappled',
  7: 'incapacitated',
  8: 'invisible',
  9: 'paralyzed',
  10: 'petrified',
  11: 'poisoned',
  12: 'prone',
  13: 'restrained',
  14: 'stunned',
  15: 'unconscious',
};

export function abilityById(id: number): Ability {
  const a = ABILITY_BY_ID[id];
  if (a === undefined) throw new RangeError(`unknown abilityID ${id}`);
  return a;
}

export function damageTypeById(id: number): DamageType {
  const d = DAMAGE_TYPE_BY_ID[id];
  if (d === undefined) throw new RangeError(`unknown damageTypeID ${id}`);
  return d;
}

export function conditionById(id: number): Condition {
  const c = CONDITION_BY_ID[id];
  if (c === undefined) throw new RangeError(`unknown conditionID ${id}`);
  return c;
}

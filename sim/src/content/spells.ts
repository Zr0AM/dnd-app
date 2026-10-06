// Authored damage spells for levels 3-5, verified against the SRD 5.2.1 text. The
// numbers are hand-entered per the effect-format spec (never parsed): cantrips
// scale by caster level, leveled spells by the slot used. Healing, control and
// buff spells extend this set in the next slice.

import { cantripDice, upcastDice, type Spell } from '../combat/spell';

// --- Cantrips ---

export const fireBolt: Spell = {
  id: 'fire-bolt',
  name: 'Fire Bolt',
  level: 0,
  action: 'action',
  rangeFt: 120,
  concentration: false,
  kind: { type: 'attack-damage', damage: cantripDice(1, 10), damageType: 'fire' },
};

export const rayOfFrost: Spell = {
  id: 'ray-of-frost',
  name: 'Ray of Frost',
  level: 0,
  action: 'action',
  rangeFt: 60,
  concentration: false,
  kind: { type: 'attack-damage', damage: cantripDice(1, 8), damageType: 'cold' },
};

export const sacredFlame: Spell = {
  id: 'sacred-flame',
  name: 'Sacred Flame',
  level: 0,
  action: 'action',
  rangeFt: 60,
  concentration: false,
  kind: {
    type: 'save-damage',
    save: 'dex',
    damage: cantripDice(1, 8),
    damageType: 'radiant',
    onSuccess: 'none',
  },
};

// --- Level 1 ---

export const guidingBolt: Spell = {
  id: 'guiding-bolt',
  name: 'Guiding Bolt',
  level: 1,
  action: 'action',
  rangeFt: 120,
  concentration: false,
  kind: { type: 'attack-damage', damage: upcastDice(1, 4, 6), damageType: 'radiant' },
};

export const burningHands: Spell = {
  id: 'burning-hands',
  name: 'Burning Hands',
  level: 1,
  action: 'action',
  rangeFt: 15,
  concentration: false,
  kind: {
    type: 'save-damage',
    save: 'dex',
    damage: upcastDice(1, 3, 6),
    damageType: 'fire',
    onSuccess: 'half',
    aoeRadiusFt: 15,
    selfOrigin: true,
  },
};

// --- Level 2 ---

export const scorchingRay: Spell = {
  id: 'scorching-ray',
  name: 'Scorching Ray',
  level: 2,
  action: 'action',
  rangeFt: 120,
  concentration: false,
  kind: {
    type: 'attack-damage',
    damage: () => ({ count: 2, sides: 6, bonus: 0 }),
    damageType: 'fire',
    rays: 3,
    raysPerUpcast: 1,
  },
};

// --- Level 3 ---

export const fireball: Spell = {
  id: 'fireball',
  name: 'Fireball',
  level: 3,
  action: 'action',
  rangeFt: 150,
  concentration: false,
  kind: {
    type: 'save-damage',
    save: 'dex',
    damage: upcastDice(3, 8, 6),
    damageType: 'fire',
    onSuccess: 'half',
    aoeRadiusFt: 20,
  },
};

/** The damage spells available to author-driven caster builds. */
export const DAMAGE_CANTRIPS: readonly Spell[] = [fireBolt, rayOfFrost, sacredFlame];
export const DAMAGE_SPELLS: readonly Spell[] = [guidingBolt, burningHands, scorchingRay, fireball];

// Spellcasting: the spell model the engine runs, and the damage families from the
// effect-format survey that levels 3-5 need. Spells are declarative data (like
// the monster/character compilers' output); the encounter executes them, mirroring
// how it resolves weapon attacks. Healing, buffs and control spells extend the
// SpellKind union in later slices.
//
// Spell numbers are authored (verified against the SRD text), never parsed, per
// the effect-format spec: cantrips scale by caster level, leveled spells by the
// slot used.

import { dice, type Dice } from '../dice/dice';
import type { Ability, DamageType } from '../core/types';

/** Damage as a function of the slot level used and the caster's total level. */
export type DamageScaling = (slotLevel: number, casterLevel: number) => Dice;

/** Who/what a spell targets. */
export type SpellTargeting = 'enemy' | 'self' | 'ally' | 'point';

/** The mechanical kinds of spell the engine can resolve (damage families first). */
export type SpellKind =
  | {
      readonly type: 'attack-damage';
      readonly damage: DamageScaling;
      readonly damageType: DamageType;
      /** Number of separate spell attacks (Scorching Ray fires several). */
      readonly rays?: number;
      /** Extra rays per slot level above the spell's base level. */
      readonly raysPerUpcast?: number;
    }
  | {
      readonly type: 'save-damage';
      readonly save: Ability;
      readonly damage: DamageScaling;
      readonly damageType: DamageType;
      readonly onSuccess: 'half' | 'none';
      /** If set, an area effect hitting every enemy within this radius of the point. */
      readonly aoeRadiusFt?: number;
      /** The area is centered on the caster rather than a chosen point (e.g. Burning Hands). */
      readonly selfOrigin?: boolean;
    }
  | {
      readonly type: 'heal';
      /** Healing dice (scaling by slot level). */
      readonly dice: DamageScaling;
      /** Add the caster's spellcasting modifier to the healing (Cure Wounds, Healing Word). */
      readonly addSpellMod: boolean;
    };

/** Which side a spell is cast at. */
export function spellTargetsAllies(spell: Spell): boolean {
  return spell.kind.type === 'heal';
}

export interface Spell {
  readonly id: string;
  readonly name: string;
  /** 0 = cantrip. */
  readonly level: number;
  readonly action: 'action' | 'bonus';
  readonly rangeFt: number;
  readonly concentration: boolean;
  readonly kind: SpellKind;
}

/** Cantrip dice that gain a die at levels 5, 11 and 17 (Fire Bolt, Sacred Flame, ...). */
export function cantripDice(baseCount: number, sides: number): DamageScaling {
  return (_slot, level) => {
    const extra = (level >= 5 ? 1 : 0) + (level >= 11 ? 1 : 0) + (level >= 17 ? 1 : 0);
    return dice(baseCount + extra, sides);
  };
}

/** Leveled dice that gain `perUpcast` dice per slot level above `baseLevel`. */
export function upcastDice(
  baseLevel: number,
  baseCount: number,
  sides: number,
  perUpcast = 1,
): DamageScaling {
  return (slot) => dice(baseCount + Math.max(0, slot - baseLevel) * perUpcast, sides);
}

/** Rays fired for an attack-damage spell at a given slot level. */
export function raysAt(
  kind: Extract<SpellKind, { type: 'attack-damage' }>,
  slotLevel: number,
  baseLevel: number,
): number {
  const base = kind.rays ?? 1;
  return base + (kind.raysPerUpcast ? Math.max(0, slotLevel - baseLevel) * kind.raysPerUpcast : 0);
}

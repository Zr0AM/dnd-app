// Caster build compiler: turns a resolved caster build into a Combatant with
// spellcasting. Scope for Phase 4: damage casters (Wizard/Evoker, Cleric) at
// levels 3-5 with a fixed, sensible spell package, a backup weapon, and the slot
// table from the seeds. Spell selection is fixed for now (not evolved); the
// genome varies class and ability assignment, enough for casters to compete on
// the Pareto front. Healing/control packages and evolved spell choice come next.

import { abilityModifier, proficiencyBonus, type Ability } from '../core/types';
import { dice } from '../dice/dice';
import { Combatant, type ResourceSpec, type Side } from '../combat/actor';
import type { AttackProfile } from '../combat/attack';
import type { Feature } from '../combat/feature';
import type { Spell } from '../combat/spell';
import type { ClassInfo, WeaponInfo, ArmorInfo } from './character';
import type { Cell } from '../grid/grid';
import { maxHitPoints } from './character';

const mod = abilityModifier;

export interface CasterBuildSpec {
  readonly id?: string;
  readonly name: string;
  readonly side?: Side;
  readonly class: ClassInfo;
  readonly subclass?: string | null;
  readonly level: number;
  readonly abilities: Readonly<Record<Ability, number>>;
  readonly weapon: WeaponInfo;
  readonly armor: ArmorInfo | null;
  readonly shield: boolean;
  readonly spellAbility: Ability;
  readonly cantrips: readonly Spell[];
  readonly spells: readonly Spell[];
  readonly slots: readonly { readonly level: number; readonly count: number }[];
  readonly position?: Cell;
  /** Resource pools (e.g. a Sorcerer's Sorcery Points). */
  readonly resources?: readonly ResourceSpec[];
  /** Class features (e.g. a Warlock's Dark One's Blessing). */
  readonly features?: readonly Feature[];
  /** Pact Magic: slots recharge on a Short Rest (Warlock). */
  readonly shortRestSlots?: boolean;
  /** Extra HP added to the computed maximum (Draconic Resilience: +1 per level). */
  readonly extraHp?: number;
  /**
   * When unarmored, compute AC as 10 + Dex + this ability's modifier (Draconic
   * Resilience's 10 + Dex + Cha). Ignored if the caster wears armor.
   */
  readonly unarmoredAcAbility?: Ability;
}

/** AC from armor (with its Dex cap) or unarmored, plus a shield. */
function casterAc(spec: CasterBuildSpec): number {
  const dexMod = mod(spec.abilities.dex);
  let ac: number;
  if (spec.armor) {
    const dexPart = spec.armor.addsDex
      ? spec.armor.dexCap !== null
        ? Math.min(dexMod, spec.armor.dexCap)
        : dexMod
      : 0;
    ac = spec.armor.baseAc + dexPart;
  } else if (spec.unarmoredAcAbility) {
    ac = 10 + dexMod + mod(spec.abilities[spec.unarmoredAcAbility]);
  } else {
    ac = 10 + dexMod;
  }
  return ac + (spec.shield ? 2 : 0);
}

/** A simple backup weapon attack (the caster rarely uses it, but may). */
function backupAttack(spec: CasterBuildSpec): AttackProfile {
  const ability = spec.weapon.properties.includes('finesse')
    ? mod(spec.abilities.str) >= mod(spec.abilities.dex)
      ? 'str'
      : 'dex'
    : spec.weapon.range === 'ranged'
      ? 'dex'
      : 'str';
  const abilityMod = mod(spec.abilities[ability]);
  return {
    name: spec.weapon.name,
    kind: spec.weapon.range,
    reachFt: spec.weapon.range === 'melee' ? 5 : undefined,
    rangeFt: spec.weapon.range === 'ranged' ? (spec.weapon.rangeNormalFt ?? undefined) : undefined,
    attackBonus: abilityMod + proficiencyBonus(spec.level),
    damage: dice(spec.weapon.diceCount, spec.weapon.diceSides, abilityMod),
    damageType: spec.weapon.damageType,
  };
}

/** Compile a caster build into a Combatant with spellcasting. */
export function compileCaster(spec: CasterBuildSpec): Combatant {
  const conMod = mod(spec.abilities.con);
  return new Combatant({
    id: spec.id ?? spec.class.slug,
    name: spec.name,
    side: spec.side ?? 'party',
    level: spec.level,
    abilities: spec.abilities,
    ac: casterAc(spec),
    maxHp: maxHitPoints(spec.class.hitDieSides, spec.level, conMod) + (spec.extraHp ?? 0),
    saveProficiencies: spec.class.saveProficiencies,
    attacks: [backupAttack(spec)],
    resources: spec.resources,
    features: spec.features,
    spellcasting: {
      ability: spec.spellAbility,
      slots: spec.slots,
      cantrips: spec.cantrips,
      spells: spec.spells,
      shortRestSlots: spec.shortRestSlots,
    },
    position: spec.position,
  });
}

// The character-build compiler: turns a resolved build into an engine Combatant.
//
// Scope for the walking skeleton: single-class martial builds (Fighter, Barbarian,
// Rogue) with correct Hit Points, Armor Class, saving throws, and one weapon
// attack (to-hit and damage), plus the numeric fighting styles. Class features
// that are conditional or triggered (Rage, Sneak Attack, Reckless Attack) and
// Extra Attack belong to the effect/feature layer and are added on top of this
// base; they are not applied here. Spellcasting is a later phase.
//
// Like the monster compiler, this is pure: it takes resolved data objects (class,
// weapon, armor) so it can be unit-tested without a database. A loader resolves
// those from the seeds.

import { dice, type Dice } from '../dice/dice';
import { abilityModifier, proficiencyBonus, type Ability, type DamageType } from '../core/types';
import { Combatant, type ResourceSpec, type Side } from '../combat/actor';
import type { AttackProfile } from '../combat/attack';
import type { Feature } from '../combat/feature';
import type { Cell } from '../grid/grid';
import { RageFeature, RecklessAttackFeature, SneakAttackFeature } from './martial-features';

export type FightingStyle = 'archery' | 'defense' | 'great-weapon' | 'two-weapon';
export type UnarmoredDefense = 'barbarian' | 'monk';

/** Weapon properties the build math cares about. */
export type WeaponProperty =
  | 'finesse'
  | 'heavy'
  | 'light'
  | 'two-handed'
  | 'versatile'
  | 'thrown'
  | 'ammunition'
  | 'loading'
  | 'reach'
  | 'range';

export interface WeaponInfo {
  readonly name: string;
  readonly category: 'simple' | 'martial';
  readonly range: 'melee' | 'ranged';
  readonly diceCount: number;
  readonly diceSides: number;
  readonly damageType: DamageType;
  readonly properties: readonly WeaponProperty[];
  readonly versatileDiceCount?: number | null;
  readonly versatileDiceSides?: number | null;
  readonly rangeNormalFt?: number | null;
  readonly rangeLongFt?: number | null;
}

export interface ArmorInfo {
  readonly name: string;
  readonly category: 'light' | 'medium' | 'heavy';
  readonly baseAc: number;
  readonly addsDex: boolean;
  readonly dexCap: number | null;
}

export interface ClassInfo {
  readonly slug: string;
  readonly hitDieSides: number;
  readonly saveProficiencies: readonly Ability[];
}

export interface BuildSpec {
  readonly id?: string;
  readonly name: string;
  readonly side?: Side;
  readonly class: ClassInfo;
  readonly subclass?: string | null;
  readonly level: number;
  readonly abilities: Readonly<Record<Ability, number>>;
  readonly weapon: WeaponInfo;
  /** Wield a versatile weapon in two hands (uses the versatile dice). */
  readonly twoHanded?: boolean;
  readonly armor?: ArmorInfo | null;
  readonly shield?: boolean;
  readonly fightingStyle?: FightingStyle;
  readonly unarmoredDefense?: UnarmoredDefense | null;
  /** Proficient with the chosen weapon (default true for these martial classes). */
  readonly weaponProficient?: boolean;
  readonly position?: Cell;
  /** Level-dependent feature values, resolved from the class progression tables. */
  readonly progression?: BuildProgression;
}

/** Numeric feature values pulled from ClassLevelValue / the class tables. */
export interface BuildProgression {
  readonly rageUses?: number;
  readonly rageDamageBonus?: number;
  readonly sneakAttackDice?: number;
  readonly extraAttacks?: number;
}

const mod = abilityModifier;

/** Fixed Hit Points by class: max die at level 1, (die/2 + 1) + Con each later level. */
export function maxHitPoints(hitDieSides: number, level: number, conMod: number): number {
  if (level < 1) throw new RangeError(`level must be >= 1, got ${level}`);
  const fixed = hitDieSides / 2 + 1;
  let hp = hitDieSides + conMod; // level 1: full die
  for (let l = 2; l <= level; l++) hp += Math.max(1, fixed + conMod);
  return Math.max(1, hp);
}

/** Armor Class from armor, Unarmored Defense, shield and the Defense fighting style. */
export function armorClass(spec: BuildSpec): number {
  const dexMod = mod(spec.abilities.dex);
  let ac: number;
  if (spec.armor) {
    const dexPart = spec.armor.addsDex
      ? spec.armor.dexCap !== null
        ? Math.min(dexMod, spec.armor.dexCap)
        : dexMod
      : 0;
    ac = spec.armor.baseAc + dexPart;
  } else if (spec.unarmoredDefense === 'barbarian') {
    ac = 10 + dexMod + mod(spec.abilities.con);
  } else if (spec.unarmoredDefense === 'monk') {
    ac = 10 + dexMod + mod(spec.abilities.wis);
  } else {
    ac = 10 + dexMod;
  }
  if (spec.shield) ac += 2;
  // Defense requires wearing armor (Unarmored Defense does not count).
  if (spec.fightingStyle === 'defense' && spec.armor) ac += 1;
  return ac;
}

/** The ability used for a weapon's attack and damage (Str, Dex, or the better for Finesse). */
export function weaponAbility(spec: BuildSpec): Ability {
  if (spec.weapon.range === 'ranged') return 'dex';
  if (spec.weapon.properties.includes('finesse')) {
    return mod(spec.abilities.str) >= mod(spec.abilities.dex) ? 'str' : 'dex';
  }
  return 'str';
}

/** Build the weapon attack profile (to-hit, damage, crit range). */
export function weaponAttack(spec: BuildSpec): AttackProfile {
  const pb = proficiencyBonus(spec.level);
  const ability = weaponAbility(spec);
  const abilityMod = mod(spec.abilities[ability]);
  const proficient = spec.weaponProficient ?? true;

  let toHit = abilityMod + (proficient ? pb : 0);
  if (spec.fightingStyle === 'archery' && spec.weapon.range === 'ranged') toHit += 2;

  const useVersatile =
    spec.twoHanded &&
    spec.weapon.versatileDiceCount != null &&
    spec.weapon.versatileDiceSides != null;
  const count = useVersatile ? spec.weapon.versatileDiceCount! : spec.weapon.diceCount;
  const sides = useVersatile ? spec.weapon.versatileDiceSides! : spec.weapon.diceSides;

  const damage: Dice = dice(count, sides, abilityMod);

  // Champion's Improved Critical widens the crit range to 19-20 from level 3.
  const critRange = spec.subclass === 'champion' && spec.level >= 3 ? 19 : 20;

  const kind = spec.weapon.range;
  return {
    name: spec.weapon.name,
    kind,
    reachFt: kind === 'melee' ? (spec.weapon.properties.includes('reach') ? 10 : 5) : undefined,
    rangeFt: kind === 'ranged' ? (spec.weapon.rangeNormalFt ?? undefined) : undefined,
    rangeLongFt: kind === 'ranged' ? (spec.weapon.rangeLongFt ?? undefined) : undefined,
    attackBonus: toHit,
    damage,
    damageType: spec.weapon.damageType,
    critRange,
    finesse: spec.weapon.properties.includes('finesse'),
  };
}

/** Attach the class/subclass/level features this build has. */
export function buildFeatures(spec: BuildSpec): { features: Feature[]; resources: ResourceSpec[] } {
  const features: Feature[] = [];
  const resources: ResourceSpec[] = [];
  const p = spec.progression ?? {};

  if (spec.class.slug === 'barbarian') {
    if (p.rageUses && p.rageUses > 0) {
      resources.push({ id: 'rage', max: p.rageUses, rechargeShort: 1, rechargeLong: 'all' });
      features.push(new RageFeature(p.rageDamageBonus ?? 0));
    }
    if (spec.level >= 2) features.push(new RecklessAttackFeature()); // Reckless Attack at level 2
  }
  if (spec.class.slug === 'rogue' && p.sneakAttackDice && p.sneakAttackDice > 0) {
    features.push(new SneakAttackFeature(p.sneakAttackDice));
  }
  return { features, resources };
}

/** Compile a build into a Combatant placed on the board. */
export function compileBuild(spec: BuildSpec): Combatant {
  const conMod = mod(spec.abilities.con);
  const { features, resources } = buildFeatures(spec);
  return new Combatant({
    id: spec.id ?? spec.class.slug,
    name: spec.name,
    side: spec.side ?? 'party',
    level: spec.level,
    abilities: spec.abilities,
    ac: armorClass(spec),
    maxHp: maxHitPoints(spec.class.hitDieSides, spec.level, conMod),
    saveProficiencies: spec.class.saveProficiencies,
    attacks: [weaponAttack(spec)],
    features,
    resources,
    extraAttacks: spec.progression?.extraAttacks ?? 0,
    position: spec.position,
  });
}

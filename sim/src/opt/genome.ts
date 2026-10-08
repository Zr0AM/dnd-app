// A minimal martial genome for the Phase 3 optimization loop: a single-class
// level-3 Fighter, Barbarian or Rogue with a standard-array ability assignment,
// a weapon, armor, shield and (Fighter) a fighting style. This is a deliberately
// small slice of the full genome spec — enough to prove the GA end to end. The
// full multiclass/spell genome and NSGA-II come in later phases.
//
// The genome holds indices/choices; a catalog resolves them to the engine data,
// so the genome stays plain and serializable.

import type { Ability } from '../core/types';
import type { Random } from '../rng/rng';
import {
  compileBuild,
  type BuildProgression,
  type FightingStyle,
  type WeaponInfo,
} from '../content/character';
import { compileCaster } from '../content/caster';
import type { Combatant } from '../combat/actor';
import type { MartialCatalog } from './catalog';

/** The Monk's unarmed strike: the Martial Arts die scales with level, Dex-based (finesse). */
function monkUnarmedStrike(level: number): WeaponInfo {
  const sides = level >= 17 ? 10 : level >= 11 ? 8 : level >= 5 ? 6 : 4;
  return {
    name: 'Unarmed Strike',
    category: 'simple',
    range: 'melee',
    diceCount: 1,
    diceSides: sides,
    damageType: 'bludgeoning',
    properties: ['finesse'], // so the Dex-based monk uses Dex to hit and for damage
  };
}

export const MARTIAL_CLASSES = [
  'fighter',
  'barbarian',
  'rogue',
  'ranger',
  'paladin',
  'monk',
] as const;
export type MartialClass = (typeof MARTIAL_CLASSES)[number];

export const CASTER_CLASSES = ['wizard', 'cleric', 'bard', 'sorcerer', 'warlock', 'druid'] as const;
export type CasterClass = (typeof CASTER_CLASSES)[number];

/** All classes the genome can pick. */
export const BUILD_CLASSES = [...MARTIAL_CLASSES, ...CASTER_CLASSES] as const;
export type BuildClass = MartialClass | CasterClass;

export function isCasterClass(slug: BuildClass): slug is CasterClass {
  return (CASTER_CLASSES as readonly string[]).includes(slug);
}

/** The 2024 standard array, assigned to the six abilities by a permutation. */
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;
const ABILITY_ORDER: readonly Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const FIGHTING_STYLES: readonly FightingStyle[] = [
  'archery',
  'defense',
  'great-weapon',
  'two-weapon',
];

export interface MartialGenome {
  readonly classSlug: BuildClass;
  /** A permutation of [0..5]: which standard-array value each ability gets. */
  readonly abilityAssignment: readonly number[];
  readonly weaponName: string;
  readonly armorName: string | null; // null = unarmored
  readonly shield: boolean;
  readonly twoHanded: boolean;
  readonly fightingStyle?: FightingStyle;
}

function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** Abilities, with the standard array applied under an assignment permutation. */
export function abilitiesFrom(assignment: readonly number[]): Record<Ability, number> {
  const out = {} as Record<Ability, number>;
  ABILITY_ORDER.forEach((ability, i) => {
    out[ability] = STANDARD_ARRAY[assignment[i]];
  });
  return out;
}

/** A random legal genome. */
export function randomGenome(
  catalog: MartialCatalog,
  random: Random,
  label: string,
  classes: readonly BuildClass[] = BUILD_CLASSES,
): MartialGenome {
  const rng = random.stream(label);
  const classSlug = pick(classes.length ? classes : BUILD_CLASSES, rng);
  const assignment = shuffle([0, 1, 2, 3, 4, 5], rng);
  const weapon = pick(catalog.weapons, rng);
  const g: MartialGenome = {
    classSlug,
    abilityAssignment: assignment,
    weaponName: weapon.name,
    armorName: null,
    shield: false,
    twoHanded: weapon.properties.includes('two-handed'),
    fightingStyle: classSlug === 'fighter' ? pick(FIGHTING_STYLES, rng) : undefined,
  };
  return repair(g, catalog);
}

/**
 * Make a genome legal: barbarians go unarmored (Unarmored Defense), others pick
 * armor they are allowed; a two-handed weapon cannot be paired with a shield; a
 * versatile weapon only counts as two-handed when there is no shield.
 */
export function repair(g: MartialGenome, catalog: MartialCatalog): MartialGenome {
  // Casters use a fixed gear/spell package (buildFromGenome handles them); their
  // martial gear fields are left as-is and ignored.
  if (isCasterClass(g.classSlug)) return g;

  const weapon = catalog.weaponByName(g.weaponName);
  const isTwoHandedWeapon = weapon.properties.includes('two-handed');
  const isVersatile = weapon.versatileDiceCount != null;

  let armorName = g.armorName;
  let shield = g.shield;
  let twoHanded = g.twoHanded;

  if (g.classSlug === 'barbarian')
    armorName = null; // Unarmored Defense
  else if (armorName === null) armorName = catalog.defaultArmorFor(g.classSlug as MartialClass);

  if (isTwoHandedWeapon) {
    shield = false;
    twoHanded = true;
  } else if (!isVersatile) {
    twoHanded = false;
  } else {
    // Versatile: two-handed only makes sense without a shield.
    if (shield) twoHanded = false;
  }

  const fightingStyle = g.classSlug === 'fighter' ? (g.fightingStyle ?? 'defense') : undefined;
  return { ...g, armorName, shield, twoHanded, fightingStyle };
}

/** Mutate one gene at random, returning a repaired genome. */
export function mutate(
  g: MartialGenome,
  catalog: MartialCatalog,
  random: Random,
  label: string,
  classes: readonly BuildClass[] = BUILD_CLASSES,
): MartialGenome {
  const rng = random.stream(label);
  const pool = classes.length ? classes : BUILD_CLASSES;
  const choice = Math.floor(rng() * 6);
  let next: MartialGenome = g;
  switch (choice) {
    case 0:
      next = { ...g, classSlug: pick(pool, rng) };
      break;
    case 1: {
      // Swap two ability assignments.
      const a = Math.floor(rng() * 6);
      const b = Math.floor(rng() * 6);
      const assignment = [...g.abilityAssignment];
      [assignment[a], assignment[b]] = [assignment[b], assignment[a]];
      next = { ...g, abilityAssignment: assignment };
      break;
    }
    case 2:
      next = { ...g, weaponName: pick(catalog.weapons, rng).name };
      break;
    case 3:
      next = { ...g, shield: !g.shield };
      break;
    case 4:
      next = { ...g, twoHanded: !g.twoHanded };
      break;
    case 5:
      next = { ...g, fightingStyle: pick(FIGHTING_STYLES, rng) };
      break;
    default:
      next = g;
  }
  return repair(next, catalog);
}

/** Uniform crossover of two genomes, gene by gene, then repair. */
export function crossover(
  a: MartialGenome,
  b: MartialGenome,
  catalog: MartialCatalog,
  random: Random,
  label: string,
): MartialGenome {
  const rng = random.stream(label);
  const child: MartialGenome = {
    classSlug: rng() < 0.5 ? a.classSlug : b.classSlug,
    abilityAssignment: rng() < 0.5 ? a.abilityAssignment : b.abilityAssignment,
    weaponName: rng() < 0.5 ? a.weaponName : b.weaponName,
    armorName: rng() < 0.5 ? a.armorName : b.armorName,
    shield: rng() < 0.5 ? a.shield : b.shield,
    twoHanded: rng() < 0.5 ? a.twoHanded : b.twoHanded,
    fightingStyle: rng() < 0.5 ? a.fightingStyle : b.fightingStyle,
  };
  return repair(child, catalog);
}

/** Compile a genome into a Combatant on the party side. */
export function buildFromGenome(g: MartialGenome, catalog: MartialCatalog, id = 'hero'): Combatant {
  const abilities = abilitiesFrom(g.abilityAssignment);

  if (isCasterClass(g.classSlug)) {
    const pkg = catalog.casterPackageFor(g.classSlug);
    const cls = catalog.classByName(g.classSlug);
    return compileCaster({
      id,
      name: `${g.classSlug} hero`,
      class: cls,
      subclass: catalog.subclassFor(g.classSlug),
      level: catalog.level,
      abilities,
      weapon: pkg.weapon,
      armor: pkg.armor,
      shield: pkg.shield,
      spellAbility: pkg.spellAbility,
      cantrips: pkg.cantrips,
      spells: pkg.spells,
      slots: pkg.slots,
      resources: pkg.resources,
      extraHp: pkg.extraHp,
      unarmoredAcAbility: pkg.unarmoredAcAbility,
      features: pkg.features,
      shortRestSlots: pkg.shortRestSlots,
    });
  }

  const cls = catalog.classByName(g.classSlug);
  const progression: BuildProgression = catalog.progressionFor(g.classSlug as MartialClass);

  // The Monk is special: it fights unarmored (Unarmored Defense) with its unarmed
  // strike, so the evolved weapon/armor/style are ignored in favor of the monk kit.
  if (g.classSlug === 'monk') {
    return compileBuild({
      id,
      name: 'monk hero',
      class: cls,
      subclass: catalog.subclassFor(g.classSlug),
      level: catalog.level,
      abilities,
      weapon: monkUnarmedStrike(catalog.level),
      armor: null,
      shield: false,
      unarmoredDefense: 'monk',
      progression,
    });
  }

  const weapon = catalog.weaponByName(g.weaponName);
  return compileBuild({
    id,
    name: `${g.classSlug} hero`,
    class: cls,
    subclass: catalog.subclassFor(g.classSlug),
    level: catalog.level,
    abilities,
    weapon,
    twoHanded: g.twoHanded,
    armor: g.armorName ? catalog.armorByName(g.armorName) : null,
    shield: g.shield,
    fightingStyle: g.fightingStyle,
    unarmoredDefense: g.classSlug === 'barbarian' ? 'barbarian' : null,
    progression,
    // A gish (Paladin) also carries spell slots and a short spell list.
    spellcasting: catalog.gishSpellcastingFor(g.classSlug) ?? undefined,
  });
}

/** A stable string key for a genome (for caching / de-duplication). */
export function genomeKey(g: MartialGenome): string {
  // Casters use a fixed gear/spell package, so only class and abilities vary.
  if (isCasterClass(g.classSlug)) {
    return [g.classSlug, g.abilityAssignment.join('')].join('|');
  }
  return [
    g.classSlug,
    g.abilityAssignment.join(''),
    g.weaponName,
    g.armorName ?? '-',
    g.shield ? 'S' : '-',
    g.twoHanded ? '2H' : '1H',
    g.fightingStyle ?? '-',
  ].join('|');
}

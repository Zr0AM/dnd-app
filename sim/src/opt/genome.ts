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
import { compileBuild, type BuildProgression, type FightingStyle } from '../content/character';
import type { Combatant } from '../combat/actor';
import type { MartialCatalog } from './catalog';

export const MARTIAL_CLASSES = ['fighter', 'barbarian', 'rogue'] as const;
export type MartialClass = (typeof MARTIAL_CLASSES)[number];

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
  readonly classSlug: MartialClass;
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
): MartialGenome {
  const rng = random.stream(label);
  const classSlug = pick(MARTIAL_CLASSES, rng);
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
  const weapon = catalog.weaponByName(g.weaponName);
  const isTwoHandedWeapon = weapon.properties.includes('two-handed');
  const isVersatile = weapon.versatileDiceCount != null;

  let armorName = g.armorName;
  let shield = g.shield;
  let twoHanded = g.twoHanded;

  if (g.classSlug === 'barbarian')
    armorName = null; // Unarmored Defense
  else if (armorName === null) armorName = catalog.defaultArmorFor(g.classSlug);

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
): MartialGenome {
  const rng = random.stream(label);
  const choice = Math.floor(rng() * 6);
  let next: MartialGenome = g;
  switch (choice) {
    case 0:
      next = { ...g, classSlug: pick(MARTIAL_CLASSES, rng) };
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
  const weapon = catalog.weaponByName(g.weaponName);
  const cls = catalog.classByName(g.classSlug);
  const progression: BuildProgression = catalog.progressionFor(g.classSlug);
  return compileBuild({
    id,
    name: `${g.classSlug} hero`,
    class: cls,
    subclass: catalog.subclassFor(g.classSlug),
    level: catalog.level,
    abilities: abilitiesFrom(g.abilityAssignment),
    weapon,
    twoHanded: g.twoHanded,
    armor: g.armorName ? catalog.armorByName(g.armorName) : null,
    shield: g.shield,
    fightingStyle: g.fightingStyle,
    unarmoredDefense: g.classSlug === 'barbarian' ? 'barbarian' : null,
    progression,
  });
}

/** A stable string key for a genome (for caching / de-duplication). */
export function genomeKey(g: MartialGenome): string {
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

// The catalog of options the martial genome draws from, resolved from the seed
// database once and reused across the GA run. Keeps the genome plain (names and
// indices) and the evaluation fast (no per-build DB access).

import type { DatabaseSync } from 'node:sqlite';
import type { ArmorInfo, BuildProgression, ClassInfo, WeaponInfo } from '../content/character';
import type { MonsterTemplate } from '../content/monster';
import { compileMonster } from '../content/monster';
import { loadScenarios, type Scenario } from '../scenario/library';
import {
  loadArmor,
  loadClass,
  loadMonsterSources,
  loadProgression,
  loadSpellSlots,
  loadWeapon,
} from '../content/load-db';
import type { Ability } from '../core/types';
import type { Spell } from '../combat/spell';
import {
  bless,
  burningHands,
  cureWounds,
  fireBolt,
  fireball,
  guidingBolt,
  haste,
  healingWord,
  holdPerson,
  hypnoticPattern,
  rayOfFrost,
  sacredFlame,
  scorchingRay,
} from '../content/spells';
import type { BuildClass, CasterClass, MartialClass } from './genome';

/** The SRD subclass each class takes at level 3. */
const SUBCLASS: Readonly<Record<BuildClass, string>> = {
  fighter: 'champion',
  barbarian: 'path-of-the-berserker',
  rogue: 'thief',
  ranger: 'hunter',
  wizard: 'evoker',
  cleric: 'life-domain',
  bard: 'college-of-lore',
};

/** A caster's fixed spell/gear package (spell selection is not evolved in v1). */
export interface CasterPackage {
  readonly spellAbility: Ability;
  readonly cantrips: readonly Spell[];
  readonly spells: readonly Spell[];
  readonly weapon: WeaponInfo;
  readonly armor: ArmorInfo | null;
  readonly shield: boolean;
  readonly slots: readonly { readonly level: number; readonly count: number }[];
}

interface CasterSpec {
  readonly ability: Ability;
  readonly cantrips: readonly Spell[];
  readonly spells: readonly Spell[];
  readonly weaponName: string;
  readonly armorName: string | null;
  readonly shield: boolean;
}

const CASTER_SPECS: Readonly<Record<CasterClass, CasterSpec>> = {
  wizard: {
    ability: 'int',
    cantrips: [fireBolt, rayOfFrost],
    spells: [burningHands, scorchingRay, fireball, holdPerson, hypnoticPattern],
    weaponName: 'Dagger',
    armorName: null, // no armor proficiency
    shield: false,
  },
  cleric: {
    ability: 'wis',
    cantrips: [sacredFlame],
    spells: [cureWounds, healingWord, guidingBolt],
    weaponName: 'Mace',
    armorName: 'Scale Mail', // medium armor + shield
    shield: true,
  },
  bard: {
    ability: 'cha',
    cantrips: [],
    spells: [bless, haste], // the buffer package
    weaponName: 'Rapier',
    armorName: 'Leather Armor', // light armor, no shield
    shield: false,
  },
};

/** A sensible default armor for a non-barbarian martial. */
const DEFAULT_ARMOR: Readonly<Record<MartialClass, string>> = {
  fighter: 'Chain Mail',
  barbarian: 'Chain Mail', // unused (barbarian is unarmored), kept for completeness
  rogue: 'Studded Leather Armor',
  ranger: 'Studded Leather Armor',
};

export interface MartialCatalog {
  readonly level: number;
  readonly weapons: readonly WeaponInfo[];
  readonly armors: readonly ArmorInfo[];
  weaponByName(name: string): WeaponInfo;
  armorByName(name: string): ArmorInfo;
  classByName(slug: BuildClass): ClassInfo;
  subclassFor(slug: BuildClass): string;
  defaultArmorFor(slug: MartialClass): string;
  progressionFor(slug: MartialClass): BuildProgression;
  casterPackageFor(slug: CasterClass): CasterPackage;
  /** The opposition for the simple legacy evaluation scenario. */
  readonly goblin: MonsterTemplate;
  /** The scenario library a build is evaluated against. */
  readonly scenarios: readonly Scenario[];
}

const WEAPON_NAMES = [
  'Greataxe',
  'Greatsword',
  'Longsword',
  'Rapier',
  'Shortsword',
  'Handaxe',
  'Longbow',
  'Shortbow',
];
const ARMOR_NAMES = ['Studded Leather Armor', 'Chain Shirt', 'Breastplate', 'Chain Mail'];

/** Build the catalog from the seed database for a given level. */
export function loadMartialCatalog(db: DatabaseSync, level = 3): MartialCatalog {
  const weapons = WEAPON_NAMES.map((n) => loadWeapon(db, n));
  const armors = ARMOR_NAMES.map((n) => loadArmor(db, n));
  const classes = new Map<BuildClass, ClassInfo>();
  const progression = new Map<MartialClass, BuildProgression>();
  for (const slug of ['fighter', 'barbarian', 'rogue', 'ranger'] as const) {
    classes.set(slug, loadClass(db, slug));
    progression.set(slug, loadProgression(db, slug, level));
  }

  // Caster classes, slots and resolved spell/gear packages.
  const casterPackages = new Map<CasterClass, CasterPackage>();
  for (const slug of ['wizard', 'cleric', 'bard'] as const) {
    classes.set(slug, loadClass(db, slug));
    const spec = CASTER_SPECS[slug];
    casterPackages.set(slug, {
      spellAbility: spec.ability,
      cantrips: spec.cantrips,
      spells: spec.spells,
      weapon: loadWeapon(db, spec.weaponName),
      armor: spec.armorName ? loadArmor(db, spec.armorName) : null,
      shield: spec.shield,
      slots: loadSpellSlots(db, slug, level),
    });
  }
  const goblinSrc = loadMonsterSources(db).find((s) => s.monster.monsterSlug === 'goblin-warrior');
  if (!goblinSrc) throw new Error('goblin-warrior not found in seeds');
  const goblin = compileMonster(goblinSrc, {
    multiattack: [
      { action: goblinSrc.actions.find((a) => a.attackKind)?.actionName ?? 'Scimitar', count: 1 },
    ],
  });

  const byName = <T extends { name: string }>(
    list: readonly T[],
    name: string,
    kind: string,
  ): T => {
    const found = list.find((x) => x.name === name);
    if (!found) throw new Error(`${kind} not in catalog: ${name}`);
    return found;
  };

  const scenarios = loadScenarios(db, level);

  return {
    level,
    weapons,
    armors,
    goblin,
    scenarios,
    weaponByName: (name) => byName(weapons, name, 'weapon'),
    armorByName: (name) => byName(armors, name, 'armor'),
    classByName: (slug) => {
      const c = classes.get(slug);
      if (!c) throw new Error(`class not in catalog: ${slug}`);
      return c;
    },
    subclassFor: (slug) => SUBCLASS[slug],
    defaultArmorFor: (slug) => DEFAULT_ARMOR[slug],
    progressionFor: (slug) => progression.get(slug) ?? {},
    casterPackageFor: (slug) => {
      const p = casterPackages.get(slug);
      if (!p) throw new Error(`caster package not in catalog: ${slug}`);
      return p;
    },
  };
}

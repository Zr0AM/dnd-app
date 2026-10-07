// Reference-party filler builds: the fixed benchmark characters that fill the
// roles the hero is measured against (plan, reference parties). They are frozen
// recipes (Human, standard array, the SRD subclass), reproducible and reviewable,
// so the hero's results are not skewed by evolving teammates.
//
// Buildable now: Tank (Fighter/Champion), Burst (Rogue/Thief), Healer (Cleric/
// Life with Cure Wounds and Healing Word), Controller (Wizard/Evoker, used here as
// the party's area-damage/lockdown option). The Sustained-DPS (Ranger) and Buffer
// (Bard) fillers need half-caster/buff content and arrive with it; R4 and R3 are
// complete, R6 waits on them.

import type { DatabaseSync } from 'node:sqlite';
import type { Ability } from '../core/types';
import type { Cell } from '../grid/grid';
import type { Side } from '../combat/actor';
import { Combatant } from '../combat/actor';
import { compileBuild } from './character';
import { compileCaster } from './caster';
import { loadArmor, loadClass, loadProgression, loadSpellSlots, loadWeapon } from './load-db';
import {
  cureWounds,
  fireBolt,
  fireball,
  guidingBolt,
  healingWord,
  holdPerson,
  hypnoticPattern,
  sacredFlame,
  scorchingRay,
} from './spells';

export type Role = 'tank' | 'sustained-dps' | 'burst' | 'healer' | 'controller' | 'buffer';

/** A filler: a frozen build placed into a party slot. */
export interface Filler {
  readonly role: Role;
  make(id: string, side: Side, position: Cell): Combatant;
}

const array = (str: number, dex: number, con: number, int: number, wis: number, cha: number) =>
  ({ str, dex, con, int, wis, cha }) as Record<Ability, number>;

/** Build the filler set available at this level. */
export function loadFillers(db: DatabaseSync, level: number): Partial<Record<Role, Filler>> {
  const fighter = loadClass(db, 'fighter');
  const rogue = loadClass(db, 'rogue');
  const cleric = loadClass(db, 'cleric');
  const wizard = loadClass(db, 'wizard');

  const longsword = loadWeapon(db, 'Longsword');
  const rapier = loadWeapon(db, 'Rapier');
  const mace = loadWeapon(db, 'Mace');
  const dagger = loadWeapon(db, 'Dagger');
  const chainMail = loadArmor(db, 'Chain Mail');
  const studded = loadArmor(db, 'Studded Leather Armor');
  const scaleMail = loadArmor(db, 'Scale Mail');

  // Resolve all DB-dependent values now; the make() closures must not touch the
  // database (it may be closed by the time a filler is spawned).
  const rogueProgression = loadProgression(db, 'rogue', level);
  const clericSlots = loadSpellSlots(db, 'cleric', level);
  const wizardSlots = loadSpellSlots(db, 'wizard', level);

  return {
    tank: {
      role: 'tank',
      make: (id, side, position) =>
        compileBuild({
          id,
          name: 'Fighter (Tank)',
          side,
          class: fighter,
          subclass: 'champion',
          level,
          abilities: array(15, 13, 14, 10, 12, 8),
          weapon: longsword,
          armor: chainMail,
          shield: true,
          fightingStyle: 'defense',
          position,
        }),
    },
    burst: {
      role: 'burst',
      make: (id, side, position) =>
        compileBuild({
          id,
          name: 'Rogue (Burst)',
          side,
          class: rogue,
          subclass: 'thief',
          level,
          abilities: array(10, 15, 13, 12, 14, 8),
          weapon: rapier,
          armor: studded,
          progression: rogueProgression,
          position,
        }),
    },
    healer: {
      role: 'healer',
      make: (id, side, position) =>
        compileCaster({
          id,
          name: 'Cleric (Healer)',
          side,
          class: cleric,
          subclass: 'life-domain',
          level,
          abilities: array(13, 10, 14, 8, 15, 12),
          weapon: mace,
          armor: scaleMail,
          shield: true,
          spellAbility: 'wis',
          cantrips: [sacredFlame],
          spells: [cureWounds, healingWord, guidingBolt],
          slots: clericSlots,
          position,
        }),
    },
    controller: {
      role: 'controller',
      make: (id, side, position) =>
        compileCaster({
          id,
          name: 'Wizard (Controller)',
          side,
          class: wizard,
          subclass: 'evoker',
          level,
          abilities: array(8, 14, 14, 15, 12, 10),
          weapon: dagger,
          armor: null,
          shield: false,
          spellAbility: 'int',
          cantrips: [fireBolt],
          spells: [hypnoticPattern, holdPerson, fireball, scorchingRay],
          slots: wizardSlots,
          position,
        }),
    },
  };
}

// Loads the seed database into an in-memory SQLite instance and reads monster
// rows for the content compiler. This is the DB-coupled layer (Node only); the
// compiler itself (monster.ts) stays pure. It mirrors how scripts/srd/check-srd
// -seed.mjs builds the database, so the sim reads exactly the committed seeds.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MonsterSource, MonsterActionRow, MonsterDamageRow, MonsterRow } from './monster';
import type { ArmorInfo, ClassInfo, WeaponInfo, WeaponProperty } from './character';
import { abilityById } from './ids';
import type { Ability, DamageType } from '../core/types';
import { DAMAGE_TYPE_BY_ID } from './ids';

/** The repository's docs/db directory, relative to this file. */
function dbDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '../../../docs/db');
}

/** Build the seed database in memory (schema + all seed files), FKs enforced. */
export function buildSeedDatabase(): DatabaseSync {
  const dir = dbDir();
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  // The live Item table is assumed to exist in production; stub it for the seeds.
  db.exec(`CREATE TABLE Item (
    itemID INTEGER PRIMARY KEY, itemName TEXT NOT NULL, itemRarity TEXT, itemCost REAL,
    itemType TEXT, itemRestrictions TEXT, itemAttunement TEXT, itemSource TEXT, itemUrl TEXT,
    itemVisualDesc TEXT, itemShopkeeperDesc TEXT, active INTEGER NOT NULL DEFAULT 1,
    itemDescription TEXT, itemDescriptionSource TEXT)`);
  db.exec(readFileSync(join(dir, 'schema-draft.sql'), 'utf8'));
  const seedDir = join(dir, 'seed');
  for (const f of readdirSync(seedDir)
    .filter((n) => n.endsWith('.sql'))
    .sort()) {
    db.exec(readFileSync(join(seedDir, f), 'utf8'));
  }
  return db;
}

/** Read every monster and its related rows, grouped for the compiler. */
export function loadMonsterSources(db: DatabaseSync): MonsterSource[] {
  const monsters = db
    .prepare(
      `SELECT monsterID, monsterSlug, monsterName, monsterAc, monsterHpAvg,
              monsterStr, monsterDex, monsterCon, monsterInt, monsterWis, monsterCha, crValue
       FROM Monster WHERE active = 1 ORDER BY monsterSlug`,
    )
    .all() as unknown as (MonsterRow & { monsterID: number })[];

  return monsters.map((m) => {
    const id = m.monsterID;
    const actions = db
      .prepare(
        `SELECT monsterActionID, actionSection, actionName, attackKind, attackBonus,
                attackReachFt, attackRangeFt, attackRangeLongFt
         FROM MonsterAction WHERE monsterID = ? ORDER BY sortOrder`,
      )
      .all(id) as unknown as MonsterActionRow[];
    const damage = db
      .prepare(
        `SELECT d.monsterActionID, d.damageIndex, d.damageDiceCount, d.damageDiceSides,
                d.damageBonus, d.damageAvg, d.damageTypeID
         FROM MonsterActionDamage d JOIN MonsterAction a USING (monsterActionID)
         WHERE a.monsterID = ?`,
      )
      .all(id) as unknown as MonsterDamageRow[];
    const saves = db
      .prepare(`SELECT abilityID, saveBonus FROM MonsterSave WHERE monsterID = ?`)
      .all(id) as unknown as MonsterSource['saves'];
    const defenses = db
      .prepare(
        `SELECT defenseKind, damageTypeID, conditionID FROM MonsterDefense WHERE monsterID = ?`,
      )
      .all(id) as unknown as MonsterSource['defenses'];
    const speeds = db
      .prepare(`SELECT speedMode, speedFt FROM MonsterSpeed WHERE monsterID = ?`)
      .all(id) as unknown as MonsterSource['speeds'];
    return { monster: m, actions, damage, saves, defenses, speeds };
  });
}

/** The engine property names for the weapon-property names in the seeds. */
const WEAPON_PROPERTY_BY_NAME: Readonly<Record<string, WeaponProperty>> = {
  Finesse: 'finesse',
  Heavy: 'heavy',
  Light: 'light',
  'Two-Handed': 'two-handed',
  Versatile: 'versatile',
  Thrown: 'thrown',
  Ammunition: 'ammunition',
  Loading: 'loading',
  Reach: 'reach',
  Range: 'range',
};

interface WeaponRow {
  n: string;
  c: 'simple' | 'martial';
  r: 'melee' | 'ranged';
  dc: number;
  ds: number;
  dt: number;
  vc: number | null;
  vs: number | null;
  rn: number | null;
  rl: number | null;
}

/** Read one weapon's stats and properties by equipment name. */
export function loadWeapon(db: DatabaseSync, name: string): WeaponInfo {
  const w = db
    .prepare(
      `SELECT e.equipmentName n, w.weaponCategory c, w.weaponRange r, w.damageDiceCount dc,
              w.damageDiceSides ds, w.damageTypeID dt, w.versatileDiceCount vc,
              w.versatileDiceSides vs, w.rangeNormalFt rn, w.rangeLongFt rl
       FROM Weapon w JOIN Equipment e USING (equipmentID) WHERE e.equipmentName = ?`,
    )
    .get(name) as unknown as WeaponRow | undefined;
  if (!w) throw new Error(`weapon not found: ${name}`);
  const propRows = db
    .prepare(
      `SELECT p.weaponPropertyName n FROM WeaponPropertyLink l
       JOIN WeaponProperty p USING (weaponPropertyID)
       JOIN Equipment e ON e.equipmentID = l.equipmentID WHERE e.equipmentName = ?`,
    )
    .all(name) as unknown as { n: string }[];
  const properties = propRows
    .map((r) => WEAPON_PROPERTY_BY_NAME[r.n])
    .filter((p): p is WeaponProperty => p !== undefined);
  return {
    name: w.n,
    category: w.c,
    range: w.r,
    diceCount: w.dc,
    diceSides: w.ds,
    damageType: DAMAGE_TYPE_BY_ID[w.dt] as DamageType,
    properties,
    versatileDiceCount: w.vc,
    versatileDiceSides: w.vs,
    rangeNormalFt: w.rn,
    rangeLongFt: w.rl,
  };
}

interface ArmorRow {
  n: string;
  c: 'light' | 'medium' | 'heavy';
  b: number;
  ad: number;
  dc: number | null;
}

/** Read one armor's stats by equipment name. */
export function loadArmor(db: DatabaseSync, name: string): ArmorInfo {
  const a = db
    .prepare(
      `SELECT e.equipmentName n, ar.armorCategory c, ar.armorBaseAc b, ar.armorAddsDex ad,
              ar.armorDexCap dc
       FROM Armor ar JOIN Equipment e USING (equipmentID) WHERE e.equipmentName = ?`,
    )
    .get(name) as unknown as ArmorRow | undefined;
  if (!a) throw new Error(`armor not found: ${name}`);
  return {
    name: a.n,
    category: a.c,
    baseAc: a.b,
    addsDex: a.ad === 1,
    dexCap: a.dc,
  };
}

/** Read a class's hit die and saving-throw proficiencies by slug. */
export function loadClass(db: DatabaseSync, slug: string): ClassInfo {
  const c = db
    .prepare(`SELECT classID, classHitDieSides h FROM Class WHERE classSlug = ?`)
    .get(slug) as unknown as { classID: number; h: number } | undefined;
  if (!c) throw new Error(`class not found: ${slug}`);
  const saves = db
    .prepare(`SELECT abilityID FROM ClassSavingThrow WHERE classID = ?`)
    .all(c.classID) as unknown as { abilityID: number }[];
  return {
    slug,
    hitDieSides: c.h,
    saveProficiencies: saves.map((s) => abilityById(s.abilityID)) as Ability[],
  };
}

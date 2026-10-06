// Loads the seed database into an in-memory SQLite instance and reads monster
// rows for the content compiler. This is the DB-coupled layer (Node only); the
// compiler itself (monster.ts) stays pure. It mirrors how scripts/srd/check-srd
// -seed.mjs builds the database, so the sim reads exactly the committed seeds.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { MonsterSource, MonsterActionRow, MonsterDamageRow, MonsterRow } from './monster';

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

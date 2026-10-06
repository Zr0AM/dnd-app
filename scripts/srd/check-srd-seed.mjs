// Loads docs/db/schema-draft.sql and every docs/db/seed/*.sql file into an in-memory
// SQLite database (node:sqlite, the same engine family as D1) and checks that:
//   * every statement runs, with foreign keys enforced,
//   * PRAGMA foreign_key_check finds nothing,
//   * running all seeds a second time changes no table's row count (idempotent).
// Prints the row count of each seeded table. Exits non-zero on any failure.
//
//   node scripts/srd/check-srd-seed.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dbDir = join(root, 'docs/db');
const seedDir = join(dbDir, 'seed');
const seeds = readdirSync(seedDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
// Stand-in for the Item table that already exists in D1 (see src/app/core/items).
db.exec(`CREATE TABLE Item (
  itemID INTEGER PRIMARY KEY, itemName TEXT NOT NULL, itemRarity TEXT, itemCost REAL,
  itemType TEXT, itemRestrictions TEXT, itemAttunement TEXT, itemSource TEXT, itemUrl TEXT,
  itemVisualDesc TEXT, itemShopkeeperDesc TEXT, active INTEGER NOT NULL DEFAULT 1,
  itemDescription TEXT, itemDescriptionSource TEXT)`);
db.exec(`INSERT INTO Item (itemName, itemDescriptionSource) VALUES
  ('Bag of Holding', 'SRD 5.2.1, CC-BY-4.0'), ('Ammunition', NULL), ('Staff of the Magi', NULL)`);
db.exec(readFileSync(join(dbDir, 'schema-draft.sql'), 'utf8'));

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
  .all()
  .map((r) => r.name);
const counts = () =>
  Object.fromEntries(
    tables.map((t) => [t, db.prepare(`SELECT count(*) AS n FROM "${t}"`).get().n]),
  );

const failures = [];
const runSeeds = () => {
  for (const file of seeds) {
    try {
      db.exec(readFileSync(join(seedDir, file), 'utf8'));
    } catch (err) {
      failures.push(`${file}: ${err.message}`);
    }
  }
};

runSeeds();
const first = counts();
runSeeds();
const second = counts();

const fk = db.prepare('PRAGMA foreign_key_check').all();
if (fk.length) failures.push(`foreign_key_check: ${JSON.stringify(fk.slice(0, 5))}`);
for (const t of tables) {
  if (first[t] !== second[t]) failures.push(`${t}: ${first[t]} rows, then ${second[t]} on re-run`);
}

for (const t of tables.filter((t) => first[t])) console.log(`${t.padEnd(24)} ${first[t]}`);
if (failures.length) {
  for (const f of failures) console.error(`FAIL ${f}`);
  process.exit(1);
}
console.log(`OK: ${seeds.length} seed files, no FK violations, idempotent`);

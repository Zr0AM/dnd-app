# Game data schema plan

Status: **migration written, not yet applied to production.**

- The schema is migration `0003_game_data_tables.sql` and the data is
  `seed/srd/*.sql`, both in [Zr0AM/dnd-db-rest](https://github.com/Zr0AM/dnd-db-rest)
  (branch `game-data-tables`). Its README has the commands to apply them.
- [`schema-draft.sql`](./schema-draft.sql) here is the same SQL. Keep the two
  identical: change the migration with a new numbered migration, then copy it
  here.
- Seed data is generated into [`seed/`](./seed) as described under "Data
  source" below. Copy it to `dnd-db-rest/seed/srd/` after regenerating.
- `npm run srd:check` loads the schema and the seeds into SQLite with foreign
  keys on, on top of a stub of today's `Item` table.

## What was analyzed

1. **The SRD 5.2.1 reference artifact.** This is the full 364-page text plus
   `srd_magic_items.json` (258 items with `name`, `header`, `type`,
   `requires_attunement` and `description`). By rough count the text holds about
   **339 spells** and about **329 stat blocks**, plus 12 classes with 12
   subclasses, 9 species, 4 backgrounds, the feats, the equipment chapter, the
   Rules Glossary and the Gameplay Toolbox.
2. **The app's current data.**
   - The only table in D1 is `Item`. The `dnd-db-rest` Worker serves it at
     `/rest/Item`, with any column usable as a filter (`functions/_lib/item-query.ts`).
   - Several tables are hard-coded in TypeScript:
     - `DENOMS` in `core/coins/coins.ts`
     - `CR_BANDS`, `MAGIC_TABLE_RARITY`, `GEM_NAMES` and `ART_NAMES` in
       `treasure-generator/hoard-tables.ts`
     - the rarity list implied by `raritySlug()`

### Gaps in the current `Item` table

| Problem                                     | Example                                                           | Fix in the plan                                                                      |
| ------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Rarity, type and attunement are free text   | `itemAttunement: 'Yes'`, `itemRarity: 'Very Rare'`                | `rarityID` → `Rarity`, `categoryID` → `ItemCategory`, `itemRequiresAttunement` (0/1) |
| "Rarity Varies" items collapse into one row | Weapon +1/+2/+3, Potion of Healing tiers, Spell Scroll levels 0–9 | `ItemVariant`, one row per tier with its own rarity and cost                         |
| Attunement prerequisites are buried in text | "Requires Attunement by a Cleric or Paladin"                      | `ItemAttunementReq`, with one row per allowed class, species or "spellcaster"        |
| Base item restriction is lost               | "Armor (Any Medium or Heavy, Except Hide Armor)"                  | `itemHeader` + `itemBaseRequirement`                                                 |
| Provenance is a string                      | `itemSource: 'Dungeon Master’s Guide'`                            | `sourceID` → `Source` (license and attribution live in one place)                    |
| Items that cast spells aren't linked        | Cube of Force, wands, staffs                                      | `ItemSpell` (charge cost, save DC)                                                   |

## Design conventions

- **Match `Item`.** Tables are PascalCase and singular. Columns are camelCase and
  prefixed with their entity (`spellName`, `monsterAc`). Foreign keys reuse the
  target's key name (`rarityID`). The Worker and the front end already use this
  convention, and the prefixes keep joined views unambiguous.
- **Every content row** has `<entity>Slug` (unique, for URLs and stable seeds),
  `sourceID`, `sourcePage` (deep-links into the SRD reader) and `active`, which
  works like the `active` flag on `Item`: the API returns only 1.
- **Integers for money and dice.** New tables store `costCp` (copper), like the
  internal maths in `coins.ts`. Dice are `(diceCount, diceSides)` pairs, so the
  generator can roll them without parsing. `Item.itemCost` stays in gp for now.
- **Lookup tables for open-ended values; `CHECK` lists for fixed ones.** Damage
  types and creature types are lookup tables. Armor category and spell
  components are `CHECK`s.
- **Child tables for anything filtered or computed on.** Examples are spell →
  class, monster defenses and attack damage. JSON (`…Details`, validated with
  `json_valid`) is only for small shapes that are display-only. **Full rules
  text is always kept** (`…Description`), even when it is also parsed.
- **Read views per screen** (`SpellListView`, `MonsterListView`,
  `EquipmentListView`). The REST Worker appears to serve one table per path, so
  views let one GET return a joined list. Whether the Worker exposes views
  is still to be confirmed (see Open decisions).

## Table catalog (75 tables, 3 views)

### 1. Reference (15)

Small, stable tables. Most other domains depend on them.

| Table                                                   | Holds                                                         | Replaces / used by                                       |
| ------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| `Source`                                                | SRD 5.2.1, D&D Beyond, Homebrew, with license and attribution | `itemSource`, `itemDescriptionSource`, footer and /legal |
| `Ability`, `Skill`                                      | 6 abilities, 18 skills (each with its ability)                | classes, backgrounds, monsters                           |
| `DamageType`, `Condition`                               | 13 damage types, 15 conditions                                | weapons, monster defenses, glossary                      |
| `CreatureSize`, `CreatureType`, `Alignment`, `Language` | creature vocabulary                                           | species, monsters                                        |
| `Denomination`                                          | pp/gp/ep/sp/cp and their cp values                            | `DENOMS` in `coins.ts`                                   |
| `Rarity`                                                | name, slug, sort order, SRD value, crafting days and cost     | `raritySlug()`, market sort, crafting                    |
| `ItemCategory`                                          | the 9 magic item categories                                   | `itemType`                                               |
| `MagicSchool`                                           | 8 schools                                                     | spells                                                   |
| `ChallengeRating`                                       | CR → XP and PB (`crValue` numeric, `crLabel` '1/8')           | monsters, treasure bands                                 |
| `CharacterLevel`                                        | level → XP and PB                                             | classes, encounter budget                                |

### 2. Equipment (12)

`Equipment` is the base row: name, kind, `costCp`, weight. Subtype tables
share its key:

- `Weapon` (+ `WeaponProperty`, `WeaponPropertyLink`, `WeaponMastery`)
- `Armor`
- `Tool`
- `Mount`
- `Vehicle`

`EquipmentContent` lists what is inside packs. `Service` covers lifestyle, food,
lodging, hirelings and spellcasting services. `Trinket` is the d100 table. This
lets the Market sell mundane gear, and gives magic items a base item
(+1 Plate = Rare value + Plate cost).

### 3. Classes (11)

| Table                                                         | Holds                                                                                                                                                                                                                |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Class`                                                       | Core traits: hit die, skill-choice count, caster type, spellcasting ability                                                                                                                                          |
| `ClassPrimaryAbility`, `ClassSavingThrow`, `ClassSkillOption` | Links to abilities and skills                                                                                                                                                                                        |
| `ClassProficiency`                                            | Weapon, armor and tool training, with a `grantedOnMulticlass` flag                                                                                                                                                   |
| `ClassStartingEquipment`                                      | "Choose A or B", one row per line                                                                                                                                                                                    |
| `ClassLevelValue`                                             | The class-specific columns of each Features table, as key/value rows (Rages, Rage Damage, Sneak Attack, Prepared Spells, pact slots …). Classes have different columns, so this avoids 12 differently shaped tables. |
| `ClassSpellSlot`                                              | Slots per class and level. Kept per class because the 2024 half casters have their own tables from level 1.                                                                                                          |
| `Subclass`, `ClassFeature`                                    | Class and subclass features by level                                                                                                                                                                                 |
| `FeatureOption`                                               | Metamagic options and Eldritch Invocations                                                                                                                                                                           |

### 4. Spells (2)

`Spell` stores level (0 = cantrip), school, casting time, ritual, range, the
V/S/M flags with the material text, cost and consumed flag, duration,
concentration, the description and the higher-level text. `SpellClass` holds
the class spell lists.

### 5. Origins (9)

- `Species` (+ `SpeciesSize`, `SpeciesTrait`, `SpeciesOption`). `SpeciesOption`
  holds per-trait choices such as Draconic Ancestors, Elven Lineages and
  Fiendish Legacies.
- `Background` (+ `BackgroundAbility`, `BackgroundSkill`, `BackgroundEquipment`)
- `Feat`, with category origin, general, fighting_style or epic_boon

### 6. Magic items (3 new tables + 8 columns on `Item`)

Nullable columns are added to `Item` beside the existing text columns. The new
tables are `ItemVariant`, `ItemAttunementReq` and `ItemSpell`. The old text
columns are dropped only after the API and the app read the new ones.

### 7. Monsters (12)

`Monster` holds the scalar stat-block fields: AC, HP average and dice, the six
ability scores, initiative, passive Perception, CR (FK), XP in lair, and the
number of legendary action uses. Each multi-valued line gets a child table:

- `MonsterSize`
- `MonsterSpeed`
- `MonsterSave`
- `MonsterSkill`
- `MonsterSense`
- `MonsterDefense` (resistances, vulnerabilities and immunities, to a damage type or a condition)
- `MonsterLanguage`
- `MonsterGear` (→ `Equipment`)
- `MonsterAction`: traits, actions, bonus actions, reactions and legendary actions, with attack and save fields
- `MonsterActionDamage`: structured damage per attack
- `MonsterSpell`: spells listed in Spellcasting actions (→ `Spell`)

### 8. Rules and toolbox (4)

- `RuleEntry` holds glossary terms, actions, hazards, curses and contagions,
  environmental effects, mental stress and traps. Traps keep trigger, duration
  and countermeasures in `ruleDetails`.
- `Poison`
- `TravelPace`
- `EncounterXpBudget` (Low/Moderate/High by level)

### 9. Treasure generator (7)

These tables replace `hoard-tables.ts` one for one:

| Table                    | Replaces                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------- |
| `TreasureBand`           | `CR_BANDS` id, minCr, label, blurb                                                                 |
| `TreasureBandCoin`       | `coins: CoinFormula[]`                                                                             |
| `TreasureHoardRow`       | `rows: HoardRow[]` (d100 `upTo` + gem/art roll)                                                    |
| `TreasureHoardMagicRoll` | `magic: MagicRoll[]` per row                                                                       |
| `MagicItemTable`         | `MAGIC_TABLE_RARITY` (A–I → rarity)                                                                |
| `MagicItemTableEntry`    | _new, optional_: weighted d100 rows, so a table picks real items instead of "any item of rarity X" |
| `Valuable`               | `GEM_NAMES`, `ART_NAMES`                                                                           |

> The hoard and A–I tables come from the 2014 DMG, not the SRD. Give them their
> own `Source` row, so the license shown for SRD content stays accurate.

## Key relationships

```mermaid
erDiagram
  Source ||--o{ Item : provides
  Source ||--o{ Spell : provides
  Source ||--o{ Monster : provides
  Rarity ||--o{ Item : rates
  Rarity ||--o{ ItemVariant : rates
  ItemCategory ||--o{ Item : groups
  Item ||--o{ ItemVariant : "rarity varies"
  Item ||--o{ ItemAttunementReq : requires
  Item ||--o{ ItemSpell : casts
  Spell ||--o{ ItemSpell : ""
  Spell ||--o{ SpellClass : ""
  Class ||--o{ SpellClass : ""
  Class ||--o{ Subclass : has
  Class ||--o{ ClassFeature : grants
  Class ||--o{ ClassLevelValue : progression
  Background }o--|| Feat : "origin feat"
  Species ||--o{ SpeciesTrait : has
  Equipment ||--o| Weapon : is
  Equipment ||--o| Armor : is
  ChallengeRating ||--o{ Monster : rates
  Monster ||--o{ MonsterAction : has
  MonsterAction ||--o{ MonsterSpell : casts
  Spell ||--o{ MonsterSpell : ""
  TreasureBand ||--o{ TreasureHoardRow : rolls
  TreasureHoardRow ||--o{ TreasureHoardMagicRoll : ""
  MagicItemTable ||--o{ TreasureHoardMagicRoll : ""
  MagicItemTable }o--|| Rarity : samples
```

## Data source: the 2024 SRD ("5.5e") as JSON

Most tables don't need to be parsed out of the PDF. [5e-bits/5e-srd-api](https://github.com/5e-bits/5e-srd-api)
publishes the 2024 SRD as structured JSON in `packages/5e-database/src/2024/en`.
The repo's code is MIT-licensed and the content is the SRD under CC-BY-4.0.
`5e-bits/5e-database` used to hold this data but is now archived and points to
5e-srd-api.

`scripts/srd/build-srd-seed.mjs` turns a checkout pinned to `05c109e` into seven
seed files in [`seed/`](./seed). `scripts/srd/check-srd-seed.mjs` loads the
schema and the seeds into SQLite with foreign keys on, runs the seeds twice, and
fails on any error, foreign-key violation or row-count change.

```bash
git clone https://github.com/5e-bits/5e-srd-api ../5e-srd-api
git -C ../5e-srd-api checkout 05c109ea1f6b5445960b645ded48ad9c6a8df7b0
npm run srd:seed -- ../5e-srd-api   # rewrites docs/db/seed/*.sql
npm run srd:check                   # schema + seeds load cleanly, twice
```

The seeds are idempotent. Parent rows are upserted on their slug or natural
key, so their IDs stay stable. Child rows are deleted and re-inserted. Every
foreign key is written as a sub-select on a slug, so no file depends on
generated IDs.

| File                    | Loads                                                                                                                                                                                                                                       | Rows (main tables)                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `01-reference.sql`      | Source, abilities, skills, damage types, conditions, sizes, creature types, alignments, languages, coins, rarity (with SRD values and crafting), item categories, schools, CR → XP/PB, level → XP/PB, weapon properties, masteries, poisons | 15 conditions, 13 damage types, 34 CRs, 14 poisons        |
| `02-equipment.sql`      | `Equipment`, `Weapon`, `Armor`, `Tool`, pack contents                                                                                                                                                                                       | 182 items, 38 weapons, 13 armor, 36 tools                 |
| `03-classes.sql`        | Classes, saves, skill options, proficiencies, class table columns, spell slots, subclasses, features                                                                                                                                        | 12 classes, 600 level values, 680 slot rows, 232 features |
| `04-spells.sql`         | `Spell`, `SpellClass`                                                                                                                                                                                                                       | 339 spells, 879 class links                               |
| `05-origins.sql`        | Feats, species (+ sizes, traits, lineage/ancestry options), backgrounds                                                                                                                                                                     | 17 feats, 9 species, 24 options, 4 backgrounds            |
| `06-monsters.sql`       | `Monster` and all stat-block child tables                                                                                                                                                                                                   | 341 monsters, 1,392 actions, 733 damage rolls, 379 spells |
| `07-items-backfill.sql` | Fills the new `Item` columns, `ItemVariant` and `ItemAttunementReq` for existing `Item` rows whose name matches one of the 262 SRD items                                                                                                    | depends on the live catalog                               |

The magic items only **backfill** `Item`; they never insert rows into it. `Item`
rows carry Market data (price, shopkeeper text) that the SRD lacks. The
backfill only claims rows with no `itemSlug`, and only sets `sourceID` to the
SRD on rows whose description already came from the SRD.

### Confirmed 2024 (5.5e), not 2014 (5e)

The repo ships both editions. The script reads only `src/2024/en`, and it
refuses any record whose URL isn't `/api/2024/…`. The content itself is also
2024:

- **2024-only features are present.** Every weapon has a mastery property, and
  the 2014 data has none. The data has species (Goliath and Orc instead of
  Half-Elf and Half-Orc), backgrounds that grant origin feats, Monk Focus Points
  instead of Ki, and 339 spells (the 2014 SRD has 319).
- **The text matches your SRD 5.2.1 artifact.** It matches for 339/339 spells,
  341/341 monsters, 232/232 class features, 17/17 feats, 15/15 conditions,
  8/8 masteries and 14/14 poisons, and for 258/262 magic items. The other four
  are 2024 text with table or spacing differences. Every spell, monster,
  equipment, species, background, feat and subclass name appears in the SRD
  5.2.1 text.
- **Nothing duplicates 2014 text.** No spell or magic item description is the
  same as in the 2014 data. One monster's actions (Vampire, Mist Form) are the
  same, because that stat block didn't change, and they match SRD 5.2.1.
- **Hard-coded values come from SRD 5.2.1.** These are the rarity values and
  crafting costs (p. 205–206) and the XP tables.

One dataset error was found: the description of Potion of Gaseous Form holds
another potion's text. The seeds don't use magic item descriptions, so nothing
is affected.

### Checked against the SRD 5.2.1 text

Spot checks matched:

- Weapons: Longsword, Longbow, Dagger, Blowgun
- Armor: Half-Plate, Plate, Shield
- Spells: Revivify's 300 GP diamond (consumed); Identify (ritual)
- Class tables: Barbarian and Monk class columns, Rogue Sneak Attack, all spell-slot tables at level 5
- Monsters: the Assassin's attacks and damage, the Lich's spell frequencies

Three differences from the SRD text are handled in the script:

- **Human size.** The dataset says Medium. The SRD says "Medium … or Small",
  so an override seeds both.
- **Archmage XP.** The dataset copies the SRD's printed "XP 8,000" for a CR 12
  creature (the table says 8,400). `Monster` takes XP from `ChallengeRating`,
  so it is listed as a known quirk.
- **Monk Martial Arts die.** The dataset stores a bare `6`, which is seeded as
  `d6`.

### What the dataset does not cover

These still need the SRD text, or hand entry:

| Missing                                                                                                                | Tables left empty                                                                            |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Monster initiative, legendary-action uses, type tags such as "(Wizard)"                                                | `Monster.monsterInitBonus` and related columns stay NULL                                     |
| Starting equipment as structured rows (the text is kept in `classStartingEquipmentText` and `backgroundEquipmentText`) | `ClassStartingEquipment`, `BackgroundEquipment`                                              |
| Metamagic options, Eldritch Invocations                                                                                | `FeatureOption`                                                                              |
| Mounts, vehicles, lifestyle/food/lodging/hirelings, trinkets                                                           | `Mount`, `Vehicle`, `Service`, `Trinket`                                                     |
| Rules Glossary, Gameplay Toolbox (travel pace, traps, curses, encounter XP budget)                                     | `RuleEntry`, `TravelPace`, `EncounterXpBudget`                                               |
| Spells cast by magic items, page numbers                                                                               | `ItemSpell`, every `sourcePage`                                                              |
| Treasure tables (2014 DMG, not SRD)                                                                                    | the `Treasure*`, `MagicItemTable` and `Valuable` tables, to be seeded from `hoard-tables.ts` |

## Suggested rollout

Each phase can ship on its own, and the app keeps working at every step.

1. **Reference tables, `Item` backfill and treasure config.** Apply the schema
   and `01-reference.sql`, then `07-items-backfill.sql` against the live
   catalog. Move `DENOMS` and `hoard-tables.ts` into the treasure tables behind
   a `/api/treasure-config` endpoint. Keep the TS constants as the offline/dev
   fixture.
2. **Equipment** (`02`). This unlocks mundane goods in the Market, and base
   items for magic weapons and armor.
3. **Spells** (`04`, which needs `03` for class lists). Then link `ItemSpell`
   and the Spell Scroll variants.
4. **Monsters** (`06`). This lets the Loot Generator pick a monster instead of
   a bare CR, and enables an encounter builder once `EncounterXpBudget` is
   filled.
5. **Character options** (`03`, `05`).
6. **Text-only gaps.** Parse the SRD text for the tables in "What the dataset
   does not cover".

## Open decisions

1. **Exposing the new tables.** Migrations live in `dnd-db-rest`, and the new
   tables are not in its REST allowlist (`TABLES` in `src/rest.ts`) yet. The
   generic `/rest/{table}` routes assume a single integer primary key. Most
   content tables fit that (`spellID`, `monsterID` …), but text or composite
   keys (`Denomination`, `TreasureBand`, link tables) and the views would need
   either read-only allowlist entries or `/query` calls from a new Pages
   Function.
2. **Item cost unit.** Moving `itemCost` (gp) to cp would make it match the new
   tables, but every consumer of `formatCost`/`compareCost` would change. The
   plan leaves it in gp.
3. **Existing D&D Beyond rows.** Some `Item` rows hold DDB text
   (`itemDescriptionSource = 'D&D Beyond'`). Should they become a `Source` with
   no CC license and stay as they are, or be replaced by SRD text where the
   item exists in both?
4. **Homebrew and user data** (custom items, saved hoards, parties) are out of
   scope here. The `Source` + `active` pattern leaves room for them later.

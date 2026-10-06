# Game data schema plan

Status: **draft for discussion**. Nothing here is deployed. The companion DDL is
[`schema-draft.sql`](./schema-draft.sql). It loads cleanly into SQLite 3.45 with
`PRAGMA foreign_keys=ON`, on top of a stub of today's `Item` table.

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

## Suggested rollout

Each phase can ship on its own, and the app keeps working at every step.

1. **Reference + Item normalization + treasure config.** Create the reference
   tables. Backfill `Item.rarityID`, `categoryID`, `sourceID`,
   `itemRequiresAttunement` and `itemHeader` from the current text columns and
   the SRD JSON (`header` gives rarity, attunement and the base requirement).
   Load `ItemVariant` for the 13 "Rarity Varies" items. Move `DENOMS` and
   `hoard-tables.ts` into the treasure tables, behind a `/api/treasure-config`
   endpoint, and keep the TS constants as the offline/dev fixture.
2. **Equipment.** Parse the Equipment chapter tables (p. 89–103). This unlocks
   mundane goods in the Market and base items for magic weapons and armor.
3. **Spells.** These are regular in the text: name, then a "Level N School
   (Classes)" line, then a "Casting Time … Range … Components … Duration"
   line. Link `ItemSpell` and the Spell Scroll variants.
4. **Monsters.** Parse the stat blocks (p. 258–364). This lets the Loot
   Generator pick a monster instead of a bare CR, and enables an encounter
   builder with `EncounterXpBudget`.
5. **Character options.** Classes, subclasses, species, backgrounds and feats.
   This part is the most hand-curated, because the class tables span columns
   in the text export.
6. **Rules reference.** Glossary, conditions, toolbox.

For each phase the import should be a **checked-in script** that reads the SRD
text/JSON and writes idempotent seed SQL keyed on slugs, so a re-run updates
rows instead of duplicating them. Spot-check its output against the PDF.

## Open decisions

1. **Where migrations live.** D1 is owned by the `dnd-db-rest` Worker. That
   Worker isn't in this repo, so it is unclear whether its routes can serve
   views and non-`Item` tables. This decides whether the views above are worth
   it, or whether each new table needs its own Pages Function like
   `functions/api/items.ts`.
2. **Item cost unit.** Moving `itemCost` (gp) to cp would make it match the new
   tables, but every consumer of `formatCost`/`compareCost` would change. The
   plan leaves it in gp.
3. **Existing D&D Beyond rows.** Some `Item` rows hold DDB text
   (`itemDescriptionSource = 'D&D Beyond'`). Should they become a `Source` with
   no CC license and stay as they are, or be replaced by SRD text where the
   item exists in both?
4. **Homebrew and user data** (custom items, saved hoards, parties) are out of
   scope here. The `Source` + `active` pattern leaves room for them later.

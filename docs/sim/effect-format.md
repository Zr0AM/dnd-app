# Effect format spec

Status: **draft for review. Spec only; no code.**

Part of the [simulator plan](./plan.md), Phase 1. This is the format that turns SRD rules text into
data the combat engine can run: spells, class features, feats, species traits, magic items, and the
parts of monster stat blocks that the database does not already structure.

It is the largest and riskiest piece of the project, so it comes first. The numbers below come from a
survey of the seed data in `docs/db/seed/` and the SRD 5.2.1 text, not from estimates.

## 1. What the survey found

The seeds store **numbers** in tables (level, slots, hit dice, monster attacks) and **behaviour** as
rules text. The engine needs behaviour as data, so we write it ourselves.

### Spells (339)

Every spell was assigned to the engine capability it needs. The assignment is my own reading of each
spell and should be reviewed. Counts are exact for this assignment, not for the rules themselves.

| Family                                                    | Code |   Count | Engine capability needed              |
| --------------------------------------------------------- | ---- | ------: | ------------------------------------- |
| Attack-roll damage (Fire Bolt, Scorching Ray)             | `AD` |      17 | Core                                  |
| Save-for-damage (Fireball, Burning Hands)                 | `SD` |      29 | Core                                  |
| Auto-hit or threshold (Magic Missile, Power Word Kill)    | `MM` |       3 | Core                                  |
| Save-or-effect (Hold Person, Hypnotic Pattern)            | `CC` |      22 | Core (statuses, repeat saves)         |
| Healing, temp HP, cleanse, revive                         | `HL` |      20 | Core                                  |
| Buffs, riders, smites (Bless, Haste, Hex)                 | `BF` |      41 | Core (modifiers, triggers)            |
| **Core subtotal**                                         |      | **132** |                                       |
| Persistent zones, auras, barriers (Spirit Guardians, Web) | `ZN` |      40 | **Zone subsystem**                    |
| Summons and new combatants (Conjure Animals)              | `SM` |      18 | **Summon subsystem**                  |
| Charm, fear, compulsion                                   | `CH` |      15 | **Behaviour-control hooks in the AI** |
| Movement, teleport, forced movement (Misty Step)          | `MV` |      11 | **Movement subsystem**                |
| Transformation (Polymorph)                                | `TR` |       6 | **Transformation subsystem**          |
| Reactions (Shield, Counterspell)                          | `RX` |       4 | **Reaction windows**                  |
| Negation (Dispel Magic, Antimagic Field)                  | `NG` |       4 | **Magic-effect registry**             |
| **Subsystem subtotal**                                    |      |  **98** |                                       |
| Meta or adjudicated (Wish, Gate, Time Stop)               | `MT` |       7 | Probably unsupported                  |
| Non-combat (Alarm, Identify, Detect Magic, ...)           | `NC` |     102 | Out of scope by design                |

What each checkpoint level needs, counting spells up to the highest slot level the character can
reach:

| Level | Spell levels | In scope | Core | Subsystem | Meta | Non-combat |
| ----: | -----------: | -------: | ---: | --------: | ---: | ---------: |
|     3 |       0 to 2 |      141 |   72 |        26 |    0 |         43 |
|     5 |       0 to 3 |      183 |   84 |        42 |    0 |         57 |
|    11 |       0 to 6 |      286 |  112 |        80 |    2 |         92 |
|    17 |       0 to 9 |      339 |  132 |        98 |    7 |        102 |

### Class features (232)

| Kind                                                                              | Count |
| --------------------------------------------------------------------------------- | ----: |
| Needs an effect entry                                                             |   143 |
| Choice point (ASI, subclass pick, Epic Boon, Fighting Style, Weapon Mastery, ...) |    54 |
| Non-combat (Druidic, Thieves' Cant, ...)                                          |    19 |
| Spell grant, handled by the spell system (Spellcasting, subclass spell lists)     |    16 |

Of the 143 that need entries, by class level: **56** at levels 1 to 5, **41** at 6 to 11, **26** at
12 to 17, and 20 at 18 to 20. Level 18 and up is outside the checkpoints, so the real workload is
**123 entries**, with 56 needed for the level 3 and 5 checkpoints.

`ClassLevelValue` already holds the numeric progressions, under keys such as `rageCount`,
`rageDamageBonus`, `sneakAttack`, `secondWindUses`, `sorceryPoints`, `focusPoints`,
`channelDivinityCharges` and `bardicInspirationDie`. Effects reference these keys instead of
repeating the numbers.

### Feats, species, items

- **Feats: only 17 exist in the SRD**, and the build space is smaller than a full 2024 game. Origin:
  Alert, Magic Initiate, Savage Attacker, Skilled. General: Ability Score Improvement and Grappler.
  Fighting styles: Archery, Defense, Great Weapon Fighting, Two Weapon Fighting. Seven Epic Boons are
  level 19+ and outside the checkpoints. About 8 entries matter. The genome is dominated by class,
  multiclass split, species, ability scores, spells and gear, not feats.
- **Species traits: 31**, about 18 of them mechanical.
- **Magic items: 258 SRD items**, which reduce to the same primitives as spells and features
  (modifiers, uses, charges, "casts a spell", riders). Roughly 150 to 170 are combat-relevant
  (weapons 33, armor 19, wands 13, staffs 12, rods 7, potions 24, rings 22, plus perhaps 40 of the 127
  wondrous items). That count is an estimate. A proper tagging pass belongs to Phase 8.

### Monsters (341)

Monster attacks and saves are already structured, so many stat blocks compile without hand-authored
effects. A monster **auto-compiles** when every action is an attack roll or a save with damage rows
(plus Multiattack). That is a lower bound, because it ignores traits:

| CR band  | Monsters | All actions auto-compile | With legendary actions |
| -------- | -------: | -----------------------: | ---------------------: |
| 0 to 4   |      224 |                      128 |                      0 |
| 5 to 10  |       68 |                       28 |                      2 |
| 11 to 16 |       29 |                        5 |                     13 |
| 17 to 20 |        8 |                        1 |                      5 |
| 21+      |       12 |                        0 |                     12 |

So levels 11 and 17 need hand-authored monster effects (conditions on hit, recharge breath weapons,
legendary actions, lair actions). The most common traits are shared and worth a library: Magic
Resistance (34), Legendary Resistance (34), Amphibious (31), Pack Tactics (20), Spider Climb (16),
Water Breathing (9), Swarm (7), Flyby (7).

### Data quirks that affect the format

These are not format problems, but the compiler must tolerate them. Several are worth fixing in the
seeds.

1. **Upcast text is inconsistent.** 21 spells have "Using a Higher-Level Spell Slot" or "Cantrip
   Upgrade" text inside `spellDescription` and a NULL `spellHigherLevel` (Cure Wounds is one). Only 103
   spells populate `spellHigherLevel`. Scaling is therefore never derived from text; it is authored.
2. **`spellRange` carries component noise** in 9 spells. Values such as `Touch Component: V, S` and
   `60 feet Component: V` occur. The compiler cleans these.
3. **PDF hyphenation artifacts** remain in 17 feature descriptions and 2 spell descriptions
   (`Ar- mor`, `Blud- geoning`).
4. **`FeatureOption` is empty.** Metamagic options and Eldritch Invocations are in the SRD text
   (confirmed) but not seeded. Effects cannot reference them until they are.
5. **`monsterInitBonus` is NULL**, and 18 monster attack rows have no damage row.
6. **Duration is free text** with 25 distinct values. The compiler normalizes it and effects may
   override it.

Consequence: the effect layer never parses rules text. It is authored data, keyed to the database by
slug, with a hash of the source text so changed text is detected.

## 2. Design principles

1. **Declarative data, not code.** Entries are JSON validated by a schema. No arbitrary expressions
   or scripts. This keeps them diffable, hashable (for result invalidation) and countable (for the
   coverage report).
2. **Few primitives, many entries.** About 16 effect operations, a status and modifier system, a
   trigger system and one expression language should express every core-family spell and most
   features. Anything else is a named subsystem or, rarely, a handler.
3. **The database owns facts it already has.** Level, casting time, concentration, range, slot tables
   and monster numbers come from the DB. The effect layer owns only behaviour. This avoids two sources
   of truth.
4. **Honest fidelity.** Every entry declares how faithfully it models the rules, with tests. The GA
   never sees a feature the engine cannot represent.
5. **The effect layer declares the genome's decision points.** Choices (Draconic Ancestry, Fighting
   Style, Metamagic, prepared spells) are listed in the entry, so the genome spec derives from the
   same source.

## 3. Files and identity

Content lives in `sim/content/`, one JSON file per group, not per entry (about 60 files instead of
about 900):

| Path                                | Holds                             |
| ----------------------------------- | --------------------------------- |
| `sim/content/spells/level-N.json`   | Spells by spell level             |
| `sim/content/features/<class>.json` | Class and subclass features       |
| `sim/content/feats.json`            | Feats                             |
| `sim/content/species.json`          | Species traits                    |
| `sim/content/items/<category>.json` | Magic items                       |
| `sim/content/monsters/cr-band.json` | Monster additions and overrides   |
| `sim/content/traits.json`           | Shared traits (Pack Tactics, ...) |

Each file is an array of **entries**. An entry's `slug` is the database slug (`spellSlug`,
`featureSlug`, `featSlug`, `monsterSlug`, `itemSlug`), so the compiler joins them. A slug that does
not exist in the database is a validation error.

The content is authored data and lives in git, reviewed in pull requests. It is not stored in D1. The
compiled bundle is hashed and that hash is stored with each result set.

## 4. The entry envelope

```json
{
  "slug": "fire-bolt",
  "kind": "spell",
  "fidelity": "exact",
  "core": false,
  "sourceHash": "sha256:...",
  "notes": "Ignition of flammable objects is ignored (no combat effect).",
  "choices": [],
  "resources": [],
  "statuses": {},
  "ability": {},
  "passive": { "modifiers": [], "triggers": [] },
  "tests": ["spell.fire-bolt.expected-damage"]
}
```

| Field        | Meaning                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| `kind`       | `spell`, `feature`, `feat`, `trait`, `item`, `monster`                                                    |
| `fidelity`   | `exact`, `approximated`, `unsupported`, `out_of_scope` (section 11)                                       |
| `core`       | Features only. `true` if the class cannot be modeled fairly without it (Rage, Sneak Attack, Spellcasting) |
| `sourceHash` | SHA-256 of the database description text at authoring time. A mismatch marks the entry stale              |
| `notes`      | Required unless `fidelity` is `exact`. States what is simplified and the expected bias                    |
| `choices`    | Decision points the genome or AI fills (section 10)                                                       |
| `resources`  | Pools and uses this entry defines (section 9)                                                             |
| `statuses`   | Named statuses this entry can apply, with modifiers and triggers (section 7)                              |
| `ability`    | Something an actor can **use**: casts, activations, item uses (section 6)                                 |
| `passive`    | Always-on modifiers and triggers                                                                          |
| `tests`      | IDs of golden tests (section 12). Required for `exact` and `approximated`                                 |

## 5. Expressions and predicates

One small language covers values and conditions. It is JSON, validated, and cannot run code.

- **Numbers:** `5`
- **Dice literals:** `"2d8"` is shorthand for `["dice", 2, 8]`
- **References:** strings starting with `$`
- **Operations:** arrays, `[op, ...args]`

| Group      | Operations                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Arithmetic | `+`, `-`, `*`, `/`, `min`, `max`, `floor`, `ceil`                                                                                                            |
| Dice       | `["dice", count, sides]`, where `count` is itself an expression                                                                                              |
| Scaling    | `["slotAbove", n]` (slot level minus `n`, never below 0), `["byLevel", {"1": a, "5": b, ...}]`                                                               |
| Logic      | `and`, `or`, `not`, `["if", cond, a, b]`                                                                                                                     |
| Comparison | `eq`, `neq`, `gte`, `lte`, `gt`, `lt`                                                                                                                        |
| Predicates | `["has", who, status]`, `["tag", "attack", name]`, `["rollHas", "advantage"]`, `["allyWithin", who, feet, filter]`, `["wearing", kind]`, `["wielding", tag]` |

References:

| Reference                               | Value                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------- |
| `$level`, `$classLevel.<class>`         | Character level, level in one class                                    |
| `$profBonus`                            | Proficiency bonus                                                      |
| `$mod.<ability>`                        | Ability modifier (`$mod.str`)                                          |
| `$spellMod`, `$spellDc`, `$spellAttack` | Spellcasting ability modifier, save DC, attack bonus                   |
| `$slot`                                 | Level of the slot used for this cast                                   |
| `$table.<columnKey>`                    | `ClassLevelValue` for the entry's class at the character's class level |
| `$self.*`, `$target.*`, `$attack.*`     | Properties of the actors and the roll in play                          |

Spell scaling is **always authored** (decision from quirk 1). `byLevel` works on character level for
cantrips and on class level when the entry is a class feature.

## 6. Abilities

An ability is something an actor chooses to use.

```json
{
  "action": "action",
  "cost": { "resource": "rage", "amount": 1 },
  "requires": ["not", ["wearing", "heavy-armor"]],
  "concentration": false,
  "target": { "kind": "creature", "range": "db" },
  "effects": []
}
```

- **`action`**: `action`, `bonus`, `reaction`, `free`, `none`. For spells this defaults to the
  database casting time.
- **`cost`**: a resource (a spell slot is implicit for spells).
- **`concentration`**: defaults to the database flag. Everything this ability creates (statuses, zones,
  summons) is linked to the concentration and ends with it.
- **`reactsTo`**: for reactions, the events that open the reaction window (section 8).

### Targeting

| `kind`      | Fields                                                                      |
| ----------- | --------------------------------------------------------------------------- |
| `self`      |                                                                             |
| `creature`  | `range`, `filter`, `requires` (`sight`)                                     |
| `creatures` | the above plus `count`, an expression (Bless: `["+", 3, ["slotAbove", 1]]`) |
| `point`     | `range`                                                                     |
| `area`      | `shape`, `size`, `origin` (`point` or `self`), `range`, `filter`            |

`shape` is `sphere`, `cube`, `cone`, `cylinder`, `line` or `emanation`. `range: "db"` parses the
database range string (after the quirk 2 cleanup). A malformed range is a compile error.

### Effect operations

Effects run in order. Damage rolled by an area effect is rolled **once per cast** and shared by all
targets, as the 2024 rules say (`rollOnce`, default true).

| Operation      | Does                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| `attack`       | Make an attack roll. `onHit`, `onMiss`, and crit doubling are handled by the engine                    |
| `save`         | Targets roll a saving throw. `onFail`, `onSuccess`, or the `damage` shorthand with `onSuccess: "half"` |
| `check`        | Ability or skill check (grapple and shove contests)                                                    |
| `damage`       | Apply damage of a type. `sameAsTriggering` copies a weapon's type for riders                           |
| `heal`         | Restore hit points                                                                                     |
| `tempHp`       | Grant temporary hit points                                                                             |
| `applyStatus`  | Apply a built-in condition or a status from `statuses`, with duration and an optional repeat save      |
| `removeStatus` | End a status or condition                                                                              |
| `move`         | Push, pull, teleport, or grant movement                                                                |
| `summon`       | Create combatants from a stat block (section 8)                                                        |
| `createZone`   | Create a persistent zone (section 8)                                                                   |
| `spend`        | Spend or grant a resource                                                                              |
| `modifyRoll`   | Add to, replace or reroll a roll in progress (Bardic Inspiration, Cutting Words, Luck)                 |
| `counter`      | Negate a spell being cast (Counterspell)                                                               |
| `handler`      | Escape hatch: a named engine function (section 13)                                                     |

## 7. Statuses and modifiers

A **status** is a named effect that sits on a creature, with a duration and optional links to
concentration. The 15 SRD conditions are built into the engine, so a condition is referenced by name.

A **modifier** changes a stat while its owner is active, optionally gated by a predicate `when`.

| `stat`                                             | Changes                                                | Fields                             |
| -------------------------------------------------- | ------------------------------------------------------ | ---------------------------------- |
| `ac`                                               | Armor Class                                            | `add`, `set`, `min`                |
| `attackRoll`                                       | Attack rolls                                           | `add`, `advantage`, `disadvantage` |
| `damageRoll`                                       | Damage rolls                                           | `add`                              |
| `save.<ability>`, `save.any`                       | Saving throws                                          | `add`, `advantage`, `disadvantage` |
| `check.<ability or skill>`                         | Ability checks                                         | same                               |
| `speed`                                            | Movement                                               | `add`, `mult`, `set`, `mode`       |
| `resistance`, `vulnerability`, `immunity`          | Damage and condition defenses                          | `types`                            |
| `extraAttacks`, `critRange`, `hpMax`, `initiative` | Combat stats                                           | `add`, `set`                       |
| `spellImmunity`                                    | Immunity to named spells (Shield versus Magic Missile) | `spells`                           |
| `cannot`                                           | Forbids actions                                        | `what`                             |

Stacking: modifiers from the same source do not stack. `add` from different sources stacks. `set` uses
the best value. A status may declare `keepAlive` events that extend its duration (Rage extends if the
barbarian attacked or forced a save).

Durations: `{ "rounds": n }` (a minute is 10 rounds), `{ "until": "endOfNextTurn" }`,
`{ "until": "startOfNextTurn" }`, `{ "untilRest": "short" | "long" }`, `{ "permanent": true }`.
Spells with `concentration: true` also end when concentration breaks.

## 8. Triggers, reactions, zones and summons

### Triggers

A trigger is `{ "on": event, "when": predicate, "oncePer": "turn" | "round" | "creature", "do":
[effects] }`. The events, in the order they occur during an attack and its surroundings:

| Group    | Events                                                                                                                                                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Attack   | `beforeAttackRoll`, `attackRollMade` (reroll or add), `attackHit` / `attackMiss` (**reaction window**), `damageRollOnHit` (riders such as Sneak Attack and smites), `beforeDamageApplied` (resistances, Uncanny Dodge) |
| Damage   | `damageApplied`, `droppedToZero` (Relentless Rage, Relentless Endurance), `killed`                                                                                                                                     |
| Saves    | `saveRolled`, `saveFailed`                                                                                                                                                                                             |
| Spells   | `spellCastDeclared` (Counterspell window), `spellResolved`                                                                                                                                                             |
| Time     | `roundStart`, `turnStart`, `turnEnd`, `initiativeRolled`                                                                                                                                                               |
| Movement | `movementStarted`, `leftReach` (opportunity attacks), `enteredZone`                                                                                                                                                    |
| Rest     | `shortRest`, `longRest`                                                                                                                                                                                                |

A **reaction** ability sets `reactsTo` to one of these events. The reaction window resolves **before**
the result applies, and a hit is re-checked afterwards. This is how Shield's "+5 AC, including against
the triggering attack" works.

Whether to take a reaction is decided by the shared AI, never by the entry.

### Zones

`createZone` builds a persistent area: `shape`, `size`, `anchor` (`point`, `caster`, `target`),
`duration`, terrain flags (`difficultTerrain`, `heavilyObscured`, `lightlyObscured`), modifiers for
creatures inside, and `triggers` on `enter`, `startTurnInside`, `endTurnInside` and
`zoneMovesOntoCreature`. `oncePerTurnPerCreature` handles "makes this save only once per turn".

### Summons

`summon` references a monster stat block by slug, plus a count, a control mode (`allyAI` or
`casterCommands`), and overrides such as the 2024 scaling stat blocks. The summoned creature uses the
same combat engine as a monster.

## 9. Resources

```json
{ "id": "rage", "max": "$table.rageCount", "recharge": { "short": 1, "long": "all" } }
```

`recharge` supports `short` and `long` (a number or `"all"`), `dawn`, `turn`, and for monsters
`{ "dice": [5, 6] }` for Recharge 5 to 6. A spell slot is a built-in resource from `ClassSpellSlot`.
Hit dice and Channel Divinity are resources with the same shape.

## 10. Choices (the genome interface)

```json
{ "id": "draconic-ancestry", "pick": 1, "from": ["black", "blue", "brass"], "when": "build" }
```

| `when`     | Meaning                                                                 |
| ---------- | ----------------------------------------------------------------------- |
| `build`    | Fixed in the genome (ancestry, fighting style, Metamagic known)         |
| `longRest` | Re-picked each long rest (prepared spells), set by the genome or the AI |
| `combat`   | Chosen in play by the shared AI (which Metamagic to apply to a cast)    |

## 11. Fidelity and coverage

| `fidelity`     | Meaning                                                                                                | In the genome?                 |
| -------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `exact`        | Every combat-relevant clause is implemented, and at least one golden test passes                       | Yes                            |
| `approximated` | A documented simplification. `notes` and `bias` (`under`, `over`, `unknown`) are required, plus a test | Yes, flagged in reports        |
| `unsupported`  | The engine cannot represent it. `reason` is required                                                   | Optional features are excluded |
| `out_of_scope` | No combat effect by design (exploration, social, downtime)                                             | Excluded, not counted          |

Rules:

- **Approximations should err low.** A GA exploits over-estimates. An `approximated` entry whose bias is
  `over` or `unknown` must say so, and reports flag every build that relies on one.
- **Class gate.** A class or subclass is optimizable at a level only if every `core` feature at or below
  that level is at least `approximated`. Otherwise it is excluded and listed in the coverage report.
- **Monster gate.** Only monsters at least `approximated` are eligible for the scenario library.
- **Staleness.** A `sourceHash` mismatch downgrades the entry to "needs review" and fails CI.

Coverage = (exact + approximated) / (all entries minus out_of_scope), reported by kind, class and
checkpoint level.

## 12. Validation

Run in CI, in this order:

1. **Schema.** Each file validates against the JSON Schema (and the generated TypeScript types).
2. **References.** Every slug exists in the database. Every `$table.<key>` exists for the class. Every
   status, resource and choice id used is defined.
3. **Expressions.** Type-checked: numeric where numeric, boolean where boolean, valid dice.
4. **Fidelity rules.** `notes` and `bias` present when required. `tests` present and the test ids exist.
5. **Staleness.** `sourceHash` matches the current database text.
6. **Golden tests.** Each `exact` or `approximated` entry has at least one test in `sim/test/golden/`
   that compares simulated results (fixed seed, many runs) to a closed-form expectation, such as the
   mean damage of Fireball against a DC 15 save at +2.

## 13. The escape hatch

`{ "op": "handler", "id": "wild-shape" }` calls a named, registered engine function. Handlers are for
mechanics the primitives cannot express. Rules:

- Each handler is documented and has golden tests.
- An entry using a handler cannot be `exact` without a test that exercises the handler.
- Coverage reports list handler counts. If the count grows past a small budget (I suggest 25), the
  primitives are missing something and we extend them instead.

## 14. Worked examples

These check that the format reaches the awkward cases. Every block was parsed as JSON when this was
written. They are illustrations against the SRD text, not the final authored content, and they have
not yet been checked against a schema (none exists yet).

### Fire Bolt: attack roll, cantrip scaling by character level

```json
{
  "slug": "fire-bolt",
  "kind": "spell",
  "fidelity": "approximated",
  "notes": "Ignition of flammable objects is ignored. Bias: none for combat.",
  "bias": "unknown",
  "ability": {
    "target": { "kind": "creature", "range": "db" },
    "effects": [
      {
        "op": "attack",
        "kind": "spell",
        "onHit": [
          {
            "op": "damage",
            "type": "fire",
            "amount": ["dice", ["byLevel", { "1": 1, "5": 2, "11": 3, "17": 4 }], 10]
          }
        ]
      }
    ]
  },
  "tests": ["spell.fire-bolt.expected-damage"]
}
```

### Fireball: area save, half on success, slot scaling

```json
{
  "slug": "fireball",
  "kind": "spell",
  "fidelity": "exact",
  "ability": {
    "target": { "kind": "area", "shape": "sphere", "size": 20, "origin": "point", "range": "db" },
    "effects": [
      {
        "op": "save",
        "ability": "dex",
        "dc": "$spellDc",
        "damage": {
          "type": "fire",
          "amount": ["dice", ["+", 8, ["slotAbove", 3]], 6],
          "onSuccess": "half"
        }
      }
    ]
  },
  "tests": ["spell.fireball.expected-damage", "spell.fireball.roll-once"]
}
```

### Hold Person: condition, repeat save, target count scaling, concentration

```json
{
  "slug": "hold-person",
  "kind": "spell",
  "fidelity": "exact",
  "ability": {
    "concentration": true,
    "target": {
      "kind": "creatures",
      "range": "db",
      "count": ["+", 1, ["slotAbove", 2]],
      "filter": ["eq", "$target.type", "humanoid"],
      "requires": "sight"
    },
    "effects": [
      {
        "op": "save",
        "ability": "wis",
        "dc": "$spellDc",
        "onFail": [
          {
            "op": "applyStatus",
            "condition": "paralyzed",
            "duration": { "rounds": 10 },
            "repeatSave": {
              "ability": "wis",
              "dc": "$spellDc",
              "when": "endOfTurn",
              "endsOn": "success"
            }
          }
        ]
      }
    ]
  },
  "tests": ["spell.hold-person.paralyzed-and-repeat-save"]
}
```

### Bless: status with modifiers on up to three allies

```json
{
  "slug": "bless",
  "kind": "spell",
  "fidelity": "exact",
  "statuses": {
    "blessed": {
      "modifiers": [
        { "stat": "attackRoll", "add": "1d4" },
        { "stat": "save.any", "add": "1d4" }
      ]
    }
  },
  "ability": {
    "concentration": true,
    "target": { "kind": "creatures", "range": "db", "count": ["+", 3, ["slotAbove", 1]] },
    "effects": [{ "op": "applyStatus", "status": "blessed", "duration": { "rounds": 10 } }]
  },
  "tests": ["spell.bless.adds-d4-to-attacks-and-saves"]
}
```

### Shield: a reaction that changes a result already rolled

```json
{
  "slug": "shield",
  "kind": "spell",
  "fidelity": "exact",
  "statuses": {
    "shield-of-force": {
      "modifiers": [
        { "stat": "ac", "add": 5 },
        { "stat": "spellImmunity", "spells": ["magic-missile"] }
      ]
    }
  },
  "ability": {
    "action": "reaction",
    "reactsTo": ["attackHit", "targetedBy:magic-missile"],
    "target": { "kind": "self" },
    "effects": [
      {
        "op": "applyStatus",
        "status": "shield-of-force",
        "duration": { "until": "startOfNextTurn" }
      }
    ]
  },
  "tests": ["spell.shield.recheck-hit", "spell.shield.blocks-magic-missile"]
}
```

### Spirit Guardians: a zone that follows the caster

```json
{
  "slug": "spirit-guardians",
  "kind": "spell",
  "fidelity": "approximated",
  "bias": "unknown",
  "notes": "Damage type is always radiant. The necrotic option for evil casters only changes resistance matchups.",
  "ability": {
    "concentration": true,
    "target": { "kind": "self" },
    "effects": [
      {
        "op": "createZone",
        "shape": "emanation",
        "size": 15,
        "anchor": "caster",
        "duration": { "rounds": 100 },
        "exclude": "designatedAllies",
        "modifiers": [{ "stat": "speed", "mult": 0.5 }],
        "triggers": [
          {
            "on": ["enteredZone", "endTurnInside", "zoneMovesOntoCreature"],
            "oncePer": "creature",
            "do": [
              {
                "op": "save",
                "ability": "wis",
                "dc": "$spellDc",
                "damage": {
                  "type": "radiant",
                  "amount": ["dice", ["+", 3, ["slotAbove", 3]], 8],
                  "onSuccess": "half"
                }
              }
            ]
          }
        ]
      }
    ]
  },
  "tests": ["spell.spirit-guardians.once-per-turn", "spell.spirit-guardians.halves-speed"]
}
```

### Cure Wounds: healing that scales by dice count

```json
{
  "slug": "cure-wounds",
  "kind": "spell",
  "fidelity": "exact",
  "ability": {
    "target": { "kind": "creature", "range": "db" },
    "effects": [
      {
        "op": "heal",
        "amount": ["+", ["dice", ["+", 2, ["*", 2, ["slotAbove", 1]]], 8], "$spellMod"]
      }
    ]
  },
  "tests": ["spell.cure-wounds.expected-healing"]
}
```

### Rage: a resource, a status with modifiers, and an extension rule

```json
{
  "slug": "barbarian-rage",
  "kind": "feature",
  "fidelity": "exact",
  "core": true,
  "resources": [
    { "id": "rage", "max": "$table.rageCount", "recharge": { "short": 1, "long": "all" } }
  ],
  "statuses": {
    "raging": {
      "keepAlive": ["attackRoll", "forcedSave", "bonusAction"],
      "maxRounds": 100,
      "endsWhen": ["or", ["wearing", "heavy-armor"], ["has", "self", "incapacitated"]],
      "modifiers": [
        { "stat": "resistance", "types": ["bludgeoning", "piercing", "slashing"] },
        {
          "stat": "damageRoll",
          "add": "$table.rageDamageBonus",
          "when": ["and", ["eq", "$attack.ability", "str"], ["tag", "attack", "strength-based"]]
        },
        { "stat": "check.str", "advantage": true },
        { "stat": "save.str", "advantage": true },
        { "stat": "cannot", "what": ["concentrate", "castSpells"] }
      ]
    }
  },
  "ability": {
    "action": "bonus",
    "cost": { "resource": "rage", "amount": 1 },
    "requires": ["not", ["wearing", "heavy-armor"]],
    "target": { "kind": "self" },
    "effects": [
      { "op": "applyStatus", "status": "raging", "duration": { "until": "endOfNextTurn" } }
    ]
  },
  "tests": ["feature.rage.damage-bonus", "feature.rage.extension", "feature.rage.resistance"]
}
```

### Sneak Attack: a once-per-turn rider with a compound condition

```json
{
  "slug": "rogue-sneak-attack",
  "kind": "feature",
  "fidelity": "exact",
  "core": true,
  "passive": {
    "triggers": [
      {
        "on": "damageRollOnHit",
        "oncePer": "turn",
        "when": [
          "and",
          ["tag", "attack", "finesse-or-ranged"],
          [
            "or",
            ["rollHas", "advantage"],
            [
              "and",
              ["allyWithin", "target", 5, { "incapacitated": false }],
              ["not", ["rollHas", "disadvantage"]]
            ]
          ]
        ],
        "do": [{ "op": "damage", "type": "sameAsTriggering", "amount": "$table.sneakAttack" }]
      }
    ]
  },
  "tests": ["feature.sneak-attack.once-per-turn", "feature.sneak-attack.ally-adjacent"]
}
```

### Ring of Protection: an item that only modifies stats

```json
{
  "slug": "ring-of-protection",
  "kind": "item",
  "fidelity": "exact",
  "attunement": true,
  "passive": {
    "modifiers": [
      { "stat": "ac", "add": 1 },
      { "stat": "save.any", "add": 1 }
    ]
  },
  "tests": ["item.ring-of-protection.ac-and-saves"]
}
```

### Owlbear and Pack Tactics: monsters add only what the database lacks

The owlbear's Rend attack (bonus +7, 2d8 + 5 slashing) auto-compiles from the structured rows. Only
the multiattack sequence is authored:

```json
{
  "slug": "owlbear",
  "kind": "monster",
  "fidelity": "exact",
  "multiattack": [{ "action": "Rend", "count": 2 }],
  "tests": ["monster.owlbear.attack-sequence"]
}
```

Shared traits live in one library and are referenced by name from any monster:

```json
{
  "slug": "pack-tactics",
  "kind": "trait",
  "fidelity": "exact",
  "passive": {
    "modifiers": [
      {
        "stat": "attackRoll",
        "advantage": true,
        "when": ["allyWithin", "target", 5, { "incapacitated": false }]
      }
    ]
  },
  "tests": ["trait.pack-tactics.advantage"]
}
```

## 15. Authoring plan

The order follows the engine capability that unlocks the most entries, so the engine is built in the
same order as the content.

| Step | Engine capability                                        | Unlocks                                                                                       |
| ---- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1    | Attacks, saves, damage, conditions, resources, modifiers | Martial features (Phase 3), 132 core spells, auto-compiled monsters (about 160 at CR 0 to 10) |
| 2    | Triggers and reaction windows                            | Riders (Sneak Attack, smites), Shield, Uncanny Dodge, Cutting Words, 4 reaction spells        |
| 3    | Zones                                                    | 40 spells, Paladin and other auras                                                            |
| 4    | Summons                                                  | 18 spells, steeds and companions                                                              |
| 5    | Movement, forced movement, flight                        | 11 spells, weapon mastery push and topple, opportunity attacks                                |
| 6    | Transformation                                           | 6 spells, Wild Shape                                                                          |
| 7    | Behaviour control in the AI                              | 15 charm, fear and compulsion spells                                                          |
| 8    | Magic-effect registry (Dispel)                           | 4 negation spells                                                                             |

Workload by phase from the plan:

- **Phase 3 (walking skeleton):** about 40 entries. Fighter, Barbarian and Rogue features up to level
  3, the 4 fighting styles, weapon masteries, and the goblin and bandit stat blocks.
- **Phase 4 (casters at levels 3 and 5):** the 84 core spells up to 3rd level, then subsystems as the
  AI needs them. 56 features at levels 1 to 5.
- **Phase 7 (levels 11 and 17):** the remaining spells and 67 more features, plus hand-authored monster
  effects and legendary actions.

## 16. Open decisions

1. **JSON versus TypeScript for content.** I recommend JSON with a schema: it is validated, diffable,
   hashable and countable. TypeScript would be easier to write but allows arbitrary code, which defeats
   the coverage report.
2. **Handler budget.** I suggest 25, as in section 13.
3. **Charm and fear (15 spells).** The Controller role depends on them, but they need the AI to model
   forced behaviour. I suggest an approximation first: a charmed or frightened creature simply cannot
   attack the caster, which understates their power (bias `under`).
4. **Scope of items.** Only the 258 SRD items get effects. The roughly 1,400 other rows in the D1 `Item`
   table would be modelled as gold value only in loot-allocation runs. This needs a decision before
   Phase 8.
5. **Seed fixes.** The quirks in section 1 are best fixed in the seed generator, not worked around.
   Metamagic and Eldritch Invocations need seeding into `FeatureOption` before their effects can be
   written.

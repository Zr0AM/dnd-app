# Genome and legality spec

Status: **draft for review. Spec only; no code.**

Part of the [simulator plan](./plan.md), Phase 1. This defines the search space the genetic algorithm
explores: what a build is, how it is encoded, which builds are legal, and how the GA mutates and
crosses builds without producing illegal ones.

It depends on the [effect format spec](./effect-format.md): every decision point in the genome
(species ancestry, fighting style, Metamagic, prepared spells) is declared by a `choices` block in the
effect layer, so the two specs stay in sync from one source.

All numbers below come from the seed data in `docs/db/seed/` and the SRD 5.2.1 text, confirmed by
query, not from memory.

## 1. What a build is

A build is a **level path**, not a single snapshot. It is the sequence of decisions a player makes
from level 1 to the target level, because a 2024 character is defined by the order of its class levels
and the choices made at each one.

A **campaign build** carries the whole path to level 17 and is scored at the checkpoints 3, 5, 11 and 17. A **one-shot build** is the same structure truncated at one checkpoint. A level-3 build is a strict
prefix of the level-5 build, which is a prefix of the level-11 build. This prefix property is what lets
the GA evolve a single genome and score it at every checkpoint (see section 7).

The genome has two parts:

- **Build-time genes**: fixed for the whole run (species, ability scores, background, and the per-level
  decisions).
- **Operational genes**: re-decided each long rest or in combat (prepared spells, Metamagic applied to
  a cast). These are set by the genome where the rules fix them at build time, and by the shared AI
  where the rules allow a daily choice. The split follows the effect layer's `choices.when` field
  (`build`, `longRest`, `combat`).

## 2. The genome

```jsonc
{
  "schema": 1,
  "targetLevel": 11,
  "species": { "slug": "human", "choices": { "...": "..." } },
  "background": "soldier",
  "abilities": { "method": "point-buy", "base": { "str": 15, "dex": 14, ... } },
  "levels": [
    { "class": "fighter", "subclassAt": null, "choices": {} },
    { "class": "fighter", "choices": { "fighting-style": "defense" } },
    { "class": "fighter", "subclass": "champion", "choices": {} },
    { "class": "fighter", "asi": { "kind": "feat", "feat": "ability-score-improvement", "plus": { "str": 2 } } }
    // ... one entry per character level up to targetLevel
  ],
  "loadout": { "armor": "chain-mail", "mainHand": "greatsword", "offHand": null, "ranged": "longbow", "items": [] },
  "prepared": { "fighter": [], "default": [] }
}
```

- **`levels[i]`** is the decision made when taking character level `i+1`. It names the class that level
  goes to, and carries only the choices unlocked at that class level: the subclass (at the class's
  subclass level), an ASI or feat (at the class's ASI levels), a fighting style, weapon masteries,
  Metamagic, invocations, expertise skills, and so on. Which keys are required at a given level is
  computed from the effect layer, not hardcoded here.
- **`abilities.base`** are the pre-racial scores. 2024 ability bonuses come from the background, not the
  species, so the background's three abilities and the +2/+1 (or +1/+1/+1) split are applied on top.
- **`loadout`** references equipment and magic-item slugs. Magic items are a scenario input at levels 11
  and 17 (see the plan); the genome's `items` is empty until Phase 8.
- **`prepared`** holds spell choices per spellcasting class. It is build-time only for classes that
  "know" spells and a long-rest default for classes that "prepare" them; the GA seeds it and the AI may
  re-pick it per long rest within the legal set.

## 3. The decision catalog (what the seeds say)

### Classes (12)

| Class     | Hit die | Primary ability | Subclass at | ASI/feat levels     | Caster | Skills |
| --------- | ------- | --------------- | ----------- | ------------------- | ------ | ------ |
| Barbarian | d12     | STR             | 3           | 4, 8, 12, 16        | none   | 2      |
| Bard      | d8      | CHA             | 3           | 4, 8, 12, 16        | full   | 3      |
| Cleric    | d8      | WIS             | 3           | 4, 8, 12, 16        | full   | 2      |
| Druid     | d8      | WIS             | 3           | 4, 8, 12, 16        | full   | 2      |
| Fighter   | d10     | STR or DEX      | 3           | 4, 6, 8, 12, 14, 16 | none   | 2      |
| Monk      | d8      | DEX and WIS     | 3           | 4, 8, 12, 16        | none   | 2      |
| Paladin   | d10     | STR and CHA     | 3           | 4, 8, 12, 16        | half   | 2      |
| Ranger    | d10     | DEX and WIS     | 3           | 4, 8, 12, 16        | half   | 3      |
| Rogue     | d8      | DEX             | 3           | 4, 8, 10, 12, 16    | none   | 4      |
| Sorcerer  | d6      | CHA             | 3           | 4, 8, 12, 16        | full   | 2      |
| Warlock   | d8      | CHA             | 3           | 4, 8, 12, 16        | pact   | 2      |
| Wizard    | d6      | INT             | 3           | 4, 8, 12, 16        | full   | 2      |

The ASI levels differ by class (Fighter and Rogue get extra ones). They are read from where the class's
`Ability Score Improvement` feature appears in `ClassFeature`, so the genome never hardcodes them.

### Subclasses (1 each, SRD)

Berserker, College of Lore, Life Domain, Circle of the Land, Champion, Warrior of the Open Hand, Oath
of Devotion, Hunter, Thief, Draconic Sorcery, Fiend Patron, Evoker. The hero either takes its one
subclass or, for a short dip below level 3, none.

### Species (9) and their choices

Dragonborn, Dwarf, Elf, Gnome, Goliath, Halfling, Human, Orc, Tiefling. Four have a lineage or
ancestry choice, from `SpeciesOption`:

- Dragonborn: Draconic Ancestor (10 options, sets breath-weapon damage type)
- Elf: Elven Lineage (Drow, High Elf, Wood Elf)
- Gnome: Gnomish Lineage (Forest, Rock)
- Goliath: Giant Ancestry (6 options)
- Tiefling: Fiendish Legacy (Abyssal, Chthonic, Infernal)

### Backgrounds (4) — ability bonuses and the origin feat

| Background | Abilities (+2/+1 among) | Skills                   | Origin feat     |
| ---------- | ----------------------- | ------------------------ | --------------- |
| Acolyte    | INT, WIS, CHA           | Insight, Religion        | Magic Initiate  |
| Criminal   | DEX, CON, INT           | Sleight of Hand, Stealth | Alert           |
| Sage       | CON, INT, WIS           | Arcana, History          | Magic Initiate  |
| Soldier    | STR, DEX, CON           | Athletics, Intimidation  | Savage Attacker |

Only these four exist in the SRD, and each grants a fixed origin feat. So the background gene couples
three things — ability bonuses, skills and a feat — and the legal ability bonus is constrained to the
background's three abilities.

### Feats (17, of which ~8 matter before level 19)

- Origin (from background, not chosen freely): Alert, Magic Initiate (repeatable), Savage Attacker, Skilled (repeatable).
- General (at ASI levels): Ability Score Improvement (repeatable), Grappler (needs STR or DEX 13+, level 4+).
- Fighting styles (class-granted, or the ASI-feat if a class allows): Archery, Defense, Great Weapon Fighting, Two Weapon Fighting.
- Epic Boons (7): all level 19+, outside every checkpoint. Excluded.

At an ASI level the choice is: ASI (+2 one / +1 two, cap 20) or a general feat for which the build
qualifies. The feat space is small, so the ability-score and multiclass axes dominate the search.

### Ability scores

Three SRD methods exist. The genome uses **point-buy** as the canonical method (standard array is a
subset, and random generation is not reproducible). Point-buy: scores 8 to 15 before racial bonuses, 27
points, costs 8:0, 9:1, 10:2, 11:3, 12:4, 13:5, 14:7, 15:9.

- Ordered arrays costing ≤ 27: **191,587**. Spending exactly 27: **12,282**.
- As a **multiset** of six values (the assignment to abilities is a separate gene), far fewer. The GA
  treats the six base values and their assignment as separate genes so crossover is meaningful.

### Equipment

Armor (13 rows): light Padded/Leather/Studded/Hide, medium Chain Shirt/Scale/Breastplate/Half-Plate,
heavy Ring/Chain/Splint/Plate, plus Shield. Weapons (38): simple/martial × melee/ranged. The loadout is
constrained by the build's armor and weapon proficiencies (section 5).

## 4. Spell selection

Prepared/known counts at the checkpoints, and the legal pool after fidelity gating (spells the engine
can run — excluding the 102 non-combat and 7 meta spells from the effect spec):

| Class    | L3 prep/pool | L5     | L11      | L17      |
| -------- | ------------ | ------ | -------- | -------- |
| Wizard   | 6 / 44       | 9 / 64 | 16 / 106 | 19 / 131 |
| Cleric   | 6 / 21       | 9 / 32 | 16 / 51  | 19 / 65  |
| Bard     | 6 / 30       | 9 / 39 | 16 / 57  | 19 / 74  |
| Druid    | 6 / 26       | 9 / 34 | 16 / 65  | 19 / 79  |
| Sorcerer | 6 / 39       | 9 / 54 | 16 / 85  | 19 / 99  |
| Warlock  | 4 / 16       | 6 / 25 | 11 / 30  | 14 / 30  |
| Paladin  | 4 / 9        | 6 / 17 | 10 / 21  | 14 / 28  |
| Ranger   | 4 / 9        | 6 / 18 | 10 / 24  | 14 / 30  |

"Prepared" is the `preparedSpells` column; cleric/druid/paladin can prepare from the whole class list,
wizard from the spellbook, bard/ranger/sorcerer/warlock know a fixed set. The legal pool is further
restricted to spells of a level the build has slots for. Cantrips are a separate smaller choice.

The combinatorics are large: even gated, a level-17 wizard chooses 19 of 131 spells (~10^24 orderless).
So spell selection is the dominant axis and needs smart operators, not enumeration (section 8).

## 5. Legality rules

A build is legal iff every rule holds at **every** level along the path (not just the final level),
because the path is played out level by level.

### L1. Level path

- `levels` has exactly `targetLevel` entries.
- Each entry's `class` is one of the 12.
- Character level 1 uses the full level-1 hit points and full starting proficiencies of the first class.

### L2. Multiclass prerequisite

- To take a level in class X when the build already has levels in other classes (or to start a second
  class), the build must have **13+ in the primary ability of every class it has, including X**.
  Barbarian/Paladin need STR 13, Monk STR... (Monk's primary is DEX and WIS, so DEX 13 and WIS 13), etc.
- A class's primary ability is read from `ClassPrimaryAbility`. Classes with two primary abilities
  (Monk, Paladin, Ranger, Fighter "STR or DEX") are handled per the SRD: Fighter needs STR **or** DEX
  13; Monk/Paladin/Ranger need **both** listed abilities at 13. This is encoded as an any/all flag per
  class (Fighter and the one-of casters use `any`; the rest use `all`).
- Prerequisite is checked against the scores **including** background bonuses but **before** any ASI,
  then re-checked after each ASI (an ASI can only raise scores, so a legal start stays legal).

### L3. Subclass

- A subclass may be chosen only at the class's subclass level (3 for all SRD classes) or later, and only
  the one SRD subclass for that class. A build with fewer than 3 levels in a class has no subclass for it.

### L4. ASI / feat

- An ASI or feat entry may appear only at one of that class's ASI levels, counted within that class
  (a Fighter's 4th Fighter level, not the 4th character level).
- ASI raises at most two scores, by +2/+0 or +1/+1, never above 20.
- A general feat requires its prerequisite (Grappler: STR or DEX ≥ 13, level 4+).
- Origin feats are granted by the background and never spent at an ASI level.

### L5. Spells

- A prepared/known list may contain only spells on that class's list, of a spell level the build can
  cast at that point, and no more than the `preparedSpells`/known count for that class level.
- Cantrip count obeys `cantripsKnown`.
- Multiclass spell slots use the **Multiclass Spellcaster** table (full casters count full levels,
  half casters count half rounded up, Pact Magic is separate). **This table is not in the seeds** and
  must be provided as a constant from the SRD (reproduced in the plan's data notes). Prepared-spell
  level limits still come from each class's own level.

### L6. Proficiency and loadout

- Armor: the build may wear armor only in a category it is trained in. Training comes from class
  proficiencies, and on multiclass only the reduced set in each class's "As a Multiclass Character"
  entry is granted (e.g. a Fighter dip grants martial weapons and light/medium armor and shields, not
  heavy).
- Weapons: proficiency with a weapon used, else no proficiency bonus (not illegal, just suboptimal, so
  the validator warns rather than rejects).
- Heavy armor with insufficient Strength imposes the SRD speed penalty (handled by the engine; the
  validator only flags it).
- Two-weapon fighting requires two Light weapons unless a feature says otherwise.

### L7. Uniqueness and caps

- A non-repeatable feat appears at most once. Repeatable feats (ASI, Magic Initiate, Skilled) may repeat.
- A species lineage/ancestry choice is made exactly once and must be from that species' option group.
- Ability scores after all bonuses never exceed 20 before level 20 (Primal Champion and similar are the
  only exceptions and are modeled by their feature, not the genome).

### Validation outcomes

- **Reject**: L1–L5, L7 violations. The build cannot be played.
- **Warn**: L6 soft issues (no weapon proficiency, stealth disadvantage). Legal but flagged in reports.

## 6. Search-space size

Rough magnitudes, to justify the GA over enumeration. Class **sequences** alone (≤ 3 distinct classes,
order significant):

| Target level | Class sequences (≤ 3 classes) |
| ------------ | ----------------------------- |
| 3            | ~1.7 × 10^3                   |
| 5            | ~3.5 × 10^4                   |
| 11           | ~3.8 × 10^7                   |
| 17           | ~2.8 × 10^10                  |

Multiply by ability arrays (~10^4), species × ancestry (~30), background (4), feats and ASIs per path,
and spell selections (up to ~10^24 for a high-level full caster), and the level-17 space is far past
enumeration. Even level 3 (sequences × arrays × spells) is too large for a full sweep once spells are
in. This is why the plan chose a GA.

Practical bounds for v1, configurable:

- Max distinct classes per build: **3** (covers essentially all real multiclass builds; 2 is a cheaper default).
- Multiclass can be disabled entirely for a single-class baseline pass.

## 7. GA encoding and the prefix property

The genome is a **variable-length** structure (one `levels` entry per character level). To make
crossover and the campaign prefix property work:

- The **chromosome** is `[species, ancestry, background, abilityValues(6), abilityAssignment(6), level₁, level₂, …, level₁₇]` plus the spell and loadout genes.
- A **campaign** individual always carries all 17 `levels`. Scoring at a checkpoint reads only the
  prefix (`levels[0..k-1]`) and the resources/spells legal at that level. One individual therefore
  yields four fitness vectors (L3, L5, L11, L17), which NSGA-II aggregates per the plan.
- A **one-shot** individual carries exactly `targetLevel` levels and is scored once.

This means a campaign run optimizes the whole path under the constraint that early checkpoints are also
good — a genuinely different problem from optimizing each level independently, and the one the user
asked for ("good for a one-shot vs. good for a multi-year campaign").

## 8. Genetic operators

All operators produce legal offspring, or the result is passed through a **repair** step (section 9)
before evaluation. Operators:

- **Level-point crossover**: pick a character level `c`; child takes parent A's path up to `c` and parent
  B's from `c+1`. Because legality is prefix-checked, the splice is validated and repaired from `c+1`.
- **Ability crossover**: swap the six base values or the assignment between parents independently.
- **Spell crossover**: uniform crossover over the chosen-spell sets per class, then trim/fill to the
  legal count.
- **Mutations**: change one level's class; add/remove a multiclass dip; re-pick a subclass-adjacent
  choice (fighting style, Metamagic, invocation, expertise); swap one ability point; re-pick species
  ancestry; swap one prepared spell; change a loadout slot.
- **Macro-mutations** (low rate): reorder two class levels; convert a dip into a deeper investment.

Mutation rates are configurable and biased toward the high-impact axes (class sequence, ability
assignment, spell selection) found in section 6.

## 9. Repair and seeding

- **Repair** walks the path from level 1, and at the first illegal decision either (a) drops a choice
  that is now unavailable, (b) raises an ability to meet a multiclass prerequisite if cheap, or (c)
  truncates/reassigns the offending level to the nearest legal class. Repair is deterministic given the
  genome and logged, so results stay reproducible.
- **Seeding** the initial population: include the plan's reference-party fillers, all 12 single-class
  builds, and a spread of known-strong multiclass patterns, then fill the rest randomly-but-legal. Good
  seeds speed convergence and give the GA a sensible baseline to beat.

## 10. Determinism and identity

- A build has a **canonical form** (sorted spell lists, normalized choice keys) and a **content hash**
  over that form plus the engine version and the compiled effect-bundle hash. Results are keyed by this
  hash (plan section on D1), so re-running an unchanged build reuses results and a rules change
  invalidates them.
- The genome has no free text and no RNG inside it; all randomness is in the GA and the simulator, both
  seeded.

## 11. Open decisions

1. **Max distinct classes.** I propose 3, configurable, with a 2-class default for early phases and a
   single-class mode for baselines. Confirm 3 is enough.
2. **Ability method.** I propose point-buy as canonical (standard array as a constrained subset). An
   alternative is to allow standard array only, which shrinks the space ~15×. Which do you want as the
   default?
3. **Spell selection granularity.** Treating prepared spells as genes is expensive. Option: let the GA
   fix only a small "signature" set per build and let the shared AI fill the rest greedily from the legal
   pool each long rest. This cuts the genome's spell dimensionality sharply. I lean toward this.
4. **Where the multiclass spell-slot table lives.** It is not seeded. I propose a constant in `sim/`
   with a test that it matches the SRD text, rather than adding it to the database now.
5. **Repair vs. penalty.** I propose repair (always evaluate legal builds). The alternative is a fitness
   penalty for illegality, which wastes evaluations. Confirm repair.

# sim — build optimization simulator

A pure-TypeScript package that simulates D&D 2024 combat to find optimal character
builds by role, via Monte Carlo simulation and a genetic algorithm. It has no
Angular dependency and lives outside `src/`, so the app build never pulls it in.

Design is specified under [`docs/sim/`](../docs/sim): the
[plan](../docs/sim/plan.md), the [effect format](../docs/sim/effect-format.md),
the [genome and legality](../docs/sim/genome.md) rules, the
[metrics and normalization](../docs/sim/metrics.md), and the
[scenario and map format](../docs/sim/scenarios.md).

## Running

```bash
npm run test:sim         # run the suite once
npm run test:sim:watch   # watch mode
npm run typecheck:sim    # type-check the package
```

## Layout (Phase 2: engine skeleton, in progress)

| Path          | Holds                                                                                                                                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/rng/`    | Splittable, label-addressed RNG. The keystone for common random numbers: streams are addressed by label, not draw order, so two builds in one scenario face identical enemy/environment rolls.                                                                         |
| `src/dice/`   | Dice rolling on the RNG, with closed-form expected values used to validate simulated means.                                                                                                                                                                            |
| `src/core/`   | Combat vocabulary mirroring the seeds (abilities, 13 damage types, 15 conditions, sizes) and the ability-modifier / proficiency-bonus rules.                                                                                                                           |
| `src/grid/`   | The battlefield grid: 2024 simple-grid distance (diagonals count as 5 ft), reach/range, and a terrain grid (walls, difficult terrain).                                                                                                                                 |
| `src/combat/` | The combatant model (HP, temp HP, conditions, death saves) and resolution: attack rolls (nat 1/20, crits, widened crit range), saving throws, and damage mitigation (resistance/vulnerability/immunity). Each resolver ships a closed-form probability for validation. |

`src/combat/` also holds:

- **conditions** — the 15 SRD conditions as mechanical queries (attack advantage
  with the no-stacking netting rule, auto-fail saves, auto-crit targets, speed
  locks, incapacitation, exhaustion), drawn from the Rules Glossary.
- **encounter** — the initiative order and turn loop: rounds and turns, per-turn
  resources (action / bonus / movement), movement with difficult terrain and
  Opportunity Attacks, weapon attacks wired to condition-derived advantage, death
  saves at the start of a dying creature's turn, and win detection. What a
  creature does on its turn is an injected policy, so the loop runs without the
  full AI (which arrives in a later phase). Fights are deterministic under a seed:
  two runs produce identical event logs.

`src/content/` holds the content compiler:

- **monster** — a pure translator from seed-database rows to an engine
  `MonsterTemplate` (AC, HP, abilities, saves, damage defenses, speed, and attack
  actions with multi-type damage), and `spawnMonster` to place one. Traits,
  recharge effects and multiattack counts are hand-authored overrides, not parsed
  from text.
- **load-db** — the Node-only loader that builds the seed database in memory
  (exactly as `npm run srd:check` does) and reads monster rows for the compiler.
- **ids** — stable seed-ID → engine-code maps (abilities, damage types, conditions).

- **character** — compiles a single-class martial build (Fighter, Barbarian,
  Rogue) into a Combatant: Hit Points (fixed-value rule), Armor Class (armor,
  Unarmored Defense, shield, Defense style), saving throws, and one weapon attack
  (Str/Dex/finesse ability, proficiency, Archery, versatile two-handing, Champion
  crit range). Conditional/triggered features (Rage, Sneak Attack, Extra Attack)
  belong to the effect layer and layer on top.

Two tests exercise real data end to end: one compiles all 341 SRD monsters from
the committed seeds (321, 94%, produce a usable attack; the rest are swarms,
non-combatants, or save-only attackers awaiting the effect layer); the other is
the **walking skeleton** — a level-3 Champion fighter compiled from the database
fights three Goblin Warriors spawned from the database, resolving deterministically
(identical replay logs across runs). This is the full pipeline: seeds → compilers
→ combatants → combat.

## Feature runtime

`src/combat/feature.ts` defines the `Feature` hooks a class feature, feat, or item
uses to influence combat — start of turn, outgoing-attack modifiers, on-hit damage
riders, granting attackers advantage, and dynamic damage resistance. This is the
interface the declarative effect format compiles to. The combatant carries
features, resource pools (with short/long-rest recharge), and an extra-attack
count; attack resolution consults all of them.

`src/content/martial-features.ts` implements the first features against it:

- **Rage** — resistance to B/P/S and a melee damage bonus while raging; spends a
  Rage use (auto-activates on the owner's first turn for now; the AI will decide
  later).
- **Reckless Attack** — advantage on the owner's melee attacks, and advantage to
  attackers until its next turn.
- **Sneak Attack** — once per turn, extra d6s on a finesse/ranged hit made with
  advantage or next to an ally (and not at disadvantage). Exact.
- **Extra Attack** — a combatant field the turn loop honors (one Attack action =
  1 + extraAttacks attacks).

The character compiler attaches these from the class progression (rage uses/damage,
sneak dice, extra attacks), loaded from the seeds. The walking-skeleton test now
also compiles a Barbarian from the seeds and confirms Rage activates and resists in
a real fight.

Still to come: the shared tactical AI, then the GA to close the Phase 3 loop
(optimize a level-3 martial for a role against the seeded encounters); after that,
casters and the spell effect layer.

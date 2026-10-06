# Build optimization simulator plan

Status: **planning only. No code has been written.**

Goal: use Monte Carlo simulation and a genetic algorithm to find the best character builds for a
given role, at several levels and time horizons, and later the best allocation of magic items.

The rules data is the 2024 SRD (5.2.1), loaded by the schema in
[`../db/schema-plan.md`](../db/schema-plan.md). The SRD text and the 258 magic items are also
available as the "SRD 5.2.1 Reference" artifact (`srd.txt`, `srd_magic_items.json`).

## Decisions

| #   | Decision                                                                                           |
| --- | -------------------------------------------------------------------------------------------------- |
| 1   | Offline research. Results are written to D1; the app only displays them.                           |
| 2   | Full tactical model: grid, movement, reactions, opportunity attacks, cover, concentration.         |
| 3   | 2024 SRD content only. One subclass per class.                                                     |
| 4   | Checkpoint levels are 3, 5, 11 and 17.                                                             |
| 5   | Opponents and reference parties are statically seeded scenarios.                                   |
| 6   | Objective is multivariable. NSGA-II returns a Pareto front; an equal-weight score is configurable. |
| 7   | Genetic algorithm (NSGA-II) for the optimizer.                                                     |
| 8   | One shared AI for every build under test. No per-build tuning.                                     |
| 9   | Common random numbers: every candidate faces the same dice streams.                                |
| 10  | v1 roles are Sustained DPS, Burst, Tank, Healer, Controller and Buffer, as configurable presets.   |
| 11  | Code lives in a top-level `sim/` TypeScript package, outside the Angular `src/` tree.              |
| 12  | Party composition search is deferred. Reference parties are fixed (see below).                     |

## What the data gives us

| Input                                                                             | State                                                                   | Consequence                                                                         |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Monsters (341)                                                                    | Structured: AC, HP, saves, defenses, actions, per-attack damage, spells | Usable almost as-is                                                                 |
| Class progression                                                                 | Structured: `ClassLevelValue`, `ClassSpellSlot`                         | Usable as-is                                                                        |
| Spells (339), class features (232), feats (17), species traits, magic items (258) | Rules text only                                                         | We write the machine-readable effects ourselves. This is the largest work item.     |
| Monster initiative, Metamagic, Invocations, `EncounterXpBudget`, `ItemSpell`      | Empty in the seeds                                                      | Fill from the SRD text                                                              |
| Schema                                                                            | Migration `0003` is on `main` of `dnd-db-rest`                          | The sim reads local SQLite built from `docs/db/seed/*.sql` and writes results to D1 |

## Architecture

A pure TypeScript package, `sim/`, tested with vitest. The engine does no I/O.

1. **Content compiler** turns DB rows plus a hand-authored effect layer into typed combat data.
2. **Rules engine** handles a grid, initiative, the action, bonus action, reaction and movement
   economy, opportunity attacks, cover, advantage, conditions, concentration, AoE templates, death
   saves and rests. Features hook into attack and damage events.
3. **Policy/AI** is a utility-based action chooser shared by every build, with role-specific weights.
4. **Scenario harness** holds seeded encounters, maps, adventuring days and the reference parties.
5. **Build space** is the genome, a legality validator and a repair step.
6. **Optimizer** is NSGA-II.
7. **Results store and reports** write aggregates to D1.

Design rules:

- **Fixed AI across builds.** With a full tactical model, a bad AI makes a good build look bad. One
  shared AI keeps comparisons fair. Policy parameters can be evolved later.
- **Common random numbers.** Seeds are `hash(scenario, runIdx)`, so paired comparisons need far fewer
  runs. This needs stream splitting added to `mulberry32` in `src/app/core/random/random.ts`.
- **Coverage tiers.** Every feature is tagged _exact_, _approximated_ or _unsupported_. Unsupported
  features are removed from the genome, never scored as zero. A GA exploits every modelling gap, so a
  coverage report is a required output.

## Metrics, roles and horizons

**Metrics** per run: win rate, rounds to victory, damage dealt, damage taken, allies downed, healing
done, enemy actions denied, resources left at the end.

- **Normalization.** Each metric is normalized against a reference build in the same scenario, so
  equal weights mean something across different units.
- **Pareto front.** NSGA-II returns the front. The equal-weight score is a configurable summary
  applied to it (weights in a config file), so reweighting needs no re-run.
- **Roles** are weight presets over the same metrics. Archetypes beyond the six v1 roles (Skirmisher,
  Striker and others) emerge by clustering the results.

**Horizons** are a time horizon, not a different build:

- _One-shot_: one adventuring day at a single level, scored for peak power.
- _Campaign_: a build is a level path from 1 to 17 (multiclass splits, feats and spell picks at each
  level), scored at checkpoints 3, 5, 11 and 17. A level-3 build is a prefix of the level-17 build.
  Campaign viability is the aggregate across checkpoints, including how steeply power rises.

**Genome:** class and multiclass split, subclass, species, background, ability scores, feats and
fighting style, prepared spells, gear, and later items.

**Items** are two problems:

- _Build item choice_: which items a build should carry.
- _Loot allocation_: assign a seeded hoard from the existing treasure generator (`hoard.ts`) across
  the party, with the attunement limit of 3. Output includes item value ranked by marginal win-rate
  change.

## Scenarios

- **Opponents:** static scenario records `(encounter, map, start positions, tactics profile, seed)`
  indexed by CR band and party level. A small set of maps covers open ground, a corridor and
  chokepoints, cover, difficult terrain and elevation.
- **Encounter budget** scales with party size through `EncounterXpBudget`, filled from the SRD text.
- **Adventuring days** run 1 to 8 encounters with short and long rests, depending on the horizon.

### Reference parties

A fixed party biases results. A Healer looks great in a party with no healer. So the hero (the build
under test) never joins a party: it **replaces the filler who holds its target role**. If a template
has no filler for that role, the hero replaces the template's designated **flex** filler.

| Template            | Size | Tank               | Sustained DPS   | Burst                   | Healer        | Controller                 | Buffer                 |
| ------------------- | ---- | ------------------ | --------------- | ----------------------- | ------------- | -------------------------- | ---------------------- |
| **R6 Full roster**  | 6    | Fighter (Champion) | Ranger (Hunter) | Rogue (Thief)           | Cleric (Life) | Druid (Circle of the Land) | Bard (College of Lore) |
| **R4 Classic four** | 4    | Fighter (Champion) | none            | Rogue (Thief), **flex** | Cleric (Life) | Wizard (Evoker)            | none                   |
| **R3 Small**        | 3    | Fighter (Champion) | none            | none                    | Cleric (Life) | Wizard (Evoker), **flex**  | none                   |
| **Solo**            | 1    | the hero alone     |                 |                         |               |                            |                        |

- Each template exists at levels 3, 5, 11 and 17.
- R6, R4 and R3 are scored, weighted 2:2:1 by default (configurable). Solo is a diagnostic only and
  never affects rankings.
- Every result is reported per template as well as aggregated. A build whose rank flips between
  templates is flagged as composition-dependent.

Fillers are fixed benchmark builds, not GA output, so they are reproducible and avoid circularity:

- Species: Human for all fillers.
- Background: the best fit of the four SRD options (Acolyte, Criminal, Sage, Soldier), fixed in the seed.
- Ability scores: standard array, assigned by the class's primary abilities.
- Level-ups: the SRD subclass at its first level, ASIs to the primary ability until 20, then
  Constitution. No optional feats.
- Spells: a fixed ordered staple list per caster, authored once and reviewed.
- Gear: a standard kit. Magic items are a scenario setting: none at levels 3 and 5, a "standard"
  profile at 11 and 17 (exact profile set in the specs phase).
- Behavior: the shared AI with the weight preset for the filler's role.

That is 7 filler classes (Fighter, Ranger, Rogue, Cleric, Druid, Bard, Wizard) at 4 levels, or 28
benchmark builds. Fillers stay frozen once locked.

Known limits: Champion is a weak subclass, so absolute win rates are not a balance claim. The SRD has
one subclass per class, so the hero's subclass choice is that one or none.

## Compute and results

- Node `worker_threads` for parallelism. Low-sample first-pass racing in the GA, with more runs only
  for elites. Sequential stopping once the confidence interval is tight. Benchmark the engine before
  fixing population sizes.
- **D1 stores aggregates only**: configs, builds, per-metric mean and confidence interval, GA history,
  top-K builds and a few replay logs. Raw per-run output stays local as JSONL.
- Results are keyed by engine version and content hash, so a rules change invalidates stale rows.
- The D1 tables go in a new `dnd-db-rest` migration, which is a separate repo.

## Phases

1. **Specs**: metrics and normalization, genome and legality rules, scenario and map format, effect
   format and coverage tiers. All four drafted: [effect format](./effect-format.md),
   [genome and legality](./genome.md), [metrics and normalization](./metrics.md),
   [scenario and map format](./scenarios.md).
2. **Engine skeleton** — _done._ dice, seeded streams, grid, attacks, saves and damage, conditions,
   combat loop. Code in `sim/`.
3. **Walking skeleton** — _done._ level-3 Fighter, Barbarian and Rogue (compiled from the seeds) vs.
   goblins, with martial features (Rage, Sneak Attack, Extra Attack), the shared tactical AI, and a
   minimal GA.
4. **Casters and effects** — _not started._ slots, concentration, AoE and control spells, healing and
   buffs, at levels 3 and 5. The gating item for breadth: casters, the control/support metric axes,
   the reference parties and the caster roles all depend on it.
5. **Full AI, metrics and scenario library**, with confidence intervals and common random numbers —
   _done for what martials exercise._ The scenario library (maps + XP-validated level-3 encounters),
   confidence intervals, the four live metric axes, reference-anchor normalization and the martial
   role presets are built. The control/support axes and the reference _parties_ (R6/R4/R3 with
   role-slot substitution) are deferred to Phase 4, since a solo martial has no control/support signal
   and no party.
6. **D1 results store and reports**, then the NSGA-II optimizer with the legality validator — _optimizer
   done, store deferred._ NSGA-II (non-dominated sort + crowding), the legality validator (genome
   repair), and the serializable run reports with client-side reweighting are built. The D1 migration
   and upload need push access to `dnd-db-rest` (see [ui-integration](./ui-integration.md)).
7. **Levels 11 and 17** — _not started._ legendary actions, lair actions (check how the SRD handles
   them), high-level spells, and campaign-path scoring.
8. **Item and loot allocation** — _not started._

## Validation

The GA will find bugs in the model, so:

- Rule unit tests against the SRD text.
- Closed-form checks, such as expected hit chance and damage per round.
- Invariants, such as damage never negative and slots never below zero.
- Manual review, with replay logs, of the top builds from every run.
- Smell tests against widely held conventions (full casters pulling ahead at high level, for example).

## Open items

- Exact magic item profile for the levels 11 and 17 reference parties.
- Metric list and normalization method, to be fixed in the Phase 1 spec.
- Engine performance budget, to be set after the Phase 2 benchmark.

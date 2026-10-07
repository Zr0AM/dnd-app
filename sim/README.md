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

## Tactical AI (`src/ai/`)

The shared, utility-based action chooser every build under test uses (plan
decision 8): score candidate targets (focus-fire the wounded, remove threats,
prefer closer, secure kills), move into range with the build's best weapon, and
attack with every attack the turn allows. Tuned by a weight vector so roles can
bias it; deterministic under a seed.

## Optimizer (`src/opt/`)

A minimal single-objective genetic algorithm that closes the Phase 3 loop:
optimize a level-3 martial build against a seeded goblin encounter.

- **genome** — a small martial genome (class, standard-array assignment, weapon,
  armor, shield, fighting style) with random/mutate/crossover and a repair step
  that keeps every genome legal (barbarians unarmored, no shield with two-handed,
  fighters always styled).
- **catalog** — resolves genome choices to engine data from the seeds.
- **evaluate** — runs a genome through the scenario under common random numbers
  (seeds depend on scenario + run index, not the genome, so builds are compared on
  identical dice) and reduces to a scalar fitness (win rate, then surviving HP).
- **ga** — elitism + tournament selection + crossover/mutation, with a
  per-genome evaluation cache. Deterministic under a seed.

Run end to end, the GA independently converges to a **raging two-handed Greatsword
Barbarian** as the best level-3 martial brawler vs. goblins (~95% win rate) — which
matches D&D convention, a passing smell test for the whole pipeline.

Phase 3 is complete: seeds → compilers → features → tactical AI → combat →
optimization, all deterministic and tested end to end.

### NSGA-II and reports (Phase 6)

- **evaluate** now also emits a multi-objective vector (all maximized): reliability
  (win rate), offense (damage dealt), survival (HP retained), efficiency (negative
  effective rounds — a loss counts the round cap, so "die fast" is not rewarded),
  and control (enemy actions denied via save-or-suffer conditions).
- **nsga2** — fast non-dominated sort and crowding distance (pure, tested on
  synthetic points) wrapped into a multi-objective optimizer returning the Pareto
  front. Deterministic under a seed.
- **reports** — the serializable run report the display-only UI will read: the
  Pareto front and a de-duplicated leaderboard, each build with its raw metrics,
  named objective vector, and a weighted scalar score. Weighting is a post-hoc
  summary with the objective bounds stored, so the UI reweights and re-ranks
  client-side (`rescore`) without re-simulating — the metrics-spec property.

Run end to end, NSGA-II returns a clean Pareto front of level-3 barbarians with a
real trade-off — Greataxe (more damage, less HP) vs. Greatsword (more HP, fewer
rounds). NSGA-II also caught a metric gap the scalar GA hid: raw-rounds efficiency
rewarded dying fast, so losers polluted the front; the effective-rounds fix (losses
count the cap) removed them. That is the "GA exploits modelling gaps" guard working.

### Scenario library, metrics and roles (Phase 5)

- **scenario/** — maps (open field, corridor chokepoint) and a curated set of
  seeded level-3 encounters (pair, single foe, swarm, mixed, chokepoint pack),
  XP-validated. Builds are evaluated across the whole library, so they can't
  overfit one encounter.
- **opt/stats.ts** — Wilson and normal-approximation confidence intervals; every
  evaluation reports 95% CIs for win rate, damage and HP retained.
- **opt/anchor.ts** — reference-anchor normalization (ratio to a frozen benchmark
  build, the metrics-spec method), so a score of 1.0 means "as good as the
  benchmark."
- **opt/roles.ts** — the roles as weight presets; a report re-ranks for a role
  (`rescore`) without re-simulating.

### Casters, parties, control and support (Phase 4)

- **spellcasting core** — slots, save DC, spell attack, and concentration, on the
  `Combatant`; the engine casts through a `castSpell` turn action.
- **damage and healing spells** — cantrips plus Burning Hands, Scorching Ray,
  Guiding Bolt, Fireball; Cure Wounds and Healing Word. The AI casts by expected
  value and triages healing to downed / low allies (preferring the bonus-action
  Healing Word).
- **control spells** — Hold Person (single-target paralysis) and Hypnotic Pattern
  (area incapacitation), built on a timed-condition subsystem: a failed save applies
  the condition for a duration, a repeat save each turn can shake it off, and
  breaking the caster's concentration ends it. A controlled creature's turn is
  denied, logged as `controlDenied` and attributed to the caster — the signal behind
  the **control** objective axis. The AI values control by threat-weighted expected
  denial, and the **Controller** role preset is live.
- **buff spells** — Bless (+1d4 to up to three allies' attacks and saves) and Haste
  (+2 AC and one extra weapon-attack action for one ally), on a parallel buff
  subsystem: the engine rolls the Bless die into the recipient's attack/save rolls,
  grants the Haste extra attack, and ends both when the caster's concentration
  breaks. Each realized benefit logs a `buffBoost` against the caster — the signal
  behind the **support** objective axis (healing + buff assists). The AI establishes
  a buff by value before attacking, and the **Healer** and **Buffer** role presets
  are live.
- **sustained-dps striker** — a Hunter Ranger archer (Longbow with the Archery
  style, Extra Attack at L5, and Colossus Slayer: once per turn, +1d8 to a hit on a
  wounded target). Steady weapon output with no resource spike — the sustained-DPS
  profile, distinct from the Rogue's front-loaded burst. (Hunter's Mark, its other
  sustained-damage source, is left for a later slice.)
- **reference parties** — the R6, R4 and R3 templates with the full six-role frozen
  filler set (Tank/Fighter, Sustained-DPS/Ranger, Burst/Rogue, Healer/Cleric,
  Controller/Wizard, Buffer/Bard) and hero role-slot substitution, run against
  party-scaled encounters under common random numbers (`opt/party-evaluate.ts`,
  `scenario/party.ts`). Damage, healing, buff assists and control are attributed to
  the hero; `partyObjectivesOf` maps a party result to the same six-axis vector the
  solo evaluator emits, so a party-context run feeds NSGA-II and the role presets
  unchanged.

All six objective axes are now live: reliability, offense, survival, efficiency,
control and support. Control and support have no solo signal (a lone hero has no
allies to buff/heal, and denies little on its own), so the solo `evaluate` scores 0
on support; both carry real values only in the party harness.

End to end: the party harness distinguishes a Cleric healer (heals while the party
fights), a Wizard blaster (high AoE damage), a controller (real `controlDenied`
denial against the highest-threat enemy), and a Bard buffer (steady `buffBoost`
assists from Bless/Haste) — each topping its own role's weighting.

Deferred (needs push access to dnd-db-rest and the environment's network/credential
setup): the D1 results migration + the export/upload step, and the display-only
Angular UI that reads these reports (see docs/sim/ui-integration.md). Still to come:
levels 11/17 (Phase 7); then item/loot allocation (Phase 8).

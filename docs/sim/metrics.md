# Metrics and normalization spec

Status: **draft for review. Spec only; no code.**

Part of the [simulator plan](./plan.md), Phase 1. This defines what the simulator measures, how raw
measurements become comparable across scenarios, how they combine into the objective vector the
optimizer sees, how roles reweight them, and the statistics that make a result trustworthy.

It builds on the [plan](./plan.md) (NSGA-II, common random numbers, the six v1 roles, reference-party
substitution) and the [genome spec](./genome.md) (the build and its checkpoints). The objective
function drives everything downstream — the GA, the stopping rule, the reports — so it is specified
before the engine.

## 1. Principles

1. **Measure raw, decide later.** The engine emits a fixed set of raw, physical quantities per run.
   Roles, weights and archetypes are applied afterward, never baked into the engine. Reweighting must
   never require re-simulation (plan decision 6).
2. **Normalize before combining.** Raw metrics have incompatible units (damage in the hundreds, win
   rate in [0,1], rounds in single digits). "Equal weighting" is only meaningful on normalized values.
3. **Normalize against a fixed anchor, not the population.** Each metric is scaled against the
   reference-party fillers in the _same scenario_. The anchor does not move as the GA evolves, so a
   build's score means the same thing in generation 1 and generation 200.
4. **Few objective axes, many diagnostics.** The Pareto optimizer sees a small set of composite axes
   (section 5). The full raw catalog is retained for reports and for reweighting, but is not all fed to
   NSGA-II (section 8 explains why).
5. **Everything is configurable.** Weights, role presets, the objective axes, the stopping rule and the
   scenario mix live in a config file (section 9), versioned and hashed into the result key.

## 2. Raw metric catalog

Emitted per run (one run = one build playing one scenario with one seed). Each metric names its unit,
its direction (↑ better or ↓ better), and the event that produces it. "Day" means the full scenario,
which may be one encounter or a multi-encounter adventuring day.

### Outcome

| Metric          | Unit   | Dir | Definition                                                                |
| --------------- | ------ | --- | ------------------------------------------------------------------------- |
| `won`           | 0/1    | ↑   | The party ended the day with ≥1 conscious member and all enemies defeated |
| `roundsToClear` | rounds | ↓   | Rounds elapsed until the last enemy fell (per encounter and summed)       |
| `partyDeaths`   | count  | ↓   | Allies reduced to 0 HP and failing death saves (actual deaths, not downs) |
| `partyDowns`    | count  | ↓   | Times any ally dropped to 0 HP (includes recoveries)                      |
| `heroSurvived`  | 0/1    | ↑   | The build under test ended the day conscious                              |
| `heroDownRound` | round  | ↑   | First round the hero dropped to 0 (∞ if never); diagnostic                |

### Offense (attributed to the hero)

| Metric              | Unit     | Dir | Definition                                                              |
| ------------------- | -------- | --- | ----------------------------------------------------------------------- |
| `damageDealt`       | HP       | ↑   | Total damage the hero dealt that landed on enemies                      |
| `effectiveDamage`   | HP       | ↑   | Damage counted only up to each target's remaining HP (overkill removed) |
| `damagePerRound`    | HP/round | ↑   | `damageDealt` ÷ rounds the hero acted                                   |
| `nova3`             | HP       | ↑   | Most damage the hero dealt in any 3 consecutive rounds (burst signal)   |
| `killParticipation` | count    | ↑   | Enemy kills the hero contributed the final or majority damage to        |
| `timeToPriority`    | rounds   | ↓   | Rounds to drop a designated priority target (∞ if not dropped)          |

### Durability (the hero)

| Metric                | Unit     | Dir     | Definition                                                                     |
| --------------------- | -------- | ------- | ------------------------------------------------------------------------------ |
| `damageTaken`         | HP       | ↓       | Damage the hero actually lost (post-resistance)                                |
| `effectiveHpUsed`     | HP       | ↓       | Damage taken + healing received by the hero (total incoming pressure survived) |
| `damageMitigated`     | HP       | ↑       | Damage prevented by resistance, temp HP, Shield, Uncanny Dodge, etc.           |
| `enemyAttentionShare` | fraction | context | Share of enemy attacks aimed at the hero (↑ for tanks, ↓ for squishy roles)    |

### Support (the hero's effect on allies)

| Metric                | Unit  | Dir | Definition                                                                                                       |
| --------------------- | ----- | --- | ---------------------------------------------------------------------------------------------------------------- |
| `healingDone`         | HP    | ↑   | HP the hero restored to allies (capped at what was missing; overheal tracked separately)                         |
| `overhealing`         | HP    | ↓   | Healing above allies' missing HP; diagnostic                                                                     |
| `tempHpGranted`       | HP    | ↑   | Temporary HP the hero gave allies                                                                                |
| `conditionsCleared`   | count | ↑   | Harmful conditions the hero removed from allies                                                                  |
| `allyDamageEnabled`   | HP    | ↑   | Extra ally damage attributable to the hero's buffs (Bless, Faerie Fire, Haste), by paired comparison (section 7) |
| `allyDeathsPrevented` | count | ↑   | Allies brought up from 0 or kept above 0 by the hero's action                                                    |

### Control (the hero's effect on enemies)

| Metric                  | Unit           | Dir | Definition                                                                               |
| ----------------------- | -------------- | --- | ---------------------------------------------------------------------------------------- |
| `enemyActionsDenied`    | count          | ↑   | Enemy actions lost to stun/paralysis/incapacitation/banish the hero caused               |
| `enemyRoundsControlled` | round·creature | ↑   | Sum over enemies of rounds spent under a hero-caused debilitating condition              |
| `enemyMovementDenied`   | feet           | ↑   | Enemy movement removed (restrain, difficult terrain zones, forced movement)              |
| `enemyDamageAverted`    | HP             | ↑   | Estimated enemy damage prevented by control, by paired comparison (section 7)            |
| `enemyToHitReduced`     | HP-equiv       | ↑   | Effect of hero-caused penalties/disadvantage on enemy accuracy, in expected-damage terms |

### Efficiency

| Metric               | Unit        | Dir | Definition                                                                      |
| -------------------- | ----------- | --- | ------------------------------------------------------------------------------- |
| `resourcesSpentFrac` | fraction    | ↓   | Weighted resources spent ÷ resources available over the day (section 4)         |
| `slotValueSpent`     | slot-levels | ↓   | Spell-slot levels expended                                                      |
| `hpPerResource`      | HP/unit     | ↑   | (damage + healing + averted) ÷ resources spent; value density                   |
| `actionsWasted`      | count       | ↓   | Hero turns with no useful action (no legal target, redundant heal, failed-only) |

All of these are physical counts the engine already tracks or can track cheaply. None presupposes a
role; a tank and a healer emit the same catalog, and differ only in which metrics are high.

## 3. Horizons

The same catalog is read at two time scales (plan: one-shot vs. campaign).

- **One-shot** = a single adventuring day at one checkpoint level, with a nova-friendly day (few
  encounters, little reason to conserve). Scored once. Rewards peak output and front-loaded resources.
- **Campaign** = the day structure that stresses attrition (more encounters between long rests, limited
  short rests), run at each checkpoint (3, 5, 11, 17) along the build's level path. Each checkpoint
  produces the full catalog; the campaign score aggregates across checkpoints (section 6). Rewards
  sustained output and resource economy, and penalizes builds that spike at one level and fade.

The day structure (encounters per long rest, short rests allowed, XP budget per encounter) is a
**scenario parameter**, not an SRD constant — the 2024 SRD gives an XP-budget-per-character table
(Low/Moderate/High) and rest rules, but no fixed encounter count. The one-shot vs. campaign distinction
is expressed entirely by choosing different day structures, defined in the scenario spec.

## 4. The resource model

`resourcesSpentFrac` needs a common currency across unlike resources (spell slots, Rage, Ki/Focus,
Channel Divinity, Superiority-style dice, limited features, hit dice, consumables). Two issues:

- **Recharge class matters.** A long-rest resource is scarcer than a short-rest one over a day with
  multiple short rests. Each resource is weighted by `1 / expectedRechargesPerDay` for the scenario's
  rest cadence, so spending a once-per-day feature costs more than spending a per-short-rest one.
- **Slots are weighted by level.** A 5th-level slot is worth more than a 1st. Default weight = slot
  level (configurable).

`resourcesSpentFrac` = (Σ weightᵢ × spentᵢ) ÷ (Σ weightᵢ × availableᵢ). This is a design heuristic, not
an SRD rule, so it lives in config and is called out in reports as an assumption.

## 5. Normalization

Each raw metric `m` for a build in a scenario `s` is normalized against the **reference anchor** for
that metric in that scenario — the distribution of `m` produced by the frozen reference-party fillers
playing `s` (the hero slot filled by the role-matched benchmark). The anchor is computed once per
scenario, cached, and never changes during a GA run.

For a metric where higher is better:

```
norm(m) = (mean_build(m) − floor_s(m)) / (anchor_s(m) − floor_s(m))
```

- `anchor_s(m)` = the reference filler's mean for `m` in `s`. `norm = 1.0` means "as good as the
  benchmark"; `> 1` beats it.
- `floor_s(m)` = the value a build contributing nothing scores (0 for damage/healing/control; for
  "↓ better" metrics the orientation is flipped first so all normalized metrics are ↑ better).
- **Zero-anchor guard.** When `anchor_s(m) ≈ floor` (e.g. a martial reference does no healing, so the
  healing anchor is ~0), the ratio is undefined. Fall back to a scenario scale constant `scale_s(m)`,
  so `norm(m) = mean_build(m) / scale_s(m)`. **These constants are derived from the reference party's
  own totals in the scenario, not typed by hand** (resolved open decision 4): the scale for a metric is
  the party-wide pressure that metric answers, measured from the frozen reference party playing `s`.
  For example the healing scale = the reference party's total HP lost per day in `s` (the demand a
  healer must meet), the control scale = the enemies' total actions available per day, the support
  damage scale = the party's total damage dealt. Because the reference party and the scenario are fixed,
  each scale is a deterministic by-product of the anchor runs — computed once, cached, and covered by a
  test that the role-matched benchmark scores ≈ 1.0 on its own axis. No magnitude is asserted by hand.

Why ratio-to-anchor rather than z-score over the population: the population mean drifts as the GA
improves, which would make a fixed build's score fall over generations even though nothing changed.
Ratio-to-a-frozen-anchor is stable, interpretable ("1.3× the benchmark tank's effective HP"), and
comparable across scenarios and levels. The trade-off is sensitivity to a bad anchor; the frozen
fillers are reviewed for exactly this reason (plan).

Normalized metrics are clamped to a configurable ceiling (default 5.0) so one runaway scenario cannot
dominate an aggregate.

## 6. Aggregation

Four aggregation stages, in order. Each carries a mean and a confidence interval (section 7).

1. **Over runs** → a per-(build, scenario) estimate. Mean over seeds, with CI.
2. **Over scenarios** → a per-(build, checkpoint) estimate. Weighted mean over the scenario library,
   weights from config (CR bands, maps, reference-party templates — the plan's 2:2:1 template weights
   live here). Reported per template too, so composition-dependent builds are flagged.
3. **Over checkpoints** (campaign only) → a per-build campaign estimate. Weighted mean across 3/5/11/17,
   plus two shape statistics: `powerSlope` (trend across checkpoints) and `minCheckpoint` (the weakest
   checkpoint), so a build that is strong only at one level is distinguishable from one that is strong
   throughout. One-shot builds skip this stage.
4. **Into objective axes** → the vector NSGA-II optimizes.

### Objective axes

The normalized metrics roll up into **five capability axes**, each a weighted sum of its normalized
members (weights in config):

| Axis            | Built from                                                                            |
| --------------- | ------------------------------------------------------------------------------------- |
| `offense`       | effectiveDamage, damagePerRound, nova3, killParticipation, timeToPriority             |
| `survivability` | effectiveHpUsed (inv), damageMitigated, heroSurvived, partyDeaths (inv, shared)       |
| `control`       | enemyActionsDenied, enemyRoundsControlled, enemyDamageAverted, enemyMovementDenied    |
| `support`       | healingDone, allyDamageEnabled, allyDeathsPrevented, conditionsCleared, tempHpGranted |
| `efficiency`    | hpPerResource, resourcesSpentFrac (inv), actionsWasted (inv)                          |

Plus **`reliability`** = `won` aggregated (win rate), kept as a distinct axis because every role needs
it. That is **six axes** — deliberately at the limit of what Pareto dominance handles well (section 8).

## 7. Statistics

- **Common random numbers (CRN).** Every build faces the same seed stream per (scenario, runIdx):
  `seed = hash(scenarioId, runIdx)`. This pairs builds on identical dice, enemy rolls and initiative, so
  comparisons use paired differences and need far fewer runs for the same power. Requires the engine's
  RNG to be splittable into independent, labeled streams (per actor, per effect) so that adding a build
  that casts one more spell does not desynchronize the enemies' rolls — otherwise CRN's variance
  reduction is lost. This is a hard requirement on the RNG design, noted for the engine phase.
- **Confidence intervals.** Each estimate carries a CI. For `won` (a proportion) use a Wilson interval;
  for means use the t-interval (or bootstrap for skewed metrics like `nova3`). CIs propagate through the
  weighted aggregations.
- **Paired comparisons for "enabled"/"averted" metrics.** `allyDamageEnabled`, `enemyDamageAverted` and
  similar counterfactuals are measured by running the scenario with the hero's buff/debuff suppressed
  under the _same_ CRN seed and differencing. This is an extra run per such metric; config decides which
  are enabled (they roughly double cost for buffer/controller evaluation).
- **Sequential stopping.** Start each (build, scenario) at a small sample (default 20 runs). Add runs in
  batches until either the axis-level CIs are tighter than a target width or a run cap is hit (default
  200). In the GA, spend few runs to rank the generation, then re-evaluate only the non-dominated set
  and the elites at full sample ("racing"). This concentrates compute where decisions are close.
- **Minimum detectable effect.** Config sets the CI width that counts as "resolved"; reports state the
  effect size the run could and could not distinguish, so a near-tie is reported as a tie, not a rank.

## 8. Objective vector, Pareto, and the many-objective caveat

NSGA-II sorts by Pareto dominance. Dominance degrades as objectives grow: beyond ~4–5 objectives,
almost every individual is non-dominated, crowding distance drives selection instead of dominance, and
convergence stalls. Six axes is at that edge.

Three mitigations, all configurable:

1. **Default: 6 axes, NSGA-II.** Workable, but watch the non-dominated fraction; if it balloons, switch.
2. **Role-focused runs.** For a specific role, optimize a smaller objective set (the role's primary
   axes) and treat the rest as constraints ("survivability ≥ 0.8× benchmark"). This keeps dominance
   meaningful and matches how the user asked the question ("best tank", "best healer").
3. **NSGA-III** (reference-point based) if we genuinely want all six as independent objectives at once.
   It is built for many-objective problems and is a drop-in change to the selection operator.

The **equal-weight scalar score** the user asked for is a configurable linear combination of the six
axes (default equal). It is **not** what NSGA-II optimizes; it is a _summary_ used to rank within the
returned Pareto front and to produce a single leaderboard. So the Pareto front is computed once, and any
weighting (equal, or a role preset) ranks it without re-simulating — exactly the "configurable, revisit
later" property requested.

## 9. Roles as weight presets

A role is a named weight vector over the six axes (and optionally a constraint set), in config. Defaults
(0–3 emphasis), to be reviewed:

| Role          | offense | survivability | control | support | efficiency | reliability | Constraints                         |
| ------------- | ------- | ------------- | ------- | ------- | ---------- | ----------- | ----------------------------------- |
| Sustained DPS | 3       | 1             | 0       | 0       | 2          | 1           | efficiency ≥ benchmark              |
| Burst         | 3       | 1             | 0       | 0       | 0          | 1           | nova3 is the lead member of offense |
| Tank          | 1       | 3             | 1       | 0       | 1          | 2           | enemyAttentionShare high            |
| Healer        | 0       | 1             | 0       | 3       | 1          | 2           | allyDeathsPrevented weighted        |
| Controller    | 1       | 1             | 3       | 0       | 1          | 1           | —                                   |
| Buffer        | 1       | 1             | 1       | 3       | 1          | 1           | allyDamageEnabled weighted          |

Archetypes beyond these six emerge by clustering builds in the six-axis normalized space (plan), not by
adding presets. The equal-weight preset (all 1s) is the neutral generalist score.

## 10. Config schema (sketch)

```jsonc
{
  "version": 1,
  "horizon": "campaign",
  "dayStructure": "attrition-6", // reference into the scenario spec
  "metrics": {
    "clampCeiling": 5.0,
    "scaleConstants": { "healingDone@L5": 42, "...": 0 },
  },
  "resourceModel": { "slotWeight": "level", "rechargeWeighting": true },
  "axes": {
    "offense": {
      "effectiveDamage": 1,
      "damagePerRound": 1,
      "nova3": 0.5,
      "killParticipation": 0.5,
      "timeToPriority": 1,
    },
    // ...the other five axes
  },
  "roles": { "tank": { "offense": 1, "survivability": 3, "...": 0, "constraints": [] } },
  "scalarWeights": {
    "offense": 1,
    "survivability": 1,
    "control": 1,
    "support": 1,
    "efficiency": 1,
    "reliability": 1,
  },
  "optimizer": {
    "method": "nsga2",
    "objectives": ["offense", "survivability", "control", "support", "efficiency", "reliability"],
  },
  "stats": {
    "minRuns": 20,
    "maxRuns": 200,
    "targetCiWidth": 0.1,
    "pairedCounterfactuals": ["allyDamageEnabled", "enemyDamageAverted"],
  },
  "aggregation": { "scenarioWeights": "config", "templateWeights": { "R6": 2, "R4": 2, "R3": 1 } },
}
```

The config is hashed into the result key (plan), so a weight change that only re-ranks does not
invalidate simulated runs, but a change to what is simulated (day structure, counterfactuals, resource
model) does.

## 11. Validation

- **Closed-form anchors.** For a handful of builds, expected `damagePerRound` and hit chance are
  computed by hand and must match the simulated mean within CI (ties into the engine's golden tests).
- **Orientation tests.** Each metric's direction is asserted by a fixture where a strictly better build
  scores strictly higher on the intended axis and no worse elsewhere.
- **Anchor sanity.** Every `scaleConstant` and every zero-anchor fallback is covered by a test that the
  normalized benchmark scores ≈ 1.0 on its own axis.
- **CRN integrity.** A test that two builds differing in one spell still receive identical enemy and
  environment rolls under the same seed (the splittable-RNG requirement).
- **Reweight invariance.** A test that changing `scalarWeights` or a role preset re-ranks the stored
  Pareto front without touching any simulated run.

## 12. Open decisions

1. **Objective count.** Default six axes with NSGA-II and a watch on the non-dominated fraction;
   role-focused runs (smaller objective set + constraints) for targeted questions; NSGA-III if six
   independent objectives are essential. I lean toward role-focused runs as the primary mode and the
   full six-axis front as a periodic "overall" run. Confirm.
2. **Resource currency.** The recharge-weighted, slot-level-weighted model in section 4 is a heuristic.
   Accept it as the default, or do you want resources reported untransformed (per-type) only?
3. **Counterfactual cost.** Paired suppression for buffer/controller metrics roughly doubles their
   evaluation cost. Enable always, or only for builds whose support/control axis is already promising?
4. **Scale constants.** ✅ Resolved: derived from the reference party's totals per scenario, not typed
   by hand (section 5, zero-anchor guard).
5. **Clustering for archetypes.** In scope for the reports now, or deferred until after the first full
   run produces a population to cluster?

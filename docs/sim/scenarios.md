# Scenario and map format spec

Status: **draft for review. Spec only; no code.**

Part of the [simulator plan](./plan.md), Phase 1, and the last of the four Phase 1 specs. It defines
the test harness the builds are measured against: the maps, the seeded encounters, the adventuring-day
structures, the reference-party wiring, and the enemy tactics profile. It ties together the
[effect format](./effect-format.md) (monster effects), the [genome](./genome.md) (the hero that fills a
role slot), and the [metrics](./metrics.md) (which read the anchor runs this spec defines).

Everything the user asked for lives here: statically seeded opponents indexed by CR, static seeded
reference parties of up to 6, one-shot vs. campaign day structures, and the full-tactical-model map.
All numbers are from the seeds and the SRD 5.2.1 text, confirmed by query.

## 1. The three layers

A **scenario** is the atomic unit a build is scored against. It is built from three reusable layers so
that maps, encounters and days can be mixed independently:

1. **Map** — the battlefield grid, terrain, cover and starting zones.
2. **Encounter** — a specific set of enemies with their tactics profile, placed on a map.
3. **Day** — an ordered sequence of encounters with rests between them, defining attrition.

A scenario = (day, party template, hero role slot, seed family). The scenario library is the cross
product of a curated set of each layer, filtered to what is level-appropriate. Every element has a
stable `slug` and is content in git, hashed into the result key like the effect bundle.

## 2. Maps

The plan requires a full tactical model, so maps are explicit grids, not abstractions.

```jsonc
{
  "slug": "corridor-chokepoint",
  "grid": { "w": 20, "h": 12, "cellFt": 5 },
  "terrain": [
    { "cells": "rect:4,0,2,12", "wall": true },
    { "cells": "rect:8,5,4,2", "difficult": true },
  ],
  "cover": [{ "cells": "poly:...", "degree": "half" }],
  "elevation": [{ "cells": "rect:0,0,4,12", "z": 10 }],
  "hazards": [],
  "lighting": "bright",
  "startZones": { "party": "rect:0,4,3,4", "enemy": "rect:17,4,3,4" },
  "notes": "Five-foot-wide doorway at x=6; forces single-file, rewards control and AoE.",
}
```

- **Cells** are addressed by compact shape expressions (`rect:x,y,w,h`, `poly:...`, `circle:cx,cy,r`,
  or an explicit list) so a map file stays small.
- **Terrain flags** per cell group: `wall` (blocks movement and line of effect), `difficult` (costs
  double movement), `hazardId` (links a hazard), `z` elevation in feet.
- **Cover** is SRD half / three-quarters / total, as cell-to-cell geometry; the engine computes cover
  from the shooter and target cells.
- **Lighting** is `bright`, `dim` (lightly obscured) or `dark` (heavily obscured), interacting with
  Darkvision and obscurement rules.
- **Start zones** are where each side deploys; exact placement within a zone is set by the encounter.

### The map set (v1)

A small, deliberately varied set, each chosen to reward a different capability so no single build type
wins everywhere:

| Map                   | Shape                           | Rewards                                                  |
| --------------------- | ------------------------------- | -------------------------------------------------------- |
| `open-field`          | 20×20, no cover                 | Ranged, mobility; neutral baseline                       |
| `corridor-chokepoint` | narrow with a doorway           | Control, AoE, frontline tanks; punishes being surrounded |
| `pillared-hall`       | scattered cover and pillars     | Cover users, skirmishers; breaks line of effect          |
| `cavern-difficult`    | difficult terrain and elevation | Fliers, forced movement, zone control                    |
| `two-level-ledge`     | elevation and a climb           | Ranged high ground, reach; punishes melee-only           |
| `open-with-hazard`    | a lava/chasm strip              | Forced movement, positioning; rewards shove/topple       |

Each map is reused across levels; the encounter scales, not the map. Results are reported per map so a
build that only wins in the open is distinguishable from an all-terrain performer.

## 3. Encounters

Encounters are **statically seeded** and indexed by party level and CR band, as requested. They are
built against the SRD **XP Budget per Character** table (confirmed values at the checkpoints below,
multiplied by party size):

| Party level | Low / char | Moderate / char | High / char |
| ----------- | ---------- | --------------- | ----------- |
| 3           | 150        | 225             | 400         |
| 5           | 500        | 750             | 1,100       |
| 11          | 1,900      | 2,900           | 4,100       |
| 17          | 4,500      | 7,200           | 11,700      |

```jsonc
{
  "slug": "l5-moderate-brute-pack",
  "level": 5,
  "difficulty": "moderate",
  "map": "corridor-chokepoint",
  "enemies": [
    { "monster": "ogre", "count": 1, "place": "enemy:center", "tactics": "brute" },
    { "monster": "worg", "count": 3, "place": "enemy:spread", "tactics": "skirmisher" },
  ],
  "xpCheck": { "budgetPerChar": 750, "party": 5, "spent": 3700, "band": "moderate" },
  "shape": "melee-forward",
}
```

- `monster` is a `monsterSlug`; the engine compiles its stat block (effect spec). Only monsters whose
  effect fidelity is at least `approximated` are eligible (effect spec gate).
- `xpCheck` is validated at compile time: the summed monster XP (from `ChallengeRating`) must fall in
  the chosen difficulty band for the party size, or the encounter is rejected.
- `shape` tags the encounter archetype (single boss, elite + minions, swarm, ranged-artillery,
  caster-threat) so the library can be balanced across shapes, not just CR.

### Monster availability

The seeds hold 341 monsters. Counts by CR confirm the library is feasible at every checkpoint:

| Band      | CR range | Monsters available |
| --------- | -------- | ------------------ |
| Low tier  | 0–4      | 224                |
| Mid tier  | 5–10     | 68                 |
| High tier | 11–16    | 29                 |
| Apex      | 17+      | 20                 |

Low and mid tiers (levels 3–11) have ample variety. The high tier is thinner, and legendary/lair
mechanics there need hand-authored effects (effect spec, Phase 7), so the level-17 library is smaller
and leans on the apex solos plus mixed packs.

### Encounter shapes per checkpoint

Each checkpoint gets a curated set covering the shapes, at all three difficulties:

- **Single strong foe** (tests burst, single-target, time-to-priority).
- **Elite + minions** (tests focus-fire, control, AoE trade-offs).
- **Swarm of many weak** (tests AoE, action economy, being outnumbered).
- **Ranged/caster threat** (tests mobility, cover use, closing distance).
- **Mixed arms** (melee brutes + ranged + a controller enemy).

This spread is what keeps archetypes honest: a nova build shines on the single foe, a controller on the
swarm, a tank on the mixed melee press.

## 4. Days (one-shot vs. campaign)

A **day** sequences encounters with rests, which is where long-rest vs. short-rest resources diverge —
the core of the one-shot/campaign distinction (metrics spec, horizons).

```jsonc
{
  "slug": "attrition-6",
  "horizon": "campaign",
  "sequence": [
    { "encounter": "l5-moderate-brute-pack" },
    { "encounter": "l5-low-skirmishers" },
    { "rest": "short" },
    { "encounter": "l5-high-boss" },
    { "encounter": "l5-moderate-casters" },
    { "rest": "short" },
    { "encounter": "l5-moderate-mixed" },
    { "encounter": "l5-high-swarm" },
  ],
  "startResources": "full",
  "carryState": ["hp", "slots", "features", "hitDice", "conditions", "concentration"],
}
```

Two canonical day structures per checkpoint, configurable:

| Day            | Encounters | Short rests | Stresses                                                          |
| -------------- | ---------- | ----------- | ----------------------------------------------------------------- |
| `oneshot-nova` | 1–2        | 0           | Peak output; no reason to conserve. Favors long-rest nova builds. |
| `attrition-6`  | 6–8        | 2           | Resource economy; favors sustained and short-rest builds.         |

- **State carries across encounters** within a day: HP, expended slots and features, hit dice,
  lingering conditions and concentration. A short rest recovers short-rest resources and lets hit dice
  be spent; the day begins after a long rest (`startResources: full`).
- The 2024 SRD sets no fixed encounters-per-day, so these counts are a modeling choice stated in config,
  not an SRD claim. `attrition-6` approximates the classic 6–8 encounter day; `oneshot-nova` the
  single set-piece.

A campaign build is run through the day at **each** checkpoint it reaches; a one-shot build through one.

## 5. Reference parties and the hero slot

The parties are the frozen fillers from the plan, wired here. The hero (the build under test) does not
join a party — it **replaces the filler holding its target role**, keeping role coverage constant
(plan, reference parties). This spec records the mechanism; the filler recipes are in the plan.

```jsonc
{
  "slug": "R6",
  "size": 6,
  "weight": 2,
  "slots": {
    "tank": { "filler": "fighter-champion" },
    "sustainedDps": { "filler": "ranger-hunter" },
    "burst": { "filler": "rogue-thief" },
    "healer": { "filler": "cleric-life" },
    "controller": { "filler": "druid-land" },
    "buffer": { "filler": "bard-lore" },
  },
  "flex": null,
}
```

- A scenario names a **hero role slot**. The hero replaces that slot's filler; the other fillers play as
  benchmarks. For a role a template lacks, the hero replaces the `flex` filler (R4's flex = `rogue-thief`,
  R3's = `wizard-evoker`; plan).
- **Anchor runs** (metrics spec) are the same scenario with the slot's filler left in place and no hero.
  Those runs produce the per-metric anchors and the party-total scale constants. Anchors are computed
  once per (scenario, slot) and cached.
- Templates R6, R4, R3 are scored with weights 2:2:1 (plan). **Solo** is a one-member "party" used only
  as a self-sufficiency diagnostic and is never scored into rankings.

Enemy placement within a start zone, and which ally occupies which grid cell, are fixed per scenario
from its seed so that formation is reproducible.

## 6. Enemy tactics profile

With one shared AI for allies (plan), enemies also run a fixed, declarative tactics profile so results
are reproducible and not gamed by hero-specific enemy mistakes. A profile is a utility-weight preset
(same AI machinery as the party, different weights) attached per enemy in the encounter:

| Profile      | Behavior                                                                 |
| ------------ | ------------------------------------------------------------------------ |
| `brute`      | Closes to melee, attacks nearest/most-wounded, ignores self-preservation |
| `skirmisher` | Hit-and-run, uses mobility and reach, avoids opportunity attacks         |
| `artillery`  | Keeps distance, targets lowest-AC or casters, uses cover                 |
| `controller` | Leads with saves/debuffs, focuses the party's strongest                  |
| `tactician`  | Focus-fires downed-adjacent targets, protects allies, uses terrain       |

`focusFire` and `priorityTarget` policy (e.g. "target the hero", "target the healer", "spread") are
scenario parameters, so a tank is actually tested on drawing fire and a squishy build on surviving
focus. The enemy AI never reads the hero's genome — only board state — so no build is punished by
clairvoyant enemies.

## 7. Seeding and common random numbers

- A scenario carries a `seedFamily`. Run `i` uses `seed = hash(scenarioSlug, seedFamily, i)`, split into
  labeled streams per actor and per effect (metrics spec CRN requirement). This guarantees two builds in
  the same scenario face identical enemy rolls, initiative and terrain events — the pairing that makes
  comparisons cheap.
- Static placement (formations, enemy positions) is derived from a separate placement seed so it is
  identical across builds and across the paired anchor run.
- The scenario library is enumerated and frozen per engine version; adding scenarios is a content change
  with its own hash, so existing results stay valid.

## 8. The v1 library size

A rough budget to keep runs tractable (the GA multiplies this by population × generations × runs):

- 6 maps × ~5 encounter shapes × 3 difficulties, filtered for level-appropriateness ≈ **20–30 encounters
  per checkpoint**.
- 2 day structures × 3 party templates (+ solo diagnostic) per checkpoint.
- 4 checkpoints.

That is on the order of a few hundred distinct scenarios across all checkpoints — enough variety to
prevent overfitting, small enough to run. The exact counts are tuned after the Phase 2 engine benchmark
(plan), since cost per run is unknown until then.

## 9. Validation

- **XP legality.** Every encounter's summed monster XP sits in its declared difficulty band for the
  party size, computed from `ChallengeRating`.
- **Monster eligibility.** Every referenced monster exists and has effect fidelity ≥ approximated.
- **Map integrity.** Start zones are disjoint and reachable; no enemy or ally starts in a wall; the grid
  has a path between the zones (or the map declares the separation intentional).
- **Reproducibility.** The same scenario and seed produce identical placement and identical dice across
  two runs and across a build and its anchor (CRN test, shared with metrics).
- **Coverage.** The library spans every encounter shape and every map at each checkpoint; a report flags
  a checkpoint missing a shape so the set stays balanced.

## 10. Open decisions

1. **Map count.** Six maps for v1 (section 2). Enough variety, or do you want more terrain types (water,
   total darkness, three-level verticality) from the start?
2. **Day structures.** Two per checkpoint (`oneshot-nova`, `attrition-6`). Add a third middle case
   (3–4 encounters, one short rest), or keep two until results suggest a gap?
3. **Priority-target policy.** I propose testing each role against the policy that stresses it (tanks vs.
   "focus the hero", squishies vs. "focus the weakest") as part of the scenario set, rather than one
   fixed policy. Confirm.
4. **High-tier library.** Level 17 is thin on monsters and needs hand-authored legendary/lair effects.
   Accept a smaller level-17 library leaning on apex solos, or defer level 17 until those effects are
   authored (Phase 7) and focus the first runs on 3/5/11?
5. **Monster spellcasters.** Several mid/high monsters cast spells (listed in `MonsterSpell`). Their
   spells reuse the effect layer. Confirm they are in scope for the enemy side from the start, since they
   change how control and tank builds are tested.

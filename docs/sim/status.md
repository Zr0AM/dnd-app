# Sim — state of play, decisions, gaps

A single place to see where the build-optimization simulator actually stands: what
is built and verified, the decisions that shaped it (and why), where the code
diverges from the specs, what is deferred, and what to pick up next. The per-topic
specs (`metrics.md`, `genome.md`, `scenarios.md`, `effect-format.md`, `cli.md`,
`ui-integration.md`) remain the detailed references; `plan.md` holds the phase
narrative. This file is the operator's and the next contributor's summary.

_Last updated: 2026-10-08. Branch `claude/youthful-allen-rvalgm`, PR #73._

---

## 1. Status at a glance

| Phase | Area                                                                | State                                |
| ----- | ------------------------------------------------------------------- | ------------------------------------ |
| 1     | Specs (metrics, genome, scenarios, effects)                         | ✅ drafted                           |
| 2     | Engine skeleton (dice, RNG, grid, attacks, saves, conditions, loop) | ✅ done                              |
| 3     | Walking skeleton (L3 martials + GA)                                 | ✅ done                              |
| 4     | Casters & effects (L3–5: damage/heal/control/buff)                  | ✅ done                              |
| 5     | Full AI, metrics, scenario library, CIs, CRN, reference parties     | ✅ done                              |
| 6     | NSGA-II + legality validator + run reports                          | ✅ optimizer done; D1 store deferred |
| 7     | Levels 11 & 17 (opponents, upcasting, legendary, campaign scoring)  | ✅ done (lair actions deferred)      |
| —     | **CLI** (interactive menus + flags)                                 | ✅ done                              |
| 8     | Item & loot allocation                                              | ⬜ not started                       |

**Test posture:** 361 sim tests across 35 files pass; `typecheck:sim` and prettier
clean. The CLI adds 37 of those tests (prompt parsing, config/flags, flow
navigation via a scripted prompter).

---

## 2. What's built and verified (outcomes)

**Engine.** Seeded, label-addressed RNG (common random numbers: two builds face
identical rolls in a scenario); dice with closed-form expected values; 2024
simple-grid movement with difficult terrain and reach/range; attack/save/damage
resolvers each shipping a closed-form probability for validation; the 15 SRD
conditions as mechanical queries; the initiative/turn loop with action economy,
opportunity attacks, concentration, and legendary actions.

**Classes.** All twelve SRD classes, each with its single SRD subclass, compiled
from the seed DB, and each with its signature combat piece modeled:

- Martial: Fighter (fighting styles, Extra Attack scaling), Barbarian (Rage,
  Unarmored Defense), Rogue (Sneak Attack), Ranger (Hunter's Mark, Colossus Slayer),
  Paladin (gish: half-caster slots + Divine Smite + Aura of Protection at L6, Lay on
  Hands), Monk (Martial Arts, Flurry, Stunning Strike).
- Caster: Wizard, Cleric, Bard, Sorcerer (Draconic + Quickened metamagic), Warlock
  (Eldritch/Agonizing Blast on short-rest Pact slots, Dark One's Blessing), Druid
  (full caster + one representative Wild Shape beast form).

**Spells & effects.** Slots, save DC, spell attack, concentration; damage (cantrips
→ Fireball with upcasting), heal, control (timed conditions, repeat saves,
concentration breaking), and buff (Bless, Haste with +AC / extra attack action and
the recipient's riders).

**Optimizer & metrics.** NSGA-II (fast non-dominated sort + crowding), genome repair
as the legality validator, six objective axes (reliability, offense, survival,
efficiency, control, support), reference-anchor normalization, Wilson/mean CIs, the
seven role weight-presets, and serializable `RunReport`s with client-side reweighting
(rescore without re-simulating).

**Harnesses.** Solo (1-v-monsters) and reference-party (R6/R4/R3 with role-slot
fillers) — control and support only carry signal in the party harness. Campaign /
adventuring-day scoring (`opt/campaign.ts`): the scenario set in sequence on one
persisted hero with only short rests, so day-win-rate and encounters-cleared separate
nova from sustained (wizard collapses, barbarian sustains, short-rest warlock
out-lasts its one-shot standing).

**Levels.** 3 / 5 / 11 / 17. High-level opponent sets calibrated to tough-but-winnable
solo fights; monster Multiattack (`content/multiattack.ts`); legendary dragon bosses
in the party harness (fixed adds so the boss fight does not balloon with party size).

**CLI (`sim/src/cli/`).** The operator front door — see §5 and `cli.md`. Interactive
menus and flags both configure one `RunConfig`; outputs a `RunReport` JSON plus a
stdout leaderboard. Verified end-to-end for optimize (incl. class filter), eval (solo
and party — support axis lights up in party), and `--help`.

---

## 3. Key decisions (and why)

- **NSGA-II over a scalar GA.** The metrics are genuinely multi-objective (a glass
  cannon and a tank are both optimal in different trades). NSGA-II returns the whole
  Pareto front; the weighted score is a post-hoc summary, so **reweighting a role
  never needs a re-run** — the property the UI/metrics specs rely on.
- **Repair, not penalty.** Illegal genomes are repaired to the nearest legal build so
  every evaluation scores a real build; no evaluations are wasted on penalties.
- **Common random numbers.** RNG streams addressed by label, not draw order, so
  variance between builds reflects the builds, not the dice — far fewer runs for a
  given confidence.
- **Reference-anchor normalization.** Scale constants derived from the reference
  party's per-scenario totals, not hand-typed, with a zero-anchor guard.
- **Campaign scoring via short-rest-only days.** The cheapest faithful way to expose
  the one-shot-vs-multi-year question without a full long-rest resource economy.
- **Pure `sim/` library, offline.** No network, native `node:sqlite` seed DB in
  memory; the engine stays bundle-pure and deterministic.
- **CLI decisions** (all in `cli.md §Decisions`): zero-dependency `node:readline`
  menus behind a swappable `prompt` module (works offline, no install); **flags, no
  config-file format**; JSON file + stdout summary; full menu in v1.
- **CLI runner uses esbuild, not vite-node.** `vite-node` isn't installed and the sim
  is meant to stay offline/zero-dep, so `scripts/run-sim.mjs` bundles the entry with
  the already-present `esbuild`. The bundle is emitted at `sim/src/cli/` depth so
  `load-db.ts`'s `import.meta.url`-relative DB path still resolves.

---

## 4. Gaps, deferrals, and spec-vs-code divergences

Honest list — none of these block the current runs, but a reader should know them.

**Genome is narrower than `genome.md` specifies.** The implemented genome is
**single-class**, **standard-array** (not point-buy), with **fixed caster spell/gear
packages** (not spell-selection genes). The spec envisions up to 3 classes, point-buy,
and a small "signature" spell gene set with the AI filling the rest. Consequences:
multiclass builds, ability-score optimization, and spell-list optimization are not
explored yet. This is the single biggest lever for "find the optimal build" fidelity.

**Optimize runs solo only.** NSGA-II evaluates with the solo evaluator, so an
optimization never scores control/support (they're zero solo). Party _context_ is
exercised per-build in the CLI `eval` flow. Optimizing _in_ party context would need a
party evaluator threaded into `runNsga2` and `buildReport` adapted to the
`PartyEvalResult` shape — a bounded but real change.

**Caster depth.** Spell catalog is the authored subset (through Fireball + a few
control/heal/buff). Charm/fear forced-behavior is not modeled (spec suggests the
"can't attack the caster" approximation, biased `under`). Metamagic/Invocations beyond
Quickened/Agonizing need seeding into `FeatureOption`.

**Wild Shape** is one representative beast form, not the beast catalog.

**Lair actions** are the one documented Phase-7 deferral (location-gated; 2024 folds
most into the stat block). Monster spellcasters on the enemy side are not wired in.

**D1 results store (Phase 6 tail).** Reports are local JSON only; the D1 migration +
upload need push access to `dnd-db-rest` (see `ui-integration.md`). No UI wiring yet.

**Items & loot (Phase 8).** Not started; the L11/L17 reference parties still lack a
magic-item profile (an open item in `plan.md`).

**Cosmetic.** `describeGenome` emits `L?` in leaderboard rows (the level is in the
summary header); harmless, in the library not the CLI.

**Unresolved spec decisions** still open: objective count / role-focused vs. full
six-axis as the primary mode (`metrics.md`), resource-currency heuristic,
counterfactual-cost toggle, archetype clustering in reports; map/day-structure counts
and priority-target policies (`scenarios.md`).

---

## 5. Design overview

**Data flow (optimize):** seed DB (in-memory) → `loadMartialCatalog(db, level)` →
`runNsga2(catalog, random, opts)` (genome repair + solo `evaluate` per individual,
cached by genome key) → `buildReport(result, config, weights)` → optional
`annotateCampaignViability` → `RunReport` JSON + stdout table.

**Layering (sim/src):** `rng` · `dice` · `core` · `grid` · `combat` (model +
resolvers + encounter loop) → `content` (DB loaders, character/caster compilers,
features, monsters, multiattack) → `scenario` (library, party) → `opt` (genome,
catalog, evaluate, party-evaluate, nsga2, reports, roles, campaign, stats) → `ai`
(tactical policy). Everything above `content` is pure; `content/load-db.ts` is the
only DB-coupled layer.

**CLI (`sim/src/cli/`)** — a thin tooling shell over the library, four seams:

- `prompt.ts` + `prompt-readline.ts` + `prompt-scripted.ts` — the `Prompter` interface
  (select / multiselect / text / number / confirm / print) with a zero-dep readline
  backend and a scripted backend for tests. Pure parsing (`resolveSelection`, …) is
  shared, so test and terminal behavior match. Numbered selection, not arrow keys; the
  interface is shaped so `@inquirer/prompts` could slot in later.
- `config.ts` — the pure `RunConfig` model, GA effort presets, flag parsing +
  validating overlay, the `RunConfig`→`Nsga2Options` mapping, and the summary-table
  formatter. All unit-tested.
- `engine.ts` — a `CliEngine` interface (optimize / evalBuild / annotateCampaign /
  browse / weaponNames) with `liveEngine()` over the seed DB + optimizer + evaluators.
  Flows depend on this, **not** the simulator, so flow tests inject a fake and need no
  DB.
- `report-io.ts` — the filesystem edge (write / list / read reports) behind a `CliIo`
  interface; `flows.ts` — the interactive screens + main menu + the flags-path
  helpers; `main.ts` — argv dispatch (`<mode> … --yes` runs from flags; otherwise flags
  pre-seed the menus); `scripts/run-sim.mjs` — the esbuild runner.

**Testing seam that matters:** flows are driven by a scripted `Prompter` + fake
`CliEngine`/`CliIo`, so the whole menu system is tested deterministically with no TTY,
no database, and no simulated fights.

---

## 6. Remaining considerations / recommended next steps

Ordered by leverage toward the project's actual question (optimal build per role per
level, one-shot vs. campaign):

1. **Widen the genome** — the highest-value gap. Point-buy (or at least ability
   permutation already exists; add point-buy), then a small signature spell-gene set,
   then 2-class multiclass. Each step enlarges the explored space toward the spec.
2. **Party-context optimization** — thread a party evaluator into `runNsga2` (and adapt
   `buildReport`) so controller/healer/buffer roles are optimized where their axes
   actually score, instead of only eval'd per build.
3. **Close the caster model** — charm/fear approximation, more control/AoE spells,
   enemy spellcasters.
4. **D1 store + UI** — the Phase-6 tail: migration + upload (needs `dnd-db-rest` push
   access), then the display-only UI mode in `ui-integration.md`.
5. **Items & loot (Phase 8)** and the L11/L17 reference-party item profiles.
6. **Resolve the open spec decisions** in `metrics.md`/`scenarios.md` (objective-count
   mode, day structures, priority-target policies) once a first full run gives a
   population to reason about.
7. **CLI niceties** (optional): a live generation counter via a progress callback into
   `runNsga2`; a non-interactive path for `campaign`/`rescore` (e.g. `--report <path>`).

---

## 7. How to run / where things live

```bash
npm run sim                 # interactive menus
npm run sim -- --help       # flag reference
npm run sim -- optimize --level 11 --role controller --campaign --preset thorough --yes
npm run test:sim            # 361 tests
npm run typecheck:sim
```

- Specs: `docs/sim/*.md` (this file is the summary; `plan.md` the phase narrative).
- Engine + optimizer: `sim/src/{rng,dice,core,grid,combat,content,scenario,opt,ai}`.
- CLI: `sim/src/cli/` + `scripts/run-sim.mjs`; reports land in `sim/out/` (git-ignored).

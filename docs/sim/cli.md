# Sim CLI — interactive run utility (plan)

A terminal utility to **initiate and configure optimization runs** against the `sim/`
engine. Today every capability (catalog, NSGA-II, reports, solo/party/campaign
evaluation) is library code reachable only from tests. This CLI is the operator's
front door: an interactive, menu-driven session that gathers a run configuration,
executes it, writes the report JSON, and prints a summary.

Status: **built**. The CLI ships in `sim/src/cli/` — the prompt module (zero-dep
`node:readline` + scripted backend), the pure `config`/summary/report-writer, the
`CliEngine` over the library, the interactive flows, and `main.ts` dispatch. The
runner is `scripts/run-sim.mjs` (esbuild bundle, since the sim uses vite-resolved
imports + native `node:sqlite`; `vite-node` is not installed and the sim stays
offline/zero-dep). Run with `npm run sim`. One deviation from the plan below:
`optimize` runs **solo** NSGA-II (the engine's optimizer is solo); party _context_
is exercised per-build in the `eval` flow, where control/support actually score.
See `sim/README.md` for usage.

## Goals

- **Interactive first.** Launching with no arguments drops into navigable menus that
  walk through configuring a run — no need to remember flags.
- **Flags as the non-interactive fallback.** The same options are settable as flags
  for scripted/repeatable runs; there is **no config-file format** (per decision).
  Flags also pre-seed the interactive session (a flag sets a default; the menu can
  still change it) unless `--yes` skips straight to execution.
- **Offline research.** Runs read the committed seed DB in memory and write results
  to local JSON — the same `RunReport` shape the UI/D1 contract will consume. No
  network, no D1 writes (that step is still deferred).
- **Deterministic.** A seed makes any run reproducible; it is shown and saved.

## Runtime

- Entry: `sim/src/cli/main.ts`, run through `vite-node` (already available via
  vitest) so the TypeScript and `node:sqlite` run with no build step.
- npm script: `"sim": "vite-node sim/src/cli/main.ts --"`, invoked as
  `npm run sim` (interactive) or `npm run sim -- run --level 11 ...` (flags).
- Node 22's native `node:sqlite` powers the in-memory seed DB, exactly as the tests
  and `srd:check` already do.
- The CLI lives **outside** the pure `sim/src` library surface conceptually (it is
  tooling, not engine), but sharing the folder is fine; it imports the library, not
  vice-versa, so the engine stays bundle-pure.

## Interactive flow

```
┌ D&D Build Optimizer ───────────────────────────────┐
│  > Run an optimization        (NSGA-II + report)    │
│    Evaluate a single build                          │
│    Adventuring-day (campaign) check                 │
│    Rescore a saved report                           │
│    Browse content (classes / roles / scenarios)     │
│    Quit                                             │
└─────────────────────────────────────────────────────┘
```

Picking **Run an optimization** steps through configuration screens, each a menu
with the current value shown and a sensible default pre-selected:

1. **Level** — checkpoint: 3 / 5 / 11 / 17.
2. **Role** — the weighting preset the leaderboard is scored by: sustained-dps,
   burst, tank, generalist, controller, healer, buffer (or "equal weights").
3. **Class filter** — all 12 classes, or restrict the genome pool to a subset
   (multi-select) to answer "best _fighter_" vs "best build overall".
4. **Evaluation context** — solo (default) or reference-party (R6/R4/R3), since
   control/support only score in a party.
5. **GA parameters** — population size, generations, runs-per-eval, mutation rate
   (defaults tuned per level; a "quick / standard / thorough" preset picker that
   expands to the raw numbers).
6. **Campaign annotation** — yes/no: also score each reported build's
   adventuring-day win rate (slower).
7. **Seed** — integer, default random-but-shown; re-use to reproduce a run.
8. **Output** — directory (default `sim/out/`); the filename is the run key.

Then a **confirmation screen** echoes the full config and offers Run / Edit a field
/ Cancel. During the run a progress line reports generation N/▮▮▮. On completion it
prints the summary table and the written path, then returns to the main menu.

The other main-menu entries reuse the same screens with fewer fields:

- **Evaluate a single build** — pick class, then gear/ability choices (menus driven
  by the catalog's legal options), level, context → prints the metric vector + CIs.
- **Campaign check** — a single build or a saved report → day win rate, encounters
  cleared.
- **Rescore** — choose a saved `sim/out/*.json`, pick a new role/weights → re-ranked
  leaderboard, no re-simulation (reuses `reports.rescore`).
- **Browse content** — list classes (with subclass + signature feature), role
  presets (with weights), and the level's scenario set (opponents + shapes).

## Config model

A single in-memory `RunConfig` object is what the menus build and the flags set; it
is also written into the report's `config` field (so a report records how it was
produced). Shape:

```ts
interface RunConfig {
  mode: 'optimize' | 'eval' | 'campaign' | 'rescore';
  level: 3 | 5 | 11 | 17;
  role: string; // a ROLE_WEIGHTS key, or 'equal'
  classes: BuildClass[]; // genome pool restriction (default: all)
  context: 'solo' | 'party';
  ga: { populationSize: number; generations: number; evalRuns: number; mutationRate: number };
  campaign: boolean;
  seed: number;
  outDir: string;
}
```

Flags map one-to-one: `--level 11 --role controller --classes wizard,sorcerer
--context solo --pop 48 --gens 20 --runs 12 --campaign --seed 7 --out sim/out`.
With `--yes` (or any flag present + `--no-interactive`) the CLI runs without menus.

## Output

- **JSON**: the full `RunReport` (front + leaderboard, objective bounds, weights,
  config, optional campaign annotation) to `<outDir>/<runKey>.json`. `runKey` is the
  existing stable hash of the config, so re-running the same config overwrites rather
  than litters.
- **Stdout summary**: a compact table of the top ~10 builds — rank, description,
  weighted score, win rate, damage, HP retained, control/support where non-zero, and
  campaign day-win-rate when annotated — followed by the written path.

```
Top builds — L11, controller (seed 7)
  #  build                               score  win   dmg  ctrl  camp
  1  barbarian · Greatsword (2H)         0.82   0.79  137   —     0.63
  2  wizard · Fireball/Hold Person       0.74   0.41  128   2.4   0.00
  ...
  wrote sim/out/3f9a1c22.json
```

## Interactive-menu implementation

The one real dependency question. Two options:

1. **Zero-dependency (recommended for v1).** Build the menus on Node's built-in
   `node:readline/promises`: numbered selection lists ("type 2, Enter"), text/number
   prompts with defaults, and yes/no confirms. Robust everywhere, needs no install
   (important if the environment's npm network is restricted), and the sim's
   minimal-deps ethos is preserved. "Navigable" via numbers rather than arrow keys.
2. **`@inquirer/prompts` (nicer UX).** Arrow-key navigable `select`/`checkbox`/
   `input`/`confirm` prompts — the closest to the mock above. Adds one dev
   dependency (and its `@types/node` reach) and needs `npm install`.

Plan: ship v1 on option 1 behind a thin `prompt` module (select / multiselect /
text / number / confirm), so the whole CLI calls `prompt.select(...)` etc. and the
backend can later swap to `@inquirer/prompts` without touching the screens.

## Build slices

1. **Runner + skeleton** — `sim/src/cli/main.ts`, the `npm run sim` script, the
   zero-dep `prompt` module, and the main menu that can reach a stubbed screen and
   quit cleanly. Tests for the prompt module and arg parsing (pure functions).
2. **Optimize run** — the config screens + flags → `runNsga2` → `buildReport` →
   write JSON + summary table. The headline path.
3. **Campaign annotation + party context** — the toggle and the party-evaluate path.
4. **Eval / rescore / browse** — the remaining menu entries (rescore and browse are
   cheap and demo the content).
5. **Docs** — a `## CLI` section in `sim/README.md` and a usage note.

Testing: the config/flag parsing, the `RunConfig` → engine-options mapping, the
summary-table formatter, and the report writer are all pure and unit-tested; the
interactive loop itself is driven by a scripted fake `prompt` backend so a test can
"navigate the menus" deterministically without a TTY.

## Decisions (resolved)

- **TUI dependency** — zero-dependency `node:readline/promises` (numbered menus),
  behind a thin swappable `prompt` module. No install, works offline.
- **Scope of v1** — the full menu: optimize, eval, campaign, rescore, and browse.
- **Progress reporting** — `runNsga2` is synchronous and silent; v1 prints a "running
  …" line before the run and the summary after. A live generation counter (a progress
  callback threaded into `runNsga2`) is a later nicety, not v1.

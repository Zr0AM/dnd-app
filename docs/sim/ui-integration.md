# UI integration plan

Status: **decided, deferred. Built at the conclusion of the simulator phases.**

Part of the [simulator plan](./plan.md). Records how the simulator's results reach the Adventurer's
Ledger app, and what is deferred.

## Decision

**Display-only, built last.** After the simulator phases are complete and there are real results to
show, the app gains a read-only view over precomputed results. The simulator stays offline research
(plan decision 1): it runs as a Node process, writes aggregates to D1, and the app only reads them.

Two richer modes are **explicitly deferred** for the future (see below); they are noted now so the
data contracts we design for display-only do not foreclose them.

## Mode A — Display-only (the committed scope)

Fits the existing app almost exactly: it already reads `/api/items` through a Pages Function
(`functions/api/items.ts`) that proxies the `dnd-db-rest` Worker, and renders list/detail views with
standalone, `OnPush`, signal-first components using `httpResource`, with URL-synced state.

Work items, when we reach this:

1. **Results schema in `dnd-db-rest`** (separate repo; needs push access). A migration adding
   `SimRun` (config + engine/content hash), `SimBuild` (canonical genome), `SimResult` (per-build,
   per-metric mean + confidence interval), and optionally `SimParetoFront`. Each has a single integer
   primary key, so the Worker's generic `/rest/{table}` routes and allowlist (`TABLES` in `src/rest.ts`)
   cover them with one entry each.
2. **An export step in the sim.** A writer that serializes a finished run to those rows (local JSON
   first, D1 later). The engine already produces everything needed.
3. **A Pages Function** (`functions/api/sim-results.ts`) mirroring `items.ts`.
4. **Angular feature** — a lazy route (e.g. `/lab`): a leaderboard, a build sheet, and a metric
   breakdown. Reweighting the six capability axes is done **client-side** over the stored Pareto front,
   so changing role weights needs no refetch — this is exactly why the metrics spec made weighting a
   post-hoc summary rather than something baked into the run.

Cheapest first slice: the content-bundle export (below) plus a read-only `/lab` route listing a run's
top builds with client-side axis reweighting. Gives something real on screen before the GA is finished.

## Deferred for the future

These are **not** in the committed scope but are recorded so the display-only contracts leave room for
them.

### Mode B — Live fight replay (future)

An in-browser "run and watch one fight, round by round" view. Feasible because the engine is pure
TypeScript with no Angular or runtime dependencies — it runs in a Web Worker as-is — and every fight
already emits a structured, deterministic event log (`CombatEvent[]`). Needs one new thing: a **static
JSON content bundle** (monsters, weapons, armor, classes — already compiled), because the current
content loader (`sim/src/content/load-db.ts`) uses `node:sqlite` and `node:fs`, which the browser lacks.
That bundle is worth building regardless: it also caches content for offline runs and hashes into
results.

### Mode C — Interactive single-build tuning (future)

The above plus small in-browser Monte Carlo: tweak one build and run it against one scenario for a few
hundred seeds in a Worker, seeing metrics update. Bounded on purpose — a full GA sweep is not a browser
workload and stays offline. "Interactive" here means inspecting and adjusting one build versus one
scenario, not optimizing.

## Notes for whoever builds this

- The **content bundle** (needed for B and C) should be designed when we build the display-only export,
  so one content-serialization format serves the CLI cache, the result hash, and any future browser use.
- D1 writes require push access to `dnd-db-rest` and the environment's network/credential setup; reads
  go through the Pages Function as today.
- Keep the results schema's weighting-agnostic: store the Pareto front and per-metric values, not a
  single pre-weighted score, so the UI can reweight without re-running (and B/C can reuse the same data).

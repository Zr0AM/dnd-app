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

| Path        | Holds                                                                                                                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/rng/`  | Splittable, label-addressed RNG. The keystone for common random numbers: streams are addressed by label, not draw order, so two builds in one scenario face identical enemy/environment rolls. |
| `src/dice/` | Dice rolling on the RNG, with closed-form expected values used to validate simulated means.                                                                                                    |
| `src/core/` | Combat vocabulary mirroring the seeds (abilities, 13 damage types, 15 conditions, sizes) and the ability-modifier / proficiency-bonus rules.                                                   |
| `src/grid/` | The battlefield grid: 2024 simple-grid distance (diagonals count as 5 ft), reach/range, and a terrain grid (walls, difficult terrain).                                                         |

Still to come in Phase 2: the actor/combatant model, attack and save resolution,
damage application with resistances, conditions, and the initiative/turn loop.

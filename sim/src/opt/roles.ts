// Roles as weight presets over the objective axes (plan decision 10, metrics
// spec). A role is a named weight vector; applying it to a report re-ranks the
// Pareto front for that role without re-simulating (reports.rescore).
//
// The current objective vector has four live axes — reliability, offense,
// survival, efficiency — so the roles a solo martial can express (Sustained DPS,
// Burst, Tank, Generalist) are defined over them. The caster-dependent roles
// (Healer, Controller, Buffer) need the control/support axes, which arrive with
// the spell effect layer; their presets are listed in CASTER_ROLES as a marker,
// not yet usable, since a martial-only run has no support/control signal.

export type RoleWeights = Record<string, number>;

/** Roles expressible by the current (martial) metric axes. */
export const ROLE_WEIGHTS: Readonly<Record<string, RoleWeights>> = {
  // Steady damage that also survives the day.
  'sustained-dps': { reliability: 1, offense: 3, survival: 1, efficiency: 2 },
  // Drop targets fast; damage and pace over endurance.
  burst: { reliability: 1, offense: 3, survival: 0, efficiency: 3 },
  // Absorb punishment and stay standing.
  tank: { reliability: 2, offense: 1, survival: 3, efficiency: 1 },
  // A balanced all-rounder.
  generalist: { reliability: 1, offense: 1, survival: 1, efficiency: 1 },
};

/**
 * Roles that need the control/support axes (Phase 4). Listed so the role set is
 * complete and documented; they are inert until those metric axes exist, because
 * a martial-only run produces no control or support signal.
 */
export const CASTER_ROLES: Readonly<Record<string, RoleWeights>> = {
  healer: { reliability: 2, survival: 1, support: 3, efficiency: 1 },
  controller: { reliability: 1, offense: 1, survival: 1, control: 3, efficiency: 1 },
  buffer: { reliability: 1, offense: 1, survival: 1, support: 3, efficiency: 1 },
};

export function roleWeights(role: string): RoleWeights {
  const w = ROLE_WEIGHTS[role];
  if (!w) throw new Error(`unknown (or not-yet-supported) role: ${role}`);
  return w;
}

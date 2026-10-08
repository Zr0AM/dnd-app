// Roles as weight presets over the objective axes (plan decision 10, metrics
// spec). A role is a named weight vector; applying it to a report re-ranks the
// Pareto front for that role without re-simulating (reports.rescore).
//
// All six objective axes are now live — reliability, offense, survival,
// efficiency, control, and support — so the full v1 role set is expressible. The
// control and support axes carry signal only in the party harness (a solo martial
// has no allies to buff/heal and scores 0 there), but the presets are defined over
// the same vector, so a party-context report ranks every role.

export type RoleWeights = Record<string, number>;

/** The v1 roles as weight presets over the objective axes (metrics spec, section 8). */
export const ROLE_WEIGHTS: Readonly<Record<string, RoleWeights>> = {
  // Steady damage that also survives the day.
  'sustained-dps': { reliability: 1, offense: 3, survival: 1, efficiency: 2 },
  // Drop targets fast; damage and pace over endurance.
  burst: { reliability: 1, offense: 3, survival: 0, efficiency: 3 },
  // Absorb punishment and stay standing.
  tank: { reliability: 2, offense: 1, survival: 3, efficiency: 1 },
  // A balanced all-rounder.
  generalist: { reliability: 1, offense: 1, survival: 1, efficiency: 1 },
  // Lock down enemies: the control axis carries the weight.
  controller: { reliability: 1, offense: 1, survival: 1, control: 3, efficiency: 1 },
  // Keep the party standing: healing (and other support) over personal offense.
  healer: { reliability: 2, offense: 0, survival: 1, support: 3, efficiency: 1 },
  // Make the party hit harder: buffs (support) plus a little of everything.
  buffer: { reliability: 1, offense: 1, survival: 1, control: 1, support: 3, efficiency: 1 },
};

/**
 * The subset of roles whose signal lives only in the party harness (support and
 * control axes). Kept as a named set so a solo-martial run can warn that ranking
 * for these needs a party-context report.
 */
export const PARTY_ONLY_ROLES: readonly string[] = ['healer', 'buffer', 'controller'];

export function roleWeights(role: string): RoleWeights {
  const w = ROLE_WEIGHTS[role];
  if (!w) throw new Error(`unknown role: ${role}`);
  return w;
}

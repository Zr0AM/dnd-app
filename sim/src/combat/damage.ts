// Damage mitigation math (SRD "Resistance and Vulnerability", "Immunity").
//
// Order of operations, from the SRD worked example: flat reductions first, then
// halve for Resistance (round down), then double for Vulnerability. Immunity
// zeroes the damage outright. Multiple instances of the same kind count once,
// which a per-type response map enforces by construction.

import type { DamageResponse, DamageType } from '../core/types';

/**
 * A creature's response to each damage type (absent = normal). One response per
 * type: the SRD's contrived "resistant to all AND vulnerable to one type" case
 * (net halve-then-double, differing only by a rounding point) is out of scope —
 * no SRD monster has it. If a future creature needs it, split into independent
 * resistant/vulnerable flags.
 */
export type DamageResponses = Partial<Record<DamageType, DamageResponse>>;

/**
 * Final damage of one type after flat reductions and the resistance/vulnerability
 * /immunity pipeline. `flatReduction` is any pre-mitigation subtraction (e.g. a
 * damage-reducing aura); it never takes the result below zero on its own.
 */
export function mitigate(
  amount: number,
  type: DamageType,
  responses: DamageResponses,
  flatReduction = 0,
): number {
  if (amount <= 0) return 0;
  const response = responses[type] ?? 'normal';
  if (response === 'immune') return 0;

  let dmg = Math.max(0, amount - flatReduction);
  if (response === 'resistant') dmg = Math.floor(dmg / 2);
  if (response === 'vulnerable') dmg = dmg * 2;
  return dmg;
}

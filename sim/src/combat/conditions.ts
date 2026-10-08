// Mechanical effects of the 15 conditions (SRD Rules Glossary), reduced to the
// queries the combat engine needs: how a condition changes attack rolls, saves,
// speed, the ability to act, and critical hits.
//
// The 2024 advantage rule is central: advantage and disadvantage do not stack,
// and any single source of each cancels the other to a normal roll. So the
// attack/save helpers collect whether *any* source grants advantage and whether
// *any* grants disadvantage, then net them.

import type { Advantage } from '../dice/dice';
import type { Ability, Condition } from '../core/types';
import type { Combatant } from './actor';

/** Conditions that imply other conditions (SRD: Paralyzed is Incapacitated, etc.). */
const IMPLIES: Readonly<Partial<Record<Condition, readonly Condition[]>>> = {
  paralyzed: ['incapacitated'],
  petrified: ['incapacitated'],
  stunned: ['incapacitated'],
  unconscious: ['incapacitated', 'prone'],
};

/** Expand a creature's conditions to include everything they imply. */
export function effectiveConditions(c: Combatant): Set<Condition> {
  const out = new Set<Condition>(c.conditionList);
  // One pass suffices: no implied condition itself implies another not already present.
  for (const cond of [...out]) {
    for (const implied of IMPLIES[cond] ?? []) out.add(implied);
  }
  return out;
}

/** The conditions that make a creature unable to act (Incapacitated and friends). */
export function isIncapacitated(c: Combatant): boolean {
  return effectiveConditions(c).has('incapacitated');
}

/** Can the creature take actions, bonus actions? (Not while Incapacitated.) */
export function canAct(c: Combatant): boolean {
  return c.isConscious && !isIncapacitated(c);
}

/** Can the creature take a Reaction? (Not while Incapacitated.) */
export function canReact(c: Combatant): boolean {
  return c.isConscious && !isIncapacitated(c);
}

/** Net advantage state (combine two sources per the no-stacking rule). */
function net(advantage: boolean, disadvantage: boolean): Advantage {
  if (advantage === disadvantage) return 'normal';
  return advantage ? 'advantage' : 'disadvantage';
}

/**
 * The advantage state of an attack roll from `attacker` against `defender`,
 * from conditions alone. `attackerWithin5` affects Prone (melee vs. ranged).
 * Other sources (cover, Reckless Attack, hidden) are layered in by the caller.
 */
export function attackAdvantage(
  attacker: Combatant,
  defender: Combatant,
  attackerWithin5: boolean,
): Advantage {
  const atk = effectiveConditions(attacker);
  const def = effectiveConditions(defender);
  let adv = false;
  let dis = false;

  // The attacker's own condition penalizes its attacks.
  if (atk.has('blinded') || atk.has('frightened') || atk.has('poisoned') || atk.has('restrained')) {
    dis = true;
  }
  if (atk.has('prone')) dis = true; // a prone attacker has disadvantage on attacks
  if (atk.has('invisible')) adv = true;

  // The defender's condition exposes it to attackers.
  if (
    def.has('blinded') ||
    def.has('paralyzed') ||
    def.has('petrified') ||
    def.has('restrained') ||
    def.has('stunned') ||
    def.has('unconscious')
  ) {
    adv = true;
  }
  if (def.has('invisible')) dis = true;
  if (def.has('prone')) {
    if (attackerWithin5) adv = true;
    else dis = true;
  }

  return net(adv, dis);
}

/**
 * Any attack that hits is a Critical Hit when the defender is Paralyzed or
 * Unconscious and the attacker is within 5 feet (SRD). Petrified and Stunned
 * grant advantage but not auto-crits.
 */
export function isAutoCritTarget(defender: Combatant, attackerWithin5: boolean): boolean {
  if (!attackerWithin5) return false;
  const def = effectiveConditions(defender);
  return def.has('paralyzed') || def.has('unconscious');
}

/** Does the creature automatically fail a save of this ability? (Str/Dex while inert.) */
export function autoFailsSave(c: Combatant, ability: Ability): boolean {
  if (ability !== 'str' && ability !== 'dex') return false;
  const cond = effectiveConditions(c);
  return (
    cond.has('paralyzed') || cond.has('petrified') || cond.has('stunned') || cond.has('unconscious')
  );
}

/** Advantage state of a saving throw from conditions (Restrained → Dex disadvantage). */
export function saveAdvantage(c: Combatant, ability: Ability): Advantage {
  const cond = effectiveConditions(c);
  const dis = ability === 'dex' && cond.has('restrained');
  return net(false, dis);
}

/** The flat penalty Exhaustion applies to every D20 Test: -2 per level. */
export function exhaustionD20Penalty(c: Combatant): number {
  return -2 * c.exhaustionLevel;
}

/**
 * The creature's effective Speed in feet after conditions: 0 while movement is
 * locked (Grappled, Restrained, and the inert conditions), reduced by 5 per
 * Exhaustion level otherwise. Prone does not zero Speed (you can still crawl or
 * stand), so it is not handled here; the movement system applies its cost.
 */
export function effectiveSpeedFt(c: Combatant): number {
  const cond = effectiveConditions(c);
  if (
    cond.has('grappled') ||
    cond.has('restrained') ||
    cond.has('paralyzed') ||
    cond.has('petrified') ||
    cond.has('stunned') ||
    cond.has('unconscious')
  ) {
    return 0;
  }
  return Math.max(0, c.speedFt - 5 * c.exhaustionLevel);
}

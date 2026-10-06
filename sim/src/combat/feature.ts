// The feature runtime: the hooks a class feature, feat, or item effect uses to
// influence combat. This is the TypeScript interface the declarative effect
// format (effect-format spec) ultimately compiles to; the first features (Rage,
// Sneak Attack, Reckless Attack) are implemented directly against it.
//
// A Feature instance belongs to one combatant and may hold per-turn state. The
// encounter calls its hooks at the right moments: start of turn, when the owner
// makes an attack (outgoing modifiers), when the owner hits (damage riders), when
// something attacks the owner (granting advantage), and when the owner takes
// damage (dynamic resistance).

import type { Advantage } from '../dice/dice';
import type { DamageType } from '../core/types';
import type { AttackProfile, ExtraDamage } from './attack';
import type { Combatant } from './actor';

/** Modifiers a feature contributes to the owner's outgoing attack roll. */
export interface OutgoingAttackMods {
  readonly advantage?: boolean;
  readonly disadvantage?: boolean;
  readonly toHit?: number;
}

/** Context for an on-hit damage rider. */
export interface OnHitContext {
  readonly self: Combatant;
  readonly target: Combatant;
  readonly weapon: AttackProfile;
  readonly crit: boolean;
  /** The advantage state the attack roll was actually made with. */
  readonly rollAdvantage: Advantage;
  /** An ally of the attacker (not incapacitated) is within 5 ft of the target. */
  readonly allyAdjacentToTarget: boolean;
}

export interface Feature {
  readonly id: string;
  /** Start of the owner's turn: reset per-turn state, auto-activate, etc. */
  onTurnStart?(self: Combatant): void;
  /** Modify the owner's attack against `target` with `weapon`. */
  outgoingAttack?(
    self: Combatant,
    target: Combatant,
    weapon: AttackProfile,
  ): OutgoingAttackMods | null;
  /** Extra damage components applied when the owner hits. May consume once-per-turn state. */
  onHit?(ctx: OnHitContext): ExtraDamage[];
  /** Whether attacks against the owner currently have advantage (e.g. Reckless Attack). */
  grantsAttackersAdvantage?(self: Combatant): boolean;
  /** Whether the owner currently resists this damage type (e.g. Rage). */
  resistsDamage?(self: Combatant, type: DamageType): boolean;
}

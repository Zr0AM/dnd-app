// The first class features, implemented against the feature runtime: Rage,
// Reckless Attack, Sneak Attack. These are the martial features that define
// Barbarian and Rogue at low levels. Each is a small stateful object attached to
// a combatant by the character compiler.
//
// Documented simplifications (consistent with the effect-format fidelity tiers):
// - Rage auto-activates on the owner's first turn if a use is available, and
//   stays active for the rest of the fight (the extend-each-turn rule almost
//   always keeps it up in combat; the duration/extension bookkeeping arrives with
//   the full effect system). Its damage bonus is applied to melee attacks, which
//   assumes Strength-based melee for these builds.
// - Reckless Attack is taken whenever the owner makes a melee attack (the shared
//   AI will later decide); it grants the owner advantage on those attacks and
//   gives attackers advantage until the owner's next turn.
// - Sneak Attack is exact: once per turn, on a qualifying weapon, when the roll
//   had advantage or an ally is adjacent to the target and the roll was not at
//   disadvantage.
// - Colossus Slayer (Hunter Ranger) is exact: once per turn, +1d8 when the owner
//   hits a creature that is missing any Hit Points. (Hunter's Mark, the Ranger's
//   other sustained-damage source, needs marked-target + concentration bookkeeping
//   and is left for a later slice.)

import { dice } from '../dice/dice';
import type { DamageType } from '../core/types';
import type { AttackProfile, ExtraDamage } from '../combat/attack';
import type { Combatant } from '../combat/actor';
import type { Feature, OnHitContext, OutgoingAttackMods } from '../combat/feature';

const RAGE_RESISTED: readonly DamageType[] = ['bludgeoning', 'piercing', 'slashing'];

/** Rage: resistance to B/P/S and a damage bonus on melee attacks while raging. */
export class RageFeature implements Feature {
  readonly id = 'rage';
  private raging = false;
  constructor(private readonly damageBonus: number) {}

  onTurnStart(self: Combatant): void {
    if (!this.raging && self.spendResource('rage', 1)) this.raging = true;
  }

  resistsDamage(_self: Combatant, type: DamageType): boolean {
    return this.raging && RAGE_RESISTED.includes(type);
  }

  onHit(ctx: OnHitContext): ExtraDamage[] {
    if (!this.raging || ctx.weapon.kind !== 'melee') return [];
    return [{ damage: dice(0, 1, this.damageBonus), type: ctx.weapon.damageType }];
  }

  get isRaging(): boolean {
    return this.raging;
  }
}

/** Reckless Attack: advantage on the owner's melee attacks, advantage to attackers. */
export class RecklessAttackFeature implements Feature {
  readonly id = 'reckless-attack';
  private activeUntilNextTurn = false;

  onTurnStart(): void {
    // The window ("until the start of your next turn") closes as the turn begins.
    this.activeUntilNextTurn = false;
  }

  outgoingAttack(
    _self: Combatant,
    _target: Combatant,
    weapon: AttackProfile,
  ): OutgoingAttackMods | null {
    if (weapon.kind !== 'melee') return null;
    this.activeUntilNextTurn = true; // attacking recklessly
    return { advantage: true };
  }

  grantsAttackersAdvantage(): boolean {
    return this.activeUntilNextTurn;
  }
}

/** Sneak Attack: once per turn, extra dice on a qualifying attack. */
export class SneakAttackFeature implements Feature {
  readonly id = 'sneak-attack';
  private usedThisTurn = false;
  constructor(private readonly diceCount: number) {}

  onTurnStart(): void {
    this.usedThisTurn = false;
  }

  onHit(ctx: OnHitContext): ExtraDamage[] {
    if (this.usedThisTurn) return [];
    const qualifies = ctx.weapon.kind === 'ranged' || ctx.weapon.finesse === true;
    if (!qualifies) return [];
    const eligible =
      ctx.rollAdvantage === 'advantage' ||
      (ctx.allyAdjacentToTarget && ctx.rollAdvantage !== 'disadvantage');
    if (!eligible) return [];
    this.usedThisTurn = true;
    return [{ damage: dice(this.diceCount, 6), type: ctx.weapon.damageType }];
  }
}

/** Colossus Slayer (Hunter Ranger): once per turn, +1d8 to a hit on a wounded target. */
export class ColossusSlayerFeature implements Feature {
  readonly id = 'colossus-slayer';
  private usedThisTurn = false;

  onTurnStart(): void {
    this.usedThisTurn = false;
  }

  onHit(ctx: OnHitContext): ExtraDamage[] {
    if (this.usedThisTurn) return [];
    // Only a target already missing Hit Points qualifies.
    if (ctx.target.hp >= ctx.target.maxHp) return [];
    this.usedThisTurn = true;
    return [{ damage: dice(1, 8), type: ctx.weapon.damageType }];
  }
}

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
import type { Feature, HitEffect, OnHitContext, OutgoingAttackMods } from '../combat/feature';

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

/**
 * Divine Smite (Paladin): once per turn, on a melee hit, spend the lowest available
 * spell slot to deal radiant damage — 2d8, plus 1d8 per slot level above 1st. A
 * documented simplification: it fires on the first melee hit of the turn with a
 * slot to spend (it does not hold the smite for a later crit), and the +1d8 vs.
 * Fiends/Undead is omitted (combatants carry no creature type yet). Because the
 * heal/buff steps run before attacks, those spells get first call on the slots.
 */
export class DivineSmiteFeature implements Feature {
  readonly id = 'divine-smite';
  private usedThisTurn = false;

  onTurnStart(): void {
    this.usedThisTurn = false;
  }

  onHit(ctx: OnHitContext): ExtraDamage[] {
    if (this.usedThisTurn || ctx.weapon.kind !== 'melee') return [];
    const level = ctx.self.availableSlotLevels()[0];
    if (level === undefined || !ctx.self.spendSlot(level)) return [];
    this.usedThisTurn = true;
    const diceCount = 2 + Math.max(0, level - 1);
    return [{ damage: dice(diceCount, 8), type: 'radiant' }];
  }
}

/**
 * Martial Arts + Flurry of Blows (Monk): one free bonus-action unarmed strike each
 * turn, and — when the monk can spare a Focus point — Flurry of Blows spends 1 Focus
 * for a second bonus strike. Both are made with the monk's unarmed weapon through
 * the engine's extra-attack channel. To avoid starving Stunning Strike (which also
 * costs Focus), the monk flurries only while it holds more than one point, keeping
 * one in reserve for a stun.
 */
export class MartialArtsFeature implements Feature {
  readonly id = 'martial-arts';
  private flurryThisTurn = false;

  onTurnStart(self: Combatant): void {
    // Flurry if we can keep a point in reserve for Stunning Strike.
    this.flurryThisTurn = self.resourceCount('focus') > 1 && self.spendResource('focus', 1);
  }

  bonusAttackActions(): number {
    return 1 + (this.flurryThisTurn ? 1 : 0);
  }
}

/**
 * Stunning Strike (Monk): once per turn, on a melee hit, spend 1 Focus to force a
 * Constitution save (DC 8 + proficiency + Wisdom) or the target is Stunned until
 * the start of the monk's next turn (~1 round). Denying that turn feeds the control
 * metric, attributed to the monk.
 */
export class StunningStrikeFeature implements Feature {
  readonly id = 'stunning-strike';
  private usedThisTurn = false;

  onTurnStart(): void {
    this.usedThisTurn = false;
  }

  onHitEffect(ctx: OnHitContext): HitEffect | null {
    if (this.usedThisTurn || ctx.weapon.kind !== 'melee') return null;
    if (!ctx.self.spendResource('focus', 1)) return null;
    this.usedThisTurn = true;
    const dc = 8 + ctx.self.proficiencyBonus + ctx.self.abilityMod('wis');
    return { save: 'con', dc, condition: 'stunned', rounds: 1 };
  }
}

/**
 * Wild Shape (Druid) — a simplified combat model. As a Bonus Action (here, at the
 * start of a turn while it has a use), the druid slips into a resilient animal form,
 * gaining a pool of temporary Hit Points that stands in for the beast's durability;
 * it re-forms when that buffer is gone and a use remains. The full beast stat-block
 * swap (the form's own attacks, AC, speed and senses) is a documented simplification
 * left out — only the defensive buffer is modeled, which is Wild Shape's main
 * low-level combat effect.
 */
export class WildShapeFeature implements Feature {
  readonly id = 'wild-shape';
  constructor(private readonly formHp: number) {}

  onTurnStart(self: Combatant): void {
    if (self.tempHp > 0) return; // still in a form with HP to spare
    if (self.spendResource('wild-shape', 1)) self.grantTempHp(this.formHp);
  }
}

/**
 * Dark One's Blessing (Fiend Warlock): when the warlock reduces an enemy to 0 HP,
 * it gains temporary Hit Points equal to its Charisma modifier + its level.
 */
export class DarkOnesBlessingFeature implements Feature {
  readonly id = 'dark-ones-blessing';
  onKill(self: Combatant): void {
    self.grantTempHp(Math.max(1, self.abilityMod('cha') + self.level));
  }
}

/**
 * Hunter's Mark (Ranger): while the ranger concentrates on the mark, every hit it
 * lands on the marked creature deals an extra 1d6 Force damage. The mark is placed
 * through the engine (TurnApi.markTarget), sustained by concentration, and this
 * rider reads the owner's markedTarget. Moving the mark to a new creature when the
 * first dies is a documented simplification left out (the mark stays put).
 */
export class HuntersMarkFeature implements Feature {
  readonly id = 'hunters-mark';
  onHit(ctx: OnHitContext): ExtraDamage[] {
    if (ctx.self.markedTarget !== ctx.target.id) return [];
    return [{ damage: dice(1, 6), type: 'force' }];
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

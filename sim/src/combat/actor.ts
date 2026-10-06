// The combatant model: the mutable state of one creature in a fight, plus the
// SRD rules for taking damage, healing, temporary Hit Points, and the 0-HP /
// death-save pipeline. Attack/save *rolls* live in attack.ts; this module owns
// what happens to a creature's HP and life state as a result.

import { rollD20 } from '../dice/dice';
import type { Rng } from '../rng/rng';
import {
  abilityModifier,
  proficiencyBonus,
  type Ability,
  type Condition,
  type Size,
} from '../core/types';
import type { Cell } from '../grid/grid';
import type { DamageResponse } from '../core/types';
import type { DamageType } from '../core/types';
import type { DamageResponses } from './damage';
import type { AttackProfile } from './attack';
import type { Feature } from './feature';

export type Side = 'party' | 'enemy';

export interface CombatantSpec {
  readonly id: string;
  readonly name: string;
  readonly side: Side;
  readonly level: number;
  readonly size?: Size;
  readonly abilities: Readonly<Record<Ability, number>>;
  readonly ac: number;
  readonly maxHp: number;
  readonly speedFt?: number;
  readonly saveProficiencies?: readonly Ability[];
  /** Explicit save bonuses (e.g. monster stat-block saves), overriding the computed value. */
  readonly saveBonuses?: Partial<Record<Ability, number>>;
  readonly damageResponses?: DamageResponses;
  readonly position?: Cell;
  readonly attacks?: readonly AttackProfile[];
  readonly features?: readonly Feature[];
  /** Extra weapon attacks granted by Extra Attack (0 below level 5 for martials). */
  readonly extraAttacks?: number;
  /** Starting resource pools (id -> max + recharge), e.g. Rage uses. */
  readonly resources?: readonly ResourceSpec[];
}

export interface ResourceSpec {
  readonly id: string;
  readonly max: number;
  readonly rechargeShort?: number | 'all';
  readonly rechargeLong?: number | 'all';
}

interface ResourcePool {
  current: number;
  readonly max: number;
  readonly rechargeShort: number | 'all';
  readonly rechargeLong: number | 'all';
}

/** What happened when a creature took damage, for events and metrics. */
export interface DamageOutcome {
  /** HP actually removed from the HP pool (after temp HP absorption). */
  readonly hpLost: number;
  /** Damage absorbed by temporary Hit Points. */
  readonly absorbedByTemp: number;
  /** The creature dropped to 0 HP on this hit. */
  readonly dropped: boolean;
  /** The creature died outright (massive damage or third death-save failure). */
  readonly died: boolean;
  /** Death-save failures incurred by taking damage while already at 0 HP. */
  readonly deathSaveFailures: number;
}

export interface DeathSaveOutcome {
  readonly d20: number;
  readonly success: boolean;
  readonly stabilized: boolean;
  readonly died: boolean;
  readonly revived: boolean;
}

export class Combatant {
  readonly id: string;
  readonly name: string;
  readonly side: Side;
  readonly level: number;
  readonly size: Size;
  readonly abilities: Readonly<Record<Ability, number>>;
  readonly ac: number;
  readonly maxHp: number;
  readonly speedFt: number;
  readonly proficiencyBonus: number;
  private readonly saveProf: ReadonlySet<Ability>;
  private readonly saveOverride: Partial<Record<Ability, number>>;
  readonly damageResponses: DamageResponses;
  readonly attacks: readonly AttackProfile[];
  readonly features: readonly Feature[];
  readonly extraAttacks: number;
  private readonly pools = new Map<string, ResourcePool>();

  hp: number;
  tempHp = 0;
  position: Cell;
  private readonly conditions = new Set<Condition>();

  // Exhaustion is level-based (0-6); the "exhaustion" condition is present when > 0.
  exhaustionLevel = 0;

  // Death-save state (meaningful only while at 0 HP and not dead).
  deathSuccesses = 0;
  deathFailures = 0;
  stable = false;
  dead = false;

  constructor(spec: CombatantSpec) {
    this.id = spec.id;
    this.name = spec.name;
    this.side = spec.side;
    this.level = spec.level;
    this.size = spec.size ?? 'medium';
    this.abilities = { ...spec.abilities };
    this.ac = spec.ac;
    this.maxHp = spec.maxHp;
    this.hp = spec.maxHp;
    this.speedFt = spec.speedFt ?? 30;
    this.proficiencyBonus = proficiencyBonus(spec.level);
    this.saveProf = new Set(spec.saveProficiencies ?? []);
    this.saveOverride = { ...spec.saveBonuses };
    this.damageResponses = { ...spec.damageResponses };
    this.position = spec.position ?? { x: 0, y: 0 };
    this.attacks = spec.attacks ? [...spec.attacks] : [];
    this.features = spec.features ? [...spec.features] : [];
    this.extraAttacks = spec.extraAttacks ?? 0;
    for (const r of spec.resources ?? []) {
      this.pools.set(r.id, {
        current: r.max,
        max: r.max,
        rechargeShort: r.rechargeShort ?? 0,
        rechargeLong: r.rechargeLong ?? 'all',
      });
    }
  }

  /** How many uses of a resource remain (0 if the pool is undefined). */
  resourceCount(id: string): number {
    return this.pools.get(id)?.current ?? 0;
  }

  /** Spend `n` of a resource if available; returns whether it was spent. */
  spendResource(id: string, n = 1): boolean {
    const pool = this.pools.get(id);
    if (!pool || pool.current < n) return false;
    pool.current -= n;
    return true;
  }

  private recharge(which: 'rechargeShort' | 'rechargeLong'): void {
    for (const pool of this.pools.values()) {
      const amount = pool[which];
      pool.current = amount === 'all' ? pool.max : Math.min(pool.max, pool.current + amount);
    }
  }

  /** Restore short-rest resources. */
  shortRest(): void {
    this.recharge('rechargeShort');
  }

  /** Restore long-rest (and short-rest) resources, and reset exhaustion by one step is not done here. */
  longRest(): void {
    this.recharge('rechargeShort');
    this.recharge('rechargeLong');
  }

  /**
   * The effective response to a damage type, combining static defenses with any
   * feature-granted resistance (e.g. Rage). Static immunity or vulnerability wins;
   * otherwise a feature resistance upgrades a normal response to resistant.
   */
  damageResponseFor(type: DamageType): DamageResponse {
    const base = this.damageResponses[type] ?? 'normal';
    if (base === 'immune' || base === 'vulnerable' || base === 'resistant') return base;
    for (const f of this.features) {
      if (f.resistsDamage?.(this, type)) return 'resistant';
    }
    return 'normal';
  }

  abilityMod(ability: Ability): number {
    return abilityModifier(this.abilities[ability]);
  }

  saveBonus(ability: Ability): number {
    const override = this.saveOverride[ability];
    if (override !== undefined) return override;
    return this.abilityMod(ability) + (this.saveProf.has(ability) ? this.proficiencyBonus : 0);
  }

  /** Alive and above 0 HP (not unconscious). */
  get isConscious(): boolean {
    return !this.dead && this.hp > 0;
  }

  /** Not dead (may be unconscious at 0 HP). */
  get isAlive(): boolean {
    return !this.dead;
  }

  /** At 0 HP, not dead: unconscious and dying (or stable). */
  get isDying(): boolean {
    return !this.dead && this.hp === 0;
  }

  hasCondition(c: Condition): boolean {
    if (c === 'unconscious') return this.isDying || this.conditions.has('unconscious');
    if (c === 'exhaustion') return this.exhaustionLevel > 0;
    return this.conditions.has(c);
  }

  addCondition(c: Condition): void {
    this.conditions.add(c);
  }

  removeCondition(c: Condition): void {
    this.conditions.delete(c);
  }

  /** Raise exhaustion by `n` levels; at level 6 the creature dies. */
  gainExhaustion(n = 1): void {
    this.exhaustionLevel = Math.max(0, Math.min(6, this.exhaustionLevel + n));
    if (this.exhaustionLevel >= 6) this.dead = true;
  }

  get conditionList(): Condition[] {
    const list = [...this.conditions];
    if (this.isDying && !this.conditions.has('unconscious')) list.push('unconscious');
    if (this.exhaustionLevel > 0 && !this.conditions.has('exhaustion')) list.push('exhaustion');
    return list;
  }

  /** Grant temporary HP. Temp HP does not stack; the larger pool wins. */
  grantTempHp(amount: number): void {
    if (amount > this.tempHp) this.tempHp = amount;
  }

  /**
   * Apply `amount` damage (already mitigated for type). `critical` matters only
   * when the creature is at 0 HP, where a crit inflicts two death-save failures.
   */
  takeDamage(amount: number, opts: { critical?: boolean } = {}): DamageOutcome {
    const none: DamageOutcome = {
      hpLost: 0,
      absorbedByTemp: 0,
      dropped: false,
      died: false,
      deathSaveFailures: 0,
    };
    if (this.dead || amount <= 0) return none;

    // Damage taken while already at 0 HP causes death-save failures, not HP loss.
    if (this.hp === 0) {
      const fails = opts.critical ? 2 : 1;
      this.stable = false;
      if (amount >= this.maxHp) {
        this.dead = true;
        return { ...none, died: true, deathSaveFailures: fails };
      }
      this.deathFailures += fails;
      const died = this.deathFailures >= 3;
      if (died) this.dead = true;
      return { ...none, died, deathSaveFailures: fails };
    }

    const absorbedByTemp = Math.min(this.tempHp, amount);
    this.tempHp -= absorbedByTemp;
    const toHp = amount - absorbedByTemp;
    const newHp = this.hp - toHp;

    if (newHp > 0) {
      this.hp = newHp;
      return { hpLost: toHp, absorbedByTemp, dropped: false, died: false, deathSaveFailures: 0 };
    }

    // Reduced to 0. Massive damage: if the overflow equals or exceeds max HP, die.
    const overflow = -newHp;
    this.hp = 0;
    if (overflow >= this.maxHp) {
      this.dead = true;
      return {
        hpLost: this.maxHp,
        absorbedByTemp,
        dropped: true,
        died: true,
        deathSaveFailures: 0,
      };
    }
    // Drop to 0: unconscious, death saves reset.
    this.deathSuccesses = 0;
    this.deathFailures = 0;
    this.stable = false;
    this.conditions.delete('unconscious'); // represented by isDying
    return { hpLost: toHp, absorbedByTemp, dropped: true, died: false, deathSaveFailures: 0 };
  }

  /** Restore HP. Healing from 0 revives: clears dying/stable and resets death saves. */
  heal(amount: number): number {
    if (this.dead || amount <= 0) return 0;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    const healed = this.hp - before;
    if (before === 0 && this.hp > 0) {
      this.deathSuccesses = 0;
      this.deathFailures = 0;
      this.stable = false;
      this.conditions.delete('unconscious');
    }
    return healed;
  }

  /** Stabilize a dying creature (e.g. a successful Medicine check). */
  stabilize(): void {
    if (this.isDying) this.stable = true;
  }

  /**
   * Roll a death saving throw (made at the start of a turn spent at 0 HP). 10+
   * succeeds; a natural 20 revives at 1 HP; a natural 1 is two failures; three
   * successes stabilize; three failures kill.
   */
  rollDeathSave(rng: Rng): DeathSaveOutcome {
    if (!this.isDying || this.stable) {
      return { d20: 0, success: false, stabilized: this.stable, died: this.dead, revived: false };
    }
    const d20 = rollD20(rng);
    if (d20 === 20) {
      this.heal(1);
      return { d20, success: true, stabilized: false, died: false, revived: true };
    }
    if (d20 === 1) {
      this.deathFailures += 2;
    } else if (d20 >= 10) {
      this.deathSuccesses += 1;
    } else {
      this.deathFailures += 1;
    }
    if (this.deathFailures >= 3) {
      this.dead = true;
      return { d20, success: false, stabilized: false, died: true, revived: false };
    }
    if (this.deathSuccesses >= 3) {
      this.stable = true;
      return { d20, success: d20 >= 10, stabilized: true, died: false, revived: false };
    }
    return { d20, success: d20 >= 10, stabilized: false, died: false, revived: false };
  }
}

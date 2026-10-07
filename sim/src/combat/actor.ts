// The combatant model: the mutable state of one creature in a fight, plus the
// SRD rules for taking damage, healing, temporary Hit Points, and the 0-HP /
// death-save pipeline. Attack/save *rolls* live in attack.ts; this module owns
// what happens to a creature's HP and life state as a result.

import { rollD20, type Dice } from '../dice/dice';
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
import type { Spell } from './spell';

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
  readonly spellcasting?: SpellcastingSpec;
}

export interface SpellcastingSpec {
  readonly ability: Ability;
  /** Spell slots by spell level, e.g. [{ level: 1, count: 4 }, { level: 2, count: 2 }]. */
  readonly slots: readonly { readonly level: number; readonly count: number }[];
  readonly cantrips: readonly Spell[];
  readonly spells: readonly Spell[];
  /** Warlock Pact Magic: slots recharge on a Short Rest, not only a Long Rest. */
  readonly shortRestSlots?: boolean;
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

/** A condition applied for a duration, able to be shaken off by a repeat save. */
export interface ActiveCondition {
  readonly condition: Condition;
  /** The combatant id that caused this (for control-metric attribution). */
  readonly source: string;
  roundsLeft: number;
  /** A save the victim repeats to end the effect early. */
  readonly repeatSave?: {
    readonly ability: Ability;
    readonly dc: number;
    readonly endsOnSuccess: boolean;
  };
  /** The caster id whose concentration sustains this, if any. */
  readonly concentrationOwner?: string;
}

/** A beneficial effect placed on a creature for a duration (Bless, Haste). */
export interface ActiveBuff {
  /** Stable id so re-applying the same buff refreshes rather than stacks. */
  readonly id: string;
  /** The caster id that granted this (for support-metric attribution). */
  readonly source: string;
  roundsLeft: number;
  /** Dice added to the recipient's attack rolls (rolled per attack by the engine). */
  readonly attackBonusDice?: Dice;
  /** Dice added to the recipient's saving throws (rolled per save by the engine). */
  readonly saveBonusDice?: Dice;
  /** Flat bonus to Armor Class. */
  readonly acBonus?: number;
  /** Grants one extra action usable only for a single weapon attack. */
  readonly extraAttackAction?: boolean;
  /** The caster id whose concentration sustains this, if any. */
  readonly concentrationOwner?: string;
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

  // Spellcasting (undefined for non-casters).
  readonly spellAbility?: Ability;
  readonly cantrips: readonly Spell[] = [];
  readonly spells: readonly Spell[] = [];
  private readonly slots = new Map<number, { current: number; max: number }>();
  /** Pact Magic: spell slots recharge on a Short Rest (Warlock). */
  private readonly shortRestSlots: boolean;
  /** The spell this creature is concentrating on, if any (by spell id). */
  concentratingOn: string | null = null;
  /** The id of the creature this one has marked (Hunter's Mark), if any. */
  markedTarget: string | null = null;
  /** The active Wild Shape form (overriding AC and attack), or null when not shaped. */
  activeForm: { readonly ac: number; readonly attack: AttackProfile } | null = null;

  hp: number;
  tempHp = 0;
  position: Cell;
  private readonly conditions = new Set<Condition>();
  /** Conditions applied for a duration, with repeat-save and attribution info. */
  private readonly timed: ActiveCondition[] = [];
  /** Beneficial effects (Bless, Haste) active on this creature. */
  private readonly buffs: ActiveBuff[] = [];

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
    this.shortRestSlots = spec.spellcasting?.shortRestSlots ?? false;
    if (spec.spellcasting) {
      this.spellAbility = spec.spellcasting.ability;
      this.cantrips = [...spec.spellcasting.cantrips];
      this.spells = [...spec.spellcasting.spells];
      for (const s of spec.spellcasting.slots) {
        this.slots.set(s.level, { current: s.count, max: s.count });
      }
    }
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

  /** Spell save DC: 8 + proficiency + spellcasting modifier. */
  spellSaveDc(): number {
    if (!this.spellAbility) return 0;
    return 8 + this.proficiencyBonus + this.abilityMod(this.spellAbility);
  }

  /** Spell attack bonus: proficiency + spellcasting modifier. */
  spellAttackBonus(): number {
    if (!this.spellAbility) return 0;
    return this.proficiencyBonus + this.abilityMod(this.spellAbility);
  }

  /** Remaining slots of a given spell level. */
  slotCount(level: number): number {
    return this.slots.get(level)?.current ?? 0;
  }

  /** The spell levels (ascending) that currently have at least one slot. */
  availableSlotLevels(): number[] {
    return [...this.slots.entries()]
      .filter(([, v]) => v.current > 0)
      .map(([level]) => level)
      .sort((a, b) => a - b);
  }

  /** Spend one slot of the given level; returns whether a slot was available. */
  spendSlot(level: number): boolean {
    const pool = this.slots.get(level);
    if (!pool || pool.current <= 0) return false;
    pool.current -= 1;
    return true;
  }

  /** Restore all spell slots (a long rest). */
  restoreSlots(): void {
    for (const pool of this.slots.values()) pool.current = pool.max;
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

  /** Restore short-rest resources (and Pact Magic slots, for a Warlock). */
  shortRest(): void {
    this.recharge('rechargeShort');
    if (this.shortRestSlots) this.restoreSlots();
  }

  /** Restore long-rest (and short-rest) resources, and reset exhaustion by one step is not done here. */
  longRest(): void {
    this.recharge('rechargeShort');
    this.recharge('rechargeLong');
    this.restoreSlots();
    this.concentratingOn = null;
    this.markedTarget = null;
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

  /** Apply a condition for a duration, with optional repeat save and concentration link. */
  applyTimedCondition(spec: Omit<ActiveCondition, 'roundsLeft'> & { rounds: number }): void {
    this.conditions.add(spec.condition);
    this.timed.push({
      condition: spec.condition,
      source: spec.source,
      roundsLeft: spec.rounds,
      repeatSave: spec.repeatSave,
      concentrationOwner: spec.concentrationOwner,
    });
  }

  /** The source ids of any active timed conditions that stop this creature acting. */
  controlSources(): string[] {
    const disabling: Condition[] = ['paralyzed', 'stunned', 'incapacitated', 'unconscious'];
    return this.timed.filter((t) => disabling.includes(t.condition)).map((t) => t.source);
  }

  /** Remove the base flag for a condition if no remaining timed entry grants it. */
  private syncConditionFlag(c: Condition): void {
    if (!this.timed.some((t) => t.condition === c)) this.conditions.delete(c);
  }

  /**
   * End-of-turn processing for timed conditions: roll any repeat saves and
   * decrement durations, removing effects that end. Returns the conditions that
   * ended this turn.
   */
  tickTimedConditions(rng: Rng): Condition[] {
    const ended: Condition[] = [];
    for (const t of [...this.timed]) {
      let remove = false;
      if (t.repeatSave) {
        const total = rollD20(rng) + this.saveBonus(t.repeatSave.ability);
        if (t.repeatSave.endsOnSuccess && total >= t.repeatSave.dc) remove = true;
      }
      t.roundsLeft -= 1;
      if (t.roundsLeft <= 0) remove = true;
      if (remove) {
        this.timed.splice(this.timed.indexOf(t), 1);
        this.syncConditionFlag(t.condition);
        ended.push(t.condition);
      }
    }
    return ended;
  }

  /** End all timed conditions sustained by `casterId`'s concentration. */
  endConcentrationConditions(casterId: string): void {
    for (const t of [...this.timed]) {
      if (t.concentrationOwner === casterId) {
        this.timed.splice(this.timed.indexOf(t), 1);
        this.syncConditionFlag(t.condition);
      }
    }
  }

  /** Apply (or refresh) a beneficial buff for a duration. */
  applyBuff(spec: Omit<ActiveBuff, 'roundsLeft'> & { rounds: number }): void {
    const existing = this.buffs.findIndex((b) => b.id === spec.id);
    const buff: ActiveBuff = {
      id: spec.id,
      source: spec.source,
      roundsLeft: spec.rounds,
      attackBonusDice: spec.attackBonusDice,
      saveBonusDice: spec.saveBonusDice,
      acBonus: spec.acBonus,
      extraAttackAction: spec.extraAttackAction,
      concentrationOwner: spec.concentrationOwner,
    };
    // Re-applying the same buff refreshes it rather than stacking (2024 rule).
    if (existing >= 0) this.buffs[existing] = buff;
    else this.buffs.push(buff);
  }

  hasBuff(id: string): boolean {
    return this.buffs.some((b) => b.id === id);
  }

  /** Dice (with their source) to add to each attack roll, from active buffs. */
  buffAttackBonuses(): { readonly dice: Dice; readonly id: string; readonly source: string }[] {
    return this.buffs
      .filter((b) => b.attackBonusDice)
      .map((b) => ({ dice: b.attackBonusDice!, id: b.id, source: b.source }));
  }

  /** Dice (with their source) to add to each saving throw, from active buffs. */
  buffSaveBonuses(): { readonly dice: Dice; readonly id: string; readonly source: string }[] {
    return this.buffs
      .filter((b) => b.saveBonusDice)
      .map((b) => ({ dice: b.saveBonusDice!, id: b.id, source: b.source }));
  }

  /** Net AC bonus from active buffs. */
  buffAcBonus(): number {
    return this.buffs.reduce((sum, b) => sum + (b.acBonus ?? 0), 0);
  }

  /** Armor Class including active buffs (Haste's +2) and any Wild Shape form. */
  effectiveAc(): number {
    const base = this.activeForm ? this.activeForm.ac : this.ac;
    return base + this.buffAcBonus();
  }

  /** The attacks to use right now: the Wild Shape form's natural attack, or the base set. */
  activeAttacks(): readonly AttackProfile[] {
    return this.activeForm ? [this.activeForm.attack] : this.attacks;
  }

  /** Assume a Wild Shape beast form (overrides AC and attack until its HP is gone). */
  enterForm(form: { readonly ac: number; readonly attack: AttackProfile }): void {
    this.activeForm = form;
  }

  /** Whether a buff grants an extra action usable for a single weapon attack. */
  hasExtraAttackAction(): boolean {
    return this.buffs.some((b) => b.extraAttackAction);
  }

  /** The caster ids of buffs currently active on this creature (for attribution). */
  buffSources(): string[] {
    return this.buffs.map((b) => b.source);
  }

  /** The caster id that granted a specific active buff, if present. */
  buffSourceFor(id: string): string | undefined {
    return this.buffs.find((b) => b.id === id)?.source;
  }

  /** End-of-turn decrement of buff durations; returns the ids that ended. */
  tickBuffs(): string[] {
    const ended: string[] = [];
    for (const b of [...this.buffs]) {
      b.roundsLeft -= 1;
      if (b.roundsLeft <= 0) {
        this.buffs.splice(this.buffs.indexOf(b), 1);
        ended.push(b.id);
      }
    }
    return ended;
  }

  /** End all buffs sustained by `casterId`'s concentration. */
  endConcentrationBuffs(casterId: string): void {
    for (const b of [...this.buffs]) {
      if (b.concentrationOwner === casterId) this.buffs.splice(this.buffs.indexOf(b), 1);
    }
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
    // A Wild Shape form ends when its (temporary) Hit Points are used up.
    if (this.activeForm && this.tempHp === 0) this.activeForm = null;
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

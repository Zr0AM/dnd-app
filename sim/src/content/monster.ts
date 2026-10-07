// The monster content compiler: pure translation of seed-database rows into an
// engine-ready MonsterTemplate, which `spawn` turns into a Combatant placed on a
// side and a cell.
//
// It is pure — it takes plain row objects (as the DB produces them) and holds no
// database connection — so it is fully testable with fixtures and can run inside
// a bundle build step. It compiles the structured part of a stat block: AC, HP,
// abilities, saves, damage defenses, speed, and attack actions with their
// (possibly multi-type) damage. Traits, recharge effects, legendary actions and
// multiattack counts are hand-authored in the effect layer (effect-format spec)
// and layered on top via `overrides`; they are not parsed from text here.

import { dice, type Dice } from '../dice/dice';
import { ABILITIES, type Ability, type DamageResponse } from '../core/types';
import { Combatant, type Side } from '../combat/actor';
import type { AttackProfile, ExtraDamage } from '../combat/attack';
import type { DamageResponses } from '../combat/damage';
import type { Cell } from '../grid/grid';
import { abilityById, damageTypeById } from './ids';

// --- Raw row shapes, matching the seed tables we read. ---

export interface MonsterRow {
  readonly monsterSlug: string;
  readonly monsterName: string;
  readonly monsterAc: number;
  readonly monsterHpAvg: number;
  readonly monsterStr: number;
  readonly monsterDex: number;
  readonly monsterCon: number;
  readonly monsterInt: number;
  readonly monsterWis: number;
  readonly monsterCha: number;
  readonly crValue: number;
}

export interface MonsterActionRow {
  readonly monsterActionID: number;
  readonly actionSection: string;
  readonly actionName: string;
  readonly attackKind: 'melee' | 'ranged' | 'melee_or_ranged' | null;
  readonly attackBonus: number | null;
  readonly attackReachFt: number | null;
  readonly attackRangeFt: number | null;
  readonly attackRangeLongFt: number | null;
}

export interface MonsterDamageRow {
  readonly monsterActionID: number;
  readonly damageIndex: number;
  readonly damageDiceCount: number | null;
  readonly damageDiceSides: number | null;
  readonly damageBonus: number | null;
  readonly damageAvg: number;
  readonly damageTypeID: number;
}

export interface MonsterSaveRow {
  readonly abilityID: number;
  readonly saveBonus: number;
}

export interface MonsterDefenseRow {
  readonly defenseKind: string; // 'resistance' | 'vulnerability' | 'immunity'
  readonly damageTypeID: number | null;
  readonly conditionID: number | null;
}

export interface MonsterSpeedRow {
  readonly speedMode: string;
  readonly speedFt: number;
}

/** All rows for one monster, as gathered by a loader. */
export interface MonsterSource {
  readonly monster: MonsterRow;
  readonly actions: readonly MonsterActionRow[];
  readonly damage: readonly MonsterDamageRow[];
  readonly saves?: readonly MonsterSaveRow[];
  readonly defenses?: readonly MonsterDefenseRow[];
  readonly speeds?: readonly MonsterSpeedRow[];
}

/** Hand-authored additions the structured data cannot express. */
export interface MonsterOverrides {
  /** Multiattack as the attack names to repeat and how many times each. */
  readonly multiattack?: readonly { readonly action: string; readonly count: number }[];
  /** Legendary actions per round (a boss acting between other creatures' turns). */
  readonly legendaryActions?: number;
}

/** An engine-ready monster, independent of placement. */
export interface MonsterTemplate {
  readonly slug: string;
  readonly name: string;
  readonly cr: number;
  readonly ac: number;
  readonly maxHp: number;
  readonly abilities: Readonly<Record<Ability, number>>;
  readonly speedFt: number;
  readonly saveBonuses: Partial<Record<Ability, number>>;
  readonly damageResponses: DamageResponses;
  readonly attacks: readonly AttackProfile[];
  readonly multiattack: readonly { readonly action: string; readonly count: number }[];
  /** Legendary actions per round (0 for ordinary monsters). */
  readonly legendaryActions: number;
}

const DEFENSE_TO_RESPONSE: Readonly<Record<string, DamageResponse>> = {
  resistance: 'resistant',
  vulnerability: 'vulnerable',
  immunity: 'immune',
};

/** A damage row to a Dice term: use the dice if present, else a flat average. */
function damageDice(row: MonsterDamageRow): Dice {
  if (row.damageDiceCount && row.damageDiceSides) {
    return dice(row.damageDiceCount, row.damageDiceSides, row.damageBonus ?? 0);
  }
  return dice(0, 1, row.damageAvg); // flat damage via bonus
}

/** Compile one attack action and its damage rows into an AttackProfile. */
function compileAttack(
  action: MonsterActionRow,
  damageRows: readonly MonsterDamageRow[],
): AttackProfile | null {
  if (action.attackKind === null || action.attackBonus === null) return null;
  const rows = damageRows
    .filter((d) => d.monsterActionID === action.monsterActionID)
    .slice()
    .sort((a, b) => a.damageIndex - b.damageIndex);
  if (rows.length === 0) return null;

  // melee_or_ranged is modeled as melee (its in-melee use); range is still recorded.
  const kind: 'melee' | 'ranged' = action.attackKind === 'ranged' ? 'ranged' : 'melee';
  const extra: ExtraDamage[] = rows
    .slice(1)
    .map((r) => ({ damage: damageDice(r), type: damageTypeById(r.damageTypeID) }));

  return {
    name: action.actionName,
    kind,
    reachFt: action.attackReachFt ?? (kind === 'melee' ? 5 : undefined),
    rangeFt: action.attackRangeFt ?? undefined,
    rangeLongFt: action.attackRangeLongFt ?? undefined,
    attackBonus: action.attackBonus,
    damage: damageDice(rows[0]),
    damageType: damageTypeById(rows[0].damageTypeID),
    extraDamage: extra.length > 0 ? extra : undefined,
  };
}

export function compileMonster(
  src: MonsterSource,
  overrides: MonsterOverrides = {},
): MonsterTemplate {
  const m = src.monster;
  const abilities: Record<Ability, number> = {
    str: m.monsterStr,
    dex: m.monsterDex,
    con: m.monsterCon,
    int: m.monsterInt,
    wis: m.monsterWis,
    cha: m.monsterCha,
  };

  const saveBonuses: Partial<Record<Ability, number>> = {};
  for (const s of src.saves ?? []) saveBonuses[abilityById(s.abilityID)] = s.saveBonus;

  const damageResponses: DamageResponses = {};
  for (const d of src.defenses ?? []) {
    const response = DEFENSE_TO_RESPONSE[d.defenseKind];
    if (response && d.damageTypeID !== null) {
      damageResponses[damageTypeById(d.damageTypeID)] = response;
    }
    // Condition immunities (d.conditionID) are recorded by the condition system later.
  }

  const attacks: AttackProfile[] = [];
  for (const a of src.actions) {
    if (a.actionSection !== 'action') continue;
    const profile = compileAttack(a, src.damage);
    if (profile) attacks.push(profile);
  }

  const walk = (src.speeds ?? []).find((s) => s.speedMode === 'walk');

  return {
    slug: m.monsterSlug,
    name: m.monsterName,
    cr: m.crValue,
    ac: m.monsterAc,
    maxHp: m.monsterHpAvg,
    abilities,
    speedFt: walk?.speedFt ?? 30,
    saveBonuses,
    damageResponses,
    attacks,
    multiattack: overrides.multiattack ?? [],
    legendaryActions: overrides.legendaryActions ?? 0,
  };
}

/** Place a compiled monster on the board as a Combatant. */
export function spawnMonster(
  template: MonsterTemplate,
  placement: { readonly id: string; readonly side: Side; readonly position: Cell },
): Combatant {
  // Multiattack is modeled as extra attacks: a monster that makes N attacks a turn
  // gets N-1 extra attacks, which the shared AI resolves with its best attack. (A
  // mixed Multiattack, e.g. a bite and a tail, is approximated as that many swings
  // of the strongest attack — a documented fidelity-tier simplification.)
  const totalAttacks = template.multiattack.reduce((n, m) => n + m.count, 0);
  const extraAttacks = Math.max(0, totalAttacks - 1);
  return new Combatant({
    id: placement.id,
    name: template.name,
    side: placement.side,
    level: 1, // monsters have no character level; proficiency comes from save overrides
    abilities: template.abilities,
    ac: template.ac,
    maxHp: template.maxHp,
    speedFt: template.speedFt,
    saveBonuses: template.saveBonuses,
    damageResponses: template.damageResponses,
    attacks: template.attacks,
    extraAttacks,
    legendaryActions: template.legendaryActions,
    position: placement.position,
  });
}

/** The engine abilities, re-exported for loaders that validate coverage. */
export const MONSTER_ABILITIES = ABILITIES;

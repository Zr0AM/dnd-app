import { Injectable } from '@angular/core';
import { httpResource } from '@angular/common/http';

// Rows of the dnd-db-rest read views (SpellListView, MonsterListView,
// EquipmentListView). Names that live in other tables (school, creature type,
// sizes, classes) arrive already joined.
export interface SpellListRow {
  spellID: number;
  spellName: string;
  spellLevel: number;
  schoolName: string;
  spellCastingTime: string;
  spellIsRitual: number;
  spellRange: string;
  spellConcentration: number;
  spellDuration: string;
  /** Comma-separated class names, e.g. 'Sorcerer, Wizard'. Null when no class lists the spell. */
  spellClasses: string | null;
  active: number;
}

export interface MonsterListRow {
  monsterID: number;
  monsterName: string;
  creatureTypeName: string;
  crLabel: string;
  crValue: number;
  xp: number;
  monsterAc: number;
  monsterHpAvg: number;
  /** 'Medium' or 'Medium or Small' for monsters that come in several sizes. */
  monsterSizes: string | null;
  active: number;
}

export type EquipmentKind =
  | 'weapon'
  | 'armor'
  | 'tool'
  | 'gear'
  | 'ammunition'
  | 'focus'
  | 'pack'
  | 'container'
  | 'mount'
  | 'tack'
  | 'vehicle';

export interface EquipmentListRow {
  equipmentID: number;
  equipmentName: string;
  equipmentKind: EquipmentKind;
  /** Price in copper pieces; null when the SRD lists none. */
  costCp: number | null;
  weightLb: number | null;
  weaponCategory: string | null;
  weaponRange: string | null;
  damageDiceCount: number | null;
  damageDiceSides: number | null;
  damageTypeName: string | null;
  masteryName: string | null;
  armorCategory: string | null;
  armorBaseAc: number | null;
  armorDexCap: number | null;
  active: number;
}

// Full rows of the base tables, fetched one at a time when a row is expanded.
export interface SpellDetail {
  spellID: number;
  spellVerbal: number;
  spellSomatic: number;
  spellMaterial: string | null;
  spellDescription: string;
  spellHigherLevel: string | null;
}

export interface MonsterDetail {
  monsterID: number;
  monsterGroup: string | null;
  monsterTypeTags: string | null;
  monsterAlignment: string;
  monsterAcNote: string | null;
  monsterHpDiceCount: number | null;
  monsterHpDiceSides: number | null;
  monsterHpBonus: number | null;
  monsterStr: number;
  monsterDex: number;
  monsterCon: number;
  monsterInt: number;
  monsterWis: number;
  monsterCha: number;
  monsterPassivePerception: number;
  monsterLanguages: string | null;
  monsterDescription: string | null;
}

export interface EquipmentDetail {
  equipmentID: number;
  equipmentDescription: string | null;
}

interface RestResponse<T> {
  success: boolean;
  results: T[];
}

function parseRows<T extends { active: number }>(raw: unknown): T[] {
  // Belt and braces, as for items: the Pages Function already forces active=1.
  return ((raw as RestResponse<T>).results ?? []).filter((row) => row.active !== 0);
}

function parseFirst<T>(raw: unknown): T | undefined {
  return (raw as RestResponse<T>).results?.[0];
}

@Injectable({ providedIn: 'root' })
export class GameDataService {
  // App-wide lists, fetched once on first read and shared by every consumer
  // (same pattern as ItemsService.catalog). Filtering, sorting and paging
  // happen client-side.
  readonly spells = httpResource<SpellListRow[]>(() => '/api/spells', {
    parse: (raw) => parseRows<SpellListRow>(raw),
    defaultValue: [],
  });

  readonly monsters = httpResource<MonsterListRow[]>(() => '/api/monsters', {
    parse: (raw) => parseRows<MonsterListRow>(raw),
    defaultValue: [],
  });

  readonly equipment = httpResource<EquipmentListRow[]>(() => '/api/equipment', {
    parse: (raw) => parseRows<EquipmentListRow>(raw),
    defaultValue: [],
  });

  // Detail resources are created by the expanded row's component (they need an
  // injection context) and are keyed by id; no request is made without one.
  spellDetail(id: () => number | null) {
    return httpResource<SpellDetail | undefined>(
      () => (id() === null ? undefined : `/api/spells/${id()}`),
      { parse: (raw) => parseFirst<SpellDetail>(raw) },
    );
  }

  monsterDetail(id: () => number | null) {
    return httpResource<MonsterDetail | undefined>(
      () => (id() === null ? undefined : `/api/monsters/${id()}`),
      { parse: (raw) => parseFirst<MonsterDetail>(raw) },
    );
  }

  equipmentDetail(id: () => number | null) {
    return httpResource<EquipmentDetail | undefined>(
      () => (id() === null ? undefined : `/api/equipment/${id()}`),
      { parse: (raw) => parseFirst<EquipmentDetail>(raw) },
    );
  }
}

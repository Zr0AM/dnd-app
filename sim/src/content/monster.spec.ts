import { describe, it, expect } from 'vitest';
import { Random } from '../rng/rng';
import { Grid, cell } from '../grid/grid';
import { Encounter, idlePolicy, type TurnPolicy } from '../combat/encounter';
import { meanDice } from '../dice/dice';
import { compileMonster, spawnMonster, type MonsterSource } from './monster';

// Goblin Minion, exactly as the seed rows give it (docs/db/seed/06-monsters.sql):
// AC 12, HP 7, Dagger +4 (1d4+2 piercing), melee_or_ranged, Dex 15.
const goblinMinion: MonsterSource = {
  monster: {
    monsterSlug: 'goblin-minion',
    monsterName: 'Goblin Minion',
    monsterAc: 12,
    monsterHpAvg: 7,
    monsterStr: 8,
    monsterDex: 15,
    monsterCon: 10,
    monsterInt: 10,
    monsterWis: 8,
    monsterCha: 8,
    crValue: 0.125,
  },
  actions: [
    {
      monsterActionID: 410,
      actionSection: 'action',
      actionName: 'Dagger',
      attackKind: 'melee_or_ranged',
      attackBonus: 4,
      attackReachFt: 5,
      attackRangeFt: 20,
      attackRangeLongFt: 60,
    },
    {
      monsterActionID: 411,
      actionSection: 'bonus_action',
      actionName: 'Nimble Escape',
      attackKind: null,
      attackBonus: null,
      attackReachFt: null,
      attackRangeFt: null,
      attackRangeLongFt: null,
    },
  ],
  damage: [
    {
      monsterActionID: 410,
      damageIndex: 0,
      damageDiceCount: 1,
      damageDiceSides: 4,
      damageBonus: 2,
      damageAvg: 4,
      damageTypeID: 8, // piercing
    },
  ],
  speeds: [{ speedMode: 'walk', speedFt: 30 }],
};

// Animated Rug of Smothering's Smother: 2d6+3 bludgeoning, listed twice (index 0,1),
// a real two-row example from the seeds.
const smotherSource: MonsterSource = {
  monster: {
    monsterSlug: 'rug',
    monsterName: 'Rug',
    monsterAc: 12,
    monsterHpAvg: 33,
    monsterStr: 17,
    monsterDex: 14,
    monsterCon: 10,
    monsterInt: 1,
    monsterWis: 3,
    monsterCha: 1,
    crValue: 2,
  },
  actions: [
    {
      monsterActionID: 1,
      actionSection: 'action',
      actionName: 'Smother',
      attackKind: 'melee',
      attackBonus: 5,
      attackReachFt: 5,
      attackRangeFt: null,
      attackRangeLongFt: null,
    },
  ],
  damage: [
    {
      monsterActionID: 1,
      damageIndex: 0,
      damageDiceCount: 2,
      damageDiceSides: 6,
      damageBonus: 3,
      damageAvg: 10,
      damageTypeID: 2,
    },
    {
      monsterActionID: 1,
      damageIndex: 1,
      damageDiceCount: 2,
      damageDiceSides: 6,
      damageBonus: 3,
      damageAvg: 10,
      damageTypeID: 2,
    },
  ],
};

describe('compileMonster', () => {
  it('maps the stat block scalars', () => {
    const t = compileMonster(goblinMinion);
    expect(t.ac).toBe(12);
    expect(t.maxHp).toBe(7);
    expect(t.cr).toBe(0.125);
    expect(t.abilities.dex).toBe(15);
    expect(t.speedFt).toBe(30);
  });

  it('compiles an attack action into a profile', () => {
    const t = compileMonster(goblinMinion);
    expect(t.attacks).toHaveLength(1); // only the action attack, not the bonus action
    const dagger = t.attacks[0];
    expect(dagger.name).toBe('Dagger');
    expect(dagger.attackBonus).toBe(4);
    expect(dagger.damageType).toBe('piercing');
    expect(meanDice(dagger.damage)).toBe(4.5); // 1d4+2
    expect(dagger.kind).toBe('melee'); // melee_or_ranged modeled as melee
    expect(dagger.reachFt).toBe(5);
  });

  it('skips non-attack actions (bonus actions, traits)', () => {
    const t = compileMonster(goblinMinion);
    expect(t.attacks.some((a) => a.name === 'Nimble Escape')).toBe(false);
  });

  it('captures a second damage row as an extra rider', () => {
    const t = compileMonster(smotherSource);
    const smother = t.attacks[0];
    expect(smother.extraDamage).toHaveLength(1);
    expect(smother.extraDamage![0].type).toBe('bludgeoning');
    expect(meanDice(smother.extraDamage![0].damage)).toBe(10); // 2d6+3
  });

  it('maps saves to explicit bonuses and defenses to responses', () => {
    const t = compileMonster({
      ...goblinMinion,
      saves: [{ abilityID: 2, saveBonus: 4 }], // Dex +4
      defenses: [
        { defenseKind: 'resistance', damageTypeID: 4, conditionID: null }, // fire
        { defenseKind: 'immunity', damageTypeID: 9, conditionID: null }, // poison
      ],
    });
    expect(t.saveBonuses.dex).toBe(4);
    expect(t.damageResponses.fire).toBe('resistant');
    expect(t.damageResponses.poison).toBe('immune');
  });

  it('accepts a hand-authored multiattack override', () => {
    const t = compileMonster(goblinMinion, { multiattack: [{ action: 'Dagger', count: 2 }] });
    expect(t.multiattack).toEqual([{ action: 'Dagger', count: 2 }]);
  });
});

describe('spawnMonster', () => {
  it('produces a combatant that uses its explicit save bonus', () => {
    const t = compileMonster({ ...goblinMinion, saves: [{ abilityID: 3, saveBonus: 5 }] });
    const c = spawnMonster(t, { id: 'g1', side: 'enemy', position: cell(3, 3) });
    expect(c.saveBonus('con')).toBe(5); // override, not ability+prof
    expect(c.ac).toBe(12);
    expect(c.hp).toBe(7);
    expect(c.position).toEqual(cell(3, 3));
  });

  it('a compiled goblin can fight in the engine', () => {
    const t = compileMonster(goblinMinion, { multiattack: [{ action: 'Dagger', count: 1 }] });
    const g = spawnMonster(t, { id: 'g1', side: 'enemy', position: cell(1, 0) });
    // A sturdy hero that attacks the goblin should win and the goblin should die.
    const hero = spawnMonster(
      compileMonster({
        ...goblinMinion,
        monster: {
          ...goblinMinion.monster,
          monsterSlug: 'hero',
          monsterName: 'Hero',
          monsterAc: 18,
          monsterHpAvg: 40,
        },
        damage: [
          {
            monsterActionID: 410,
            damageIndex: 0,
            damageDiceCount: 2,
            damageDiceSides: 6,
            damageBonus: 4,
            damageAvg: 11,
            damageTypeID: 12,
          },
        ],
        actions: [{ ...goblinMinion.actions[0], attackBonus: 8 }],
      }),
      { id: 'hero', side: 'party', position: cell(0, 0) },
    );
    const attack: TurnPolicy = (api) => {
      const target = api.enemies()[0];
      const weapon = api.self.attacks[0];
      if (target && weapon) api.attack(target, weapon);
    };
    const e = new Encounter({
      grid: new Grid(10, 10),
      combatants: [hero, g],
      rng: new Random(2024),
      policyFor: (c) => (c.side === 'party' ? attack : idlePolicy),
    });
    const result = e.run();
    expect(result.winner).toBe('party');
    expect(g.isConscious).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { Random } from '../rng/rng';
import {
  chanceAttackCrits,
  chanceAttackHits,
  chanceSaveSucceeds,
  resolveAttack,
  resolveSave,
} from './attack';

// A controllable stream: feed exact d20 faces via a scripted rng.
function scripted(faces: number[]): () => number {
  let i = 0;
  // rollDie maps rng()*sides+1; to force face f on a d20, return (f-1)/20 + tiny.
  return () => {
    const f = faces[i++ % faces.length];
    return (f - 1) / 20 + 1e-9;
  };
}

describe('resolveAttack', () => {
  it('natural 1 always misses even against low AC', () => {
    const r = resolveAttack(scripted([1]), { attackBonus: 20, targetAc: 1 });
    expect(r.d20).toBe(1);
    expect(r.hit).toBe(false);
    expect(r.crit).toBe(false);
  });

  it('natural 20 always hits and crits even against high AC', () => {
    const r = resolveAttack(scripted([20]), { attackBonus: -5, targetAc: 99 });
    expect(r.d20).toBe(20);
    expect(r.hit).toBe(true);
    expect(r.crit).toBe(true);
  });

  it('hits when total meets AC', () => {
    const r = resolveAttack(scripted([10]), { attackBonus: 5, targetAc: 15 });
    expect(r.total).toBe(15);
    expect(r.hit).toBe(true);
    expect(r.crit).toBe(false);
  });

  it('misses when total is below AC', () => {
    const r = resolveAttack(scripted([10]), { attackBonus: 4, targetAc: 15 });
    expect(r.hit).toBe(false);
  });

  it('crits on a widened range (Champion 19-20)', () => {
    const r = resolveAttack(scripted([19]), { attackBonus: 0, targetAc: 99, critRange: 19 });
    expect(r.hit).toBe(true);
    expect(r.crit).toBe(true);
  });

  it('empirical hit rate matches chanceAttackHits', () => {
    const rng = new Random(321).stream('atk');
    const params = { attackBonus: 5, targetAc: 15 } as const;
    let hits = 0;
    const n = 200000;
    for (let i = 0; i < n; i++) if (resolveAttack(rng, params).hit) hits++;
    expect(hits / n).toBeCloseTo(chanceAttackHits(params), 2);
  });

  it('empirical crit rate matches chanceAttackCrits under advantage', () => {
    const rng = new Random(654).stream('crit');
    const params = { attackBonus: 0, targetAc: 10, advantage: 'advantage', critRange: 19 } as const;
    let crits = 0;
    const n = 200000;
    for (let i = 0; i < n; i++) if (resolveAttack(rng, params).crit) crits++;
    expect(crits / n).toBeCloseTo(chanceAttackCrits(params), 2);
  });
});

describe('chanceAttackHits', () => {
  it('needs an 11 (total >= AC) => 50% with +4 vs AC 15', () => {
    expect(chanceAttackHits({ attackBonus: 4, targetAc: 15 })).toBeCloseTo(0.5, 10);
  });

  it('caps at 95% (nat 1 misses) and floors at 5% (nat 20 hits)', () => {
    expect(chanceAttackHits({ attackBonus: 100, targetAc: 10 })).toBeCloseTo(0.95, 10);
    expect(chanceAttackHits({ attackBonus: -100, targetAc: 10 })).toBeCloseTo(0.05, 10);
  });
});

describe('resolveSave', () => {
  it('succeeds when total meets DC, no natural-20 special', () => {
    expect(resolveSave(scripted([10]), { saveBonus: 5, dc: 15 }).success).toBe(true);
    expect(resolveSave(scripted([10]), { saveBonus: 4, dc: 15 }).success).toBe(false);
  });

  it('a natural 20 that still falls short fails (saves have no auto-success)', () => {
    const r = resolveSave(scripted([20]), { saveBonus: 0, dc: 25 });
    expect(r.d20).toBe(20);
    expect(r.success).toBe(false);
  });

  it('empirical save rate matches chanceSaveSucceeds', () => {
    const rng = new Random(111).stream('save');
    const params = { saveBonus: 3, dc: 14 } as const;
    let ok = 0;
    const n = 200000;
    for (let i = 0; i < n; i++) if (resolveSave(rng, params).success) ok++;
    expect(ok / n).toBeCloseTo(chanceSaveSucceeds(params), 2);
  });
});

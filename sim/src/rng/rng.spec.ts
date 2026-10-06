import { describe, it, expect } from 'vitest';
import { Random, deriveSeed, randomSeed, seedFrom } from './rng';

function take(rng: () => number, n = 50): number[] {
  return Array.from({ length: n }, () => rng());
}

describe('Random streams', () => {
  it('replays the same sequence for the same seed and label', () => {
    const a = new Random(42);
    const b = new Random(42);
    expect(take(a.stream('enemy:goblin:attack'))).toEqual(take(b.stream('enemy:goblin:attack')));
  });

  it('gives independent sequences to different labels', () => {
    const r = new Random(42);
    expect(take(r.stream('a'))).not.toEqual(take(r.stream('b')));
  });

  it('diverges for different root seeds on the same label', () => {
    const a = new Random(1);
    const b = new Random(2);
    expect(take(a.stream('x'))).not.toEqual(take(b.stream('x')));
  });

  it('continues a label sequence across calls rather than restarting', () => {
    const r = new Random(7);
    const first = take(r.stream('s'), 10);
    const second = take(r.stream('s'), 10);
    // Same cached generator, so the second batch continues (differs from the first).
    expect(second).not.toEqual(first);
    // And the whole 20 matches a fresh generator drawn in one go.
    const fresh = take(new Random(7).stream('s'), 20);
    expect([...first, ...second]).toEqual(fresh);
  });

  it('produces values in [0, 1)', () => {
    const r = new Random(123);
    for (const v of take(r.stream('range'), 500)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  // The core CRN guarantee: one stream's output is unaffected by how much any
  // other stream is drawn. This is what makes two builds face identical enemy
  // rolls even when they differ in their own actions.
  it('is order-independent: draining one stream does not shift another (CRN)', () => {
    const baseline = new Random(99);
    const enemyBaseline = take(baseline.stream('enemy:attack'), 20);

    // A different run that draws heavily from an unrelated hero stream first.
    const other = new Random(99);
    take(other.stream('hero:extra-spell'), 1000);
    const enemyOther = take(other.stream('enemy:attack'), 20);

    expect(enemyOther).toEqual(enemyBaseline);
  });

  it('interleaving two streams does not change either stream', () => {
    const sequential = new Random(5);
    const aSeq = take(sequential.stream('a'), 20);
    const bSeq = take(sequential.stream('b'), 20);

    const interleaved = new Random(5);
    const aInt: number[] = [];
    const bInt: number[] = [];
    for (let i = 0; i < 20; i++) {
      aInt.push(interleaved.stream('a')());
      bInt.push(interleaved.stream('b')());
    }
    expect(aInt).toEqual(aSeq);
    expect(bInt).toEqual(bSeq);
  });
});

describe('Random.child', () => {
  it('namespaces labels under the child prefix', () => {
    const root = new Random(11);
    const viaChild = take(root.child('enemy:goblin-1').stream('attack'));
    const viaPath = take(new Random(11).stream('enemy:goblin-1/attack'));
    expect(viaChild).toEqual(viaPath);
  });

  it('keeps sibling children independent', () => {
    const root = new Random(11);
    const g1 = take(root.child('goblin-1').stream('attack'));
    const g2 = take(root.child('goblin-2').stream('attack'));
    expect(g1).not.toEqual(g2);
  });
});

describe('deriveSeed', () => {
  it('is deterministic', () => {
    expect(deriveSeed(123, 'label')).toBe(deriveSeed(123, 'label'));
  });

  it('changes with the label', () => {
    expect(deriveSeed(123, 'a')).not.toBe(deriveSeed(123, 'b'));
  });

  it('changes with the root seed', () => {
    expect(deriveSeed(1, 'a')).not.toBe(deriveSeed(2, 'a'));
  });

  it('returns an unsigned 32-bit integer', () => {
    const s = deriveSeed(0xffffffff, 'anything');
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
  });
});

describe('seedFrom', () => {
  it('builds a stable seed from mixed parts', () => {
    expect(seedFrom('scenario-a', 'family', 3)).toBe(seedFrom('scenario-a', 'family', 3));
    expect(seedFrom('scenario-a', 'family', 3)).not.toBe(seedFrom('scenario-a', 'family', 4));
  });
});

describe('randomSeed', () => {
  it('returns an unsigned 32-bit integer', () => {
    const s = randomSeed();
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
  });
});

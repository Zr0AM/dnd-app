// Splittable, label-addressed random number generation for the simulator.
//
// The metrics spec requires common random numbers (CRN): two builds playing the
// same scenario must face identical enemy rolls, initiative and environment
// events, so comparisons can be paired and need far fewer samples. A single
// shared draw-order generator cannot do this — the moment one build casts an
// extra spell, every later draw (including the enemies') shifts, and the pairing
// is lost.
//
// The fix is independent streams addressed by a stable label, not by draw order.
// Each label (e.g. "enemy:goblin-1:attack") owns its own generator seeded
// deterministically from (rootSeed, label). Draws from one label never touch
// another, so the goblin's attack rolls are identical across two builds whatever
// else those builds do. Within a label, draws are sequential — an actor consumes
// its own rolls in order, which is exactly what we want.
//
// The generator is mulberry32 (same family as src/app/core/random), seeded via
// xmur3 string hashing mixed with the root seed. Both are tiny, fast and well
// distributed; neither is cryptographically secure, which is fine for game rolls.

/** A function returning the next value in [0, 1) for one stream. */
export type Rng = () => number;

/** xmur3: hash a string to a 32-bit seed generator (paired with mulberry32). */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** mulberry32: a tiny, well-distributed 32-bit PRNG. Same seed, same sequence. */
function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derive a 32-bit child seed from a root seed and a label, order-independently. */
export function deriveSeed(rootSeed: number, label: string): number {
  // Fold the root seed into the string hash so the same label under different
  // root seeds yields unrelated streams.
  const hash = xmur3(label);
  // Two advances mix the label bits; XOR-in the root seed and re-mix so the root
  // seed affects every output bit, not just the low ones.
  const a = hash();
  const b = hash();
  let s = (a ^ Math.imul(rootSeed >>> 0, 2654435761) ^ (b >>> 1)) >>> 0;
  s = Math.imul(s ^ (s >>> 15), 2246822507) >>> 0;
  return s >>> 0;
}

/**
 * A tree of independent random streams rooted at one seed.
 *
 * `stream(label)` returns the generator for that label, creating it on first use
 * and continuing it on later calls. Generators are cached, so a label's sequence
 * is consumed in order across the run. Because each label is seeded only from
 * (rootSeed, label), streams are mutually independent and order-independent: the
 * set of values a label produces does not depend on whether, or how much, any
 * other label was drawn.
 *
 * `child(label)` returns a sub-tree whose own labels are namespaced under the
 * parent, so callers can hand a scoped Random to an actor without that actor
 * being able to collide with another actor's streams.
 */
export class Random {
  private readonly rootSeed: number;
  private readonly prefix: string;
  private readonly streams = new Map<string, Rng>();

  constructor(rootSeed: number, prefix = '') {
    this.rootSeed = rootSeed >>> 0;
    this.prefix = prefix;
  }

  /** The fully-qualified label, including this tree's prefix. */
  private qualify(label: string): string {
    return this.prefix ? `${this.prefix}/${label}` : label;
  }

  /** Get (or create) the generator for `label`. */
  stream(label: string): Rng {
    const key = this.qualify(label);
    let rng = this.streams.get(key);
    if (rng === undefined) {
      rng = mulberry32(deriveSeed(this.rootSeed, key));
      this.streams.set(key, rng);
    }
    return rng;
  }

  /** The next float in [0, 1) from `label`'s stream. */
  next(label: string): number {
    return this.stream(label)();
  }

  /**
   * A namespaced sub-tree. Its labels are prefixed with `label`, and it shares
   * the same root seed, so `root.child('enemy:goblin-1').next('attack')` and
   * `root.next('enemy:goblin-1/attack')` draw from the same stream.
   */
  child(label: string): Random {
    return new Random(this.rootSeed, this.qualify(label));
  }
}

/** A cryptographically-sourced unsigned 32-bit seed, for non-reproducible runs. */
export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

/**
 * A stable 32-bit seed from parts, e.g. hash(scenarioSlug, seedFamily, runIdx).
 * Used to derive a run's root seed so the same run is reproducible.
 */
export function seedFrom(...parts: readonly (string | number)[]): number {
  return deriveSeed(0, parts.join('|'));
}

// Monster Multiattack counts — hand-authored from the 2024 SRD stat blocks, since
// the structured data stores a single attack per action and the Multiattack trait
// (how many times each is used) lives in prose. Centralized here so every loader
// (scenario library, party harness, martial catalog) compiles a monster with the
// same multiattack, and a monster with no entry simply attacks once.
//
// Counts are the fidelity-tier approximation the monster compiler's header calls
// out: the common bruiser pattern (giants swing their weapon twice, big brutes and
// dragons Rend three times) rather than every edge case.

import type { MonsterOverrides } from './monster';

/** Multiattack by monster slug: the attack action(s) to repeat, and how many times. */
export const MONSTER_MULTIATTACK: Readonly<
  Record<string, readonly { readonly action: string; readonly count: number }[]>
> = {
  // Brutes and beasts.
  troll: [{ action: 'Rend', count: 3 }],
  owlbear: [{ action: 'Rend', count: 2 }],
  'tyrannosaurus-rex': [
    { action: 'Bite', count: 1 },
    { action: 'Tail', count: 1 },
  ],
  // Giants: two weapon attacks.
  'hill-giant': [{ action: 'Tree Club', count: 2 }],
  'stone-giant': [{ action: 'Stone Club', count: 2 }],
  'frost-giant': [{ action: 'Frost Axe', count: 2 }],
  'fire-giant': [{ action: 'Flame Sword', count: 2 }],
  'storm-giant': [{ action: 'Storm Sword', count: 2 }],
  // Dragons: three Rend attacks (breath weapon is handled separately / deferred).
  'young-red-dragon': [{ action: 'Rend', count: 3 }],
  'adult-red-dragon': [{ action: 'Rend', count: 3 }],
  // Lesser packs reused at high level.
  'winter-wolf': [{ action: 'Bite', count: 1 }],
};

/** The Multiattack override for a monster slug (empty when it attacks once). */
export function multiattackFor(slug: string): MonsterOverrides {
  const multiattack = MONSTER_MULTIATTACK[slug];
  return multiattack ? { multiattack } : {};
}

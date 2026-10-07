import { describe, it, expect } from 'vitest';
import { cell } from '../grid/grid';
import { Combatant, type CombatantSpec } from './actor';
import { auraSaveBonus } from './encounter';
import { AuraOfProtectionFeature } from '../content/martial-features';

function who(id: string, over: Partial<CombatantSpec> = {}): Combatant {
  return new Combatant({
    id,
    name: id,
    side: 'party',
    level: 11,
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 20 }, // Cha +5
    ac: 12,
    maxHp: 40,
    position: cell(0, 0),
    ...over,
  });
}

describe('Aura of Protection', () => {
  const paladin = () =>
    who('pal', { features: [new AuraOfProtectionFeature()], position: cell(0, 0) });

  it('adds a nearby paladin’s Cha modifier to an ally’s save', () => {
    const pal = paladin();
    const ally = who('ally', {
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 8 },
      position: cell(1, 0),
    });
    // Ally is 5 ft away (within 10 ft): gets the paladin's +5.
    expect(auraSaveBonus([pal, ally], ally, 5)).toBe(5);
    // The paladin itself benefits from its own aura.
    expect(auraSaveBonus([pal, ally], pal, 5)).toBe(5);
  });

  it('does not reach beyond 10 ft', () => {
    const pal = paladin();
    const far = who('far', { position: cell(3, 0) }); // 15 ft away
    expect(auraSaveBonus([pal, far], far, 5)).toBe(0);
  });

  it('does not help enemies', () => {
    const pal = paladin();
    const foe = who('foe', { side: 'enemy', position: cell(1, 0) });
    expect(auraSaveBonus([pal, foe], foe, 5)).toBe(0);
  });

  it('does not stack: the best nearby aura applies', () => {
    const strong = who('strong', {
      features: [new AuraOfProtectionFeature()],
      position: cell(0, 0),
    });
    const weak = who('weak', {
      features: [new AuraOfProtectionFeature()],
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 14 }, // Cha +2
      position: cell(1, 0),
    });
    const ally = who('ally', { position: cell(1, 1) });
    expect(auraSaveBonus([strong, weak, ally], ally, 5)).toBe(5); // max(+5, +2), not +7
  });

  it('an unconscious paladin projects no aura', () => {
    const pal = paladin();
    pal.takeDamage(1000); // down
    const ally = who('ally', { position: cell(1, 0) });
    expect(auraSaveBonus([pal, ally], ally, 5)).toBe(0);
  });
});

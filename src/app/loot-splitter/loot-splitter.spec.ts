import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { LootSplitter } from './loot-splitter';

describe('LootSplitter', () => {
  let component: LootSplitter;
  let fixture: ComponentFixture<LootSplitter>;

  // The signals under test are protected; this narrows access for the specs.
  interface Testable {
    platinum: { set(v: number): void };
    gold: { set(v: number): void };
    silver: { set(v: number): void };
    copper: { set(v: number): void };
    players: { set(v: number): void };
    totalCp(): number;
    hasLoot(): boolean;
    spreadCp(): number;
    distributions(): { pp: number; gp: number; sp: number; cp: number; valueCp: number }[];
  }

  function set(coins: Partial<Record<'platinum' | 'gold' | 'silver' | 'copper' | 'players', number>>) {
    const c = component as unknown as Testable;
    if (coins.platinum !== undefined) c.platinum.set(coins.platinum);
    if (coins.gold !== undefined) c.gold.set(coins.gold);
    if (coins.silver !== undefined) c.silver.set(coins.silver);
    if (coins.copper !== undefined) c.copper.set(coins.copper);
    if (coins.players !== undefined) c.players.set(coins.players);
  }
  function read() {
    return component as unknown as Testable;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [LootSplitter] }).compileComponents();
    fixture = TestBed.createComponent(LootSplitter);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('computes the total pool value in copper', () => {
    set({ platinum: 1, gold: 2, silver: 3, copper: 4 });
    expect(read().totalCp()).toBe(1234);
  });

  it('splits evenly when the hoard divides cleanly', () => {
    set({ gold: 100, players: 4 });
    const purses = read().distributions();
    expect(purses).toHaveLength(4);
    expect(purses.every((p) => p.gp === 25)).toBe(true);
    expect(read().spreadCp()).toBe(0);
  });

  it('distributes remainder coins to keep totals as even as possible', () => {
    // 10 gp among 3 players: 3 each + 1 leftover. Total value must be preserved.
    set({ gold: 10, players: 3 });
    const purses = read().distributions();
    const totalGold = purses.reduce((sum, p) => sum + p.gp, 0);
    expect(totalGold).toBe(10);
    // No player differs from another by more than one coin's worth here.
    expect(read().spreadCp()).toBeLessThanOrEqual(100);
  });

  it('preserves total value across mixed denominations', () => {
    set({ platinum: 3, gold: 7, silver: 5, copper: 9, players: 4 });
    const purses = read().distributions();
    const total = purses.reduce((sum, p) => sum + p.valueCp, 0);
    expect(total).toBe(read().totalCp());
  });

  it('gives everything to a single player when players is 1', () => {
    set({ gold: 42, players: 1 });
    const purses = read().distributions();
    expect(purses).toHaveLength(1);
    expect(purses[0].gp).toBe(42);
  });

  it('reports no loot when the hoard is empty', () => {
    set({ players: 4 });
    expect(read().hasLoot()).toBe(false);
  });

  it('returns no purses when there are no players', () => {
    set({ gold: 10, players: 0 });
    expect(read().distributions()).toEqual([]);
    expect(read().spreadCp()).toBe(0);
  });

  it('reset clears the coins but keeps the player count', () => {
    set({ platinum: 5, gold: 5, silver: 5, copper: 5, players: 3 });
    (component as unknown as { reset(): void }).reset();
    expect(read().totalCp()).toBe(0);
    expect((component as unknown as { players(): number }).players()).toBe(3);
  });

  it('lists only the non-zero coins for a purse', () => {
    const purse = { pp: 0, gp: 2, sp: 0, cp: 3, valueCp: 203 };
    const coins = (
      component as unknown as {
        coinsOf(p: typeof purse): { key: string; name: string; count: number }[];
      }
    ).coinsOf(purse);
    expect(coins).toEqual([
      { key: 'gp', name: 'gold', count: 2 },
      { key: 'cp', name: 'copper', count: 3 },
    ]);
  });

  it('seeds the hoard from query-param inputs', () => {
    fixture.componentRef.setInput('pp', '3');
    fixture.componentRef.setInput('gp', '250');
    fixture.componentRef.setInput('sp', 'junk');
    expect(read().totalCp()).toBe(3 * 1000 + 250 * 100);
  });

  it('lets the user edit coins after seeding from the URL', () => {
    fixture.componentRef.setInput('gp', '250');
    set({ gold: 10 });
    expect(read().totalCp()).toBe(1000);
  });

  it('sanitizes out-of-range and non-numeric input', () => {
    const c = component as unknown as Testable;
    (component as unknown as { setNum(t: { set(v: number): void }, raw: string, min: number, max: number): void }).setNum(
      c.gold,
      '-40',
      0,
      50000,
    );
    expect((component as unknown as { gold(): number }).gold()).toBe(0);
  });
});

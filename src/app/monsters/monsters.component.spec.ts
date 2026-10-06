import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameDataService, MonsterListRow } from '../core/game-data/game-data.service';
import { MonstersComponent } from './monsters.component';

function row(id: number, name: string, extra: Partial<MonsterListRow> = {}): MonsterListRow {
  return {
    monsterID: id,
    monsterName: name,
    creatureTypeName: 'Beast',
    crLabel: '1',
    crValue: 1,
    xp: 200,
    monsterAc: 12,
    monsterHpAvg: 20,
    monsterSizes: 'Medium',
    active: 1,
    ...extra,
  };
}

const ROWS = [
  row(1, 'Goblin', { creatureTypeName: 'Fey', crLabel: '1/4', crValue: 0.25, monsterSizes: 'Small' }),
  row(2, 'Ogre', { creatureTypeName: 'Giant', crLabel: '2', crValue: 2, monsterSizes: 'Large', monsterAc: 11, monsterHpAvg: 68 }),
  row(3, 'Hill Giant', {
    creatureTypeName: 'Giant',
    crLabel: '5',
    crValue: 5,
    monsterSizes: 'Huge or Large',
    monsterAc: 13,
    monsterHpAvg: 105,
  }),
  row(4, 'Dragon', { creatureTypeName: 'Dragon', crLabel: '17', crValue: 17, monsterSizes: 'Huge', monsterAc: 19, monsterHpAvg: 256 }),
  row(5, 'Wolf', { crLabel: '1/4', crValue: 0.25 }),
];

describe('MonstersComponent', () => {
  let fixture: ComponentFixture<MonstersComponent>;
  const catalog = {
    value: signal<MonsterListRow[]>(ROWS),
    error: signal<unknown>(undefined),
    isLoading: signal(false),
    reload: vi.fn(),
  };

  beforeEach(async () => {
    catalog.value.set(ROWS);
    catalog.error.set(undefined);
    catalog.isLoading.set(false);
    await TestBed.configureTestingModule({
      imports: [MonstersComponent],
      providers: [provideRouter([]), { provide: GameDataService, useValue: { monsters: catalog } }],
    }).compileComponents();
    fixture = TestBed.createComponent(MonstersComponent);
  });

  function names(): string[] {
    fixture.detectChanges();
    return [...fixture.nativeElement.querySelectorAll('.browse-table__row .browse-table__name')].map(
      (n) => (n as HTMLElement).textContent!.trim(),
    );
  }

  function set(inputs: Record<string, unknown>) {
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
  }

  it('lists monsters sorted by name by default', () => {
    expect(names()).toEqual(['Dragon', 'Goblin', 'Hill Giant', 'Ogre', 'Wolf']);
  });

  it('filters by type', () => {
    set({ type: 'Giant' });
    expect(names()).toEqual(['Hill Giant', 'Ogre']);
  });

  it('matches a creature size against multi-size monsters', () => {
    set({ creatureSize: 'Large' });
    expect(names()).toEqual(['Hill Giant', 'Ogre']);
    set({ creatureSize: 'Huge' });
    expect(names()).toEqual(['Dragon', 'Hill Giant']);
  });

  it('filters by exact challenge rating', () => {
    set({ cr: '0.25' });
    expect(names()).toEqual(['Goblin', 'Wolf']);
  });

  it('sorts CR numerically, so 1/4 comes before 2 and 17 is last', () => {
    set({ sort: 'crValue' });
    expect(names()).toEqual(['Goblin', 'Wolf', 'Ogre', 'Hill Giant', 'Dragon']);
    set({ dir: 'desc' });
    expect(names()).toEqual(['Dragon', 'Hill Giant', 'Ogre', 'Wolf', 'Goblin']);
  });

  it('sorts by AC and HP', () => {
    set({ sort: 'monsterAc', dir: 'desc' });
    expect(names()[0]).toBe('Dragon');
    set({ sort: 'monsterHpAvg', dir: 'asc' });
    expect(names()[0]).toBe('Goblin');
  });

  it('orders the size dropdown by physical size and the CR dropdown numerically', () => {
    fixture.detectChanges();
    const options = [...fixture.nativeElement.querySelectorAll('select')].map((s) =>
      [...(s as HTMLSelectElement).options].map((o) => o.textContent!.trim()).join('|'),
    );
    expect(options[0]).toBe('All|Beast|Dragon|Fey|Giant');
    expect(options[1]).toBe('All|Small|Medium|Large|Huge');
    expect(options[2]).toBe('All|CR 1/4|CR 2|CR 5|CR 17');
  });

  it('shows the empty state and the error state', () => {
    set({ type: 'Undead' });
    names();
    expect(fixture.nativeElement.querySelector('app-empty-state')).toBeTruthy();
    catalog.error.set(new Error('down'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('bestiary is unreachable');
  });
});

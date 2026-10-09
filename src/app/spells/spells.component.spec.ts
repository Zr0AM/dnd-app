import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameDataService, SpellListRow } from '../core/game-data/game-data.service';
import { SpellsComponent } from './spells.component';

function row(id: number, name: string, extra: Partial<SpellListRow> = {}): SpellListRow {
  return {
    spellID: id,
    spellName: name,
    spellLevel: 1,
    schoolName: 'Evocation',
    spellCastingTime: 'Action',
    spellIsRitual: 0,
    spellRange: '60 feet',
    spellConcentration: 0,
    spellDuration: 'Instantaneous',
    spellClasses: 'Wizard',
    active: 1,
    ...extra,
  };
}

const ROWS = [
  row(1, 'Fireball', { spellLevel: 3, spellClasses: 'Sorcerer, Wizard' }),
  row(2, 'Cure Wounds', { schoolName: 'Abjuration', spellClasses: 'Cleric, Druid' }),
  row(3, 'Hold Person', {
    spellLevel: 2,
    schoolName: 'Enchantment',
    spellConcentration: 1,
    spellClasses: 'Bard, Wizard',
  }),
  row(4, 'Fire Bolt', { spellLevel: 0, spellClasses: null }),
];

describe('SpellsComponent', () => {
  let fixture: ComponentFixture<SpellsComponent>;
  const catalog = {
    value: signal<SpellListRow[]>(ROWS),
    error: signal<unknown>(undefined),
    isLoading: signal(false),
    reload: vi.fn(),
  };

  beforeEach(async () => {
    catalog.value.set(ROWS);
    catalog.error.set(undefined);
    catalog.isLoading.set(false);
    await TestBed.configureTestingModule({
      imports: [SpellsComponent],
      providers: [provideRouter([]), { provide: GameDataService, useValue: { spells: catalog } }],
    }).compileComponents();
    fixture = TestBed.createComponent(SpellsComponent);
  });

  function names(): string[] {
    fixture.detectChanges();
    return [
      ...fixture.nativeElement.querySelectorAll('.browse-table__row .browse-table__name'),
    ].map((n) => (n as HTMLElement).textContent!.trim());
  }

  function set(inputs: Record<string, unknown>) {
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
  }

  it('lists spells sorted by name by default', () => {
    expect(names()).toEqual(['Cure Wounds', 'Fire Bolt', 'Fireball', 'Hold Person']);
  });

  it('filters by level, school, class and concentration (AND)', () => {
    set({ level: '3' });
    expect(names()).toEqual(['Fireball']);
    set({ level: '', school: 'Abjuration' });
    expect(names()).toEqual(['Cure Wounds']);
    set({ school: '', spellClass: 'Wizard' });
    expect(names()).toEqual(['Fireball', 'Hold Person']);
    set({ concentration: 'true' });
    expect(names()).toEqual(['Hold Person']);
    set({ level: '3' });
    expect(names()).toEqual([]);
  });

  it('shows the empty state when nothing matches', () => {
    set({ level: '9' });
    names();
    expect(fixture.nativeElement.querySelector('app-empty-state')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.browse-table')).toBeNull();
  });

  it('searches names fuzzily and instantly', () => {
    fixture.detectChanges();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type="search"]');
    input.value = 'firebal';
    input.dispatchEvent(new Event('input'));
    expect(names()).toEqual(['Fireball']);
    input.value = 'bolt fire';
    input.dispatchEvent(new Event('input'));
    expect(names()).toEqual(['Fire Bolt']);
  });

  it('sorts by level descending with a name tie-break', () => {
    set({ sort: 'spellLevel', dir: 'desc' });
    expect(names()).toEqual(['Fireball', 'Hold Person', 'Cure Wounds', 'Fire Bolt']);
  });

  it('ignores an invalid sort column and direction from the URL', () => {
    set({ sort: 'constructor', dir: 'sideways' });
    expect(names()).toEqual(['Cure Wounds', 'Fire Bolt', 'Fireball', 'Hold Person']);
  });

  it('pages, and clamps a page beyond the end', () => {
    set({ size: '10' });
    expect(names()).toHaveLength(4);
    catalog.value.set(
      Array.from({ length: 12 }, (_, i) => row(i + 1, `Spell ${String(i).padStart(2, '0')}`)),
    );
    set({ page: '2' });
    expect(names()).toEqual(['Spell 10', 'Spell 11']);
    set({ page: '99' });
    expect(names()).toEqual(['Spell 10', 'Spell 11']);
    expect(fixture.nativeElement.querySelector('.browse-count').textContent).toContain(
      '11–12 of 12',
    );
  });

  it('builds filter options from the data', () => {
    fixture.detectChanges();
    const options = [...fixture.nativeElement.querySelectorAll('select')].map((s) =>
      [...(s as HTMLSelectElement).options].map((o) => o.textContent!.trim()).join('|'),
    );
    expect(options[0]).toBe('All|Cantrip|1st|2nd|3rd');
    expect(options[1]).toBe('All|Abjuration|Enchantment|Evocation');
    expect(options[2]).toBe('All|Bard|Cleric|Druid|Sorcerer|Wizard');
  });

  it('shows the error state with a retry that reloads', () => {
    catalog.error.set(new Error('down'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('spellbook is unreachable');
    fixture.nativeElement.querySelector('.btn--primary').click();
    expect(catalog.reload).toHaveBeenCalled();
  });

  it('shows a skeleton while the first load is in flight', () => {
    catalog.value.set([]);
    catalog.isLoading.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-browse-skeleton')).toBeTruthy();
  });
});

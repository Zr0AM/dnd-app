import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EquipmentListRow, GameDataService } from '../core/game-data/game-data.service';
import { EquipmentComponent } from './equipment.component';

function row(id: number, name: string, extra: Partial<EquipmentListRow> = {}): EquipmentListRow {
  return {
    equipmentID: id,
    equipmentName: name,
    equipmentKind: 'gear',
    costCp: 100,
    weightLb: 1,
    weaponCategory: null,
    weaponRange: null,
    damageDiceCount: null,
    damageDiceSides: null,
    damageTypeName: null,
    masteryName: null,
    armorCategory: null,
    armorBaseAc: null,
    armorDexCap: null,
    active: 1,
    ...extra,
  };
}

const ROWS = [
  row(1, 'Longsword', { equipmentKind: 'weapon', costCp: 1500, weightLb: 3 }),
  row(2, 'Chain Mail', { equipmentKind: 'armor', costCp: 7500, weightLb: 55 }),
  row(3, 'Riding Horse', { equipmentKind: 'mount', costCp: 7500, weightLb: null }),
  row(4, 'Mystery Item', { costCp: null }),
  row(5, 'Torch', { costCp: 1, weightLb: 1 }),
];

describe('EquipmentComponent', () => {
  let fixture: ComponentFixture<EquipmentComponent>;
  const catalog = {
    value: signal<EquipmentListRow[]>(ROWS),
    error: signal<unknown>(undefined),
    isLoading: signal(false),
    reload: vi.fn(),
  };

  beforeEach(async () => {
    catalog.value.set(ROWS);
    catalog.error.set(undefined);
    catalog.isLoading.set(false);
    await TestBed.configureTestingModule({
      imports: [EquipmentComponent],
      providers: [
        provideRouter([]),
        { provide: GameDataService, useValue: { equipment: catalog } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(EquipmentComponent);
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

  it('lists equipment sorted by name by default', () => {
    expect(names()).toEqual(['Chain Mail', 'Longsword', 'Mystery Item', 'Riding Horse', 'Torch']);
  });

  it('filters by kind', () => {
    set({ kind: 'weapon' });
    expect(names()).toEqual(['Longsword']);
  });

  it('sorts by cost with unpriced rows last, using the name as tie-break', () => {
    set({ sort: 'costCp' });
    expect(names()).toEqual(['Torch', 'Longsword', 'Chain Mail', 'Riding Horse', 'Mystery Item']);
  });

  it('sorts by weight with unknown weights last', () => {
    set({ sort: 'weightLb' });
    const order = names();
    expect(order[order.length - 1]).toBe('Riding Horse');
    expect(order[0]).toBe('Mystery Item');
  });

  it('formats cost and weight, with a dash for missing values', () => {
    fixture.detectChanges();
    const rows = [...fixture.nativeElement.querySelectorAll('.browse-table__row')].map((r) =>
      [...r.querySelectorAll('td')]
        .map((td) => td.textContent!.trim())
        .filter(Boolean)
        .join(' '),
    );
    expect(rows).toContain('Torch Gear 1 cp 1 lb');
    expect(rows).toContain('Riding Horse Mount 75 gp —');
    expect(rows).toContain('Mystery Item Gear — 1 lb');
  });

  it('builds the kind dropdown from the data with display casing', () => {
    fixture.detectChanges();
    const options = [
      ...(fixture.nativeElement.querySelector('select') as HTMLSelectElement).options,
    ].map((o) => o.textContent!.trim());
    expect(options).toEqual(['All', 'Armor', 'Gear', 'Mount', 'Weapon']);
  });

  it('shows the error state with a retry that reloads', () => {
    catalog.error.set(new Error('down'));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('armory is unreachable');
    fixture.nativeElement.querySelector('.btn--primary').click();
    expect(catalog.reload).toHaveBeenCalled();
  });
});

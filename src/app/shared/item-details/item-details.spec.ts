import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { Item } from '../../core/items/items.service';
import { ItemDetails } from './item-details';

const ITEM: Item = {
  itemID: 7,
  itemName: 'Staff of Power',
  itemRarity: 'Very Rare',
  itemCost: 95000,
  itemType: 'Staff',
  itemRestrictions: 'Sorcerer, Warlock, Wizard',
  itemAttunement: 'Yes',
  itemSource: 'Dungeon Master’s Guide',
  itemUrl: 'https://example.com/staff-of-power',
  itemVisualDesc: 'Gnarled darkwood crowned with a crackling gem.',
  itemShopkeeperDesc: 'Only for those who can bear its weight.',
};

describe('ItemDetails', () => {
  let fixture: ComponentFixture<ItemDetails>;
  const text = () => (fixture.nativeElement as HTMLElement).textContent!.replace(/\s+/g, ' ');
  const terms = () =>
    [...(fixture.nativeElement as HTMLElement).querySelectorAll('dt')].map((dt) => dt.textContent);

  const costValue = () =>
    [...(fixture.nativeElement as HTMLElement).querySelectorAll('dt')]
      .find((dt) => dt.textContent === 'Cost')
      ?.nextElementSibling?.textContent?.trim();

  beforeEach(() => {
    fixture = TestBed.createComponent(ItemDetails);
    fixture.componentRef.setInput('item', ITEM);
    fixture.detectChanges();
  });

  it('shows every field, the descriptions and a link by default', () => {
    expect(terms()).toEqual(['Type', 'Cost', 'Attunement', 'Source']);
    expect(text()).toContain('95,000 gp');
    expect(text()).toContain('“Only for those who can bear its weight.”');
    expect(text()).toContain('Gnarled darkwood');
    expect(text()).toContain('Restrictions: Sorcerer, Warlock, Wizard');
    expect(fixture.nativeElement.querySelector('a').getAttribute('href')).toBe(ITEM.itemUrl);
  });

  it('shows Priceless instead of 0 gp for a zero-cost item', () => {
    fixture.componentRef.setInput('item', { ...ITEM, itemCost: 0 });
    fixture.detectChanges();
    expect(costValue()).toBe('Priceless');
    expect(text()).not.toContain('0 gp');
    expect(text()).not.toMatch(/Priceless gp/);
  });

  it('shows a dash when the cost is missing', () => {
    fixture.componentRef.setInput('item', { ...ITEM, itemCost: null as unknown as number });
    fixture.detectChanges();
    expect(costValue()).toBe('—');
  });

  it('shows only the requested fields and can hide the link', () => {
    fixture.componentRef.setInput('fields', ['attunement', 'source']);
    fixture.componentRef.setInput('showLink', false);
    fixture.detectChanges();
    expect(terms()).toEqual(['Attunement', 'Source']);
    expect(fixture.nativeElement.querySelector('a')).toBeNull();

    fixture.componentRef.setInput('fields', []);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('dl')).toBeNull();
  });

  it('hides catalog placeholder values', () => {
    fixture.componentRef.setInput('item', {
      ...ITEM,
      itemShopkeeperDesc: 'N/A',
      itemVisualDesc: 'N/A',
      itemRestrictions: 'None',
    });
    fixture.detectChanges();
    expect(text()).not.toContain('N/A');
    expect(text()).not.toContain('Restrictions');
    expect(fixture.nativeElement.querySelector('.quote')).toBeNull();
  });
});

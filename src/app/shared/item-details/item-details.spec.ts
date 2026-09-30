import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
  active: 1,
  itemDescription: null,
  itemDescriptionSource: null,
};

const SRD = 'SRD 5.2.1, CC-BY-4.0';
// An item with nothing to read at all.
const BARE: Partial<Item> = {
  itemVisualDesc: '',
  itemShopkeeperDesc: '',
  itemRestrictions: null,
  itemDescription: null,
  itemDescriptionSource: null,
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

  const el = (selector: string) =>
    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(selector);
  const render = (overrides: Partial<Item>) => {
    fixture.componentRef.setInput('item', { ...ITEM, ...overrides });
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
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

  describe('rules description', () => {
    it('shows the SRD description with a provenance link to /legal', () => {
      render({ itemDescription: 'Grants a +1 bonus to AC.', itemDescriptionSource: SRD });
      expect(el('.description__text')!.textContent).toBe('Grants a +1 bonus to AC.');
      const provenance = el('.provenance')!;
      expect(provenance.textContent!.replace(/\s+/g, ' ').trim()).toBe(
        'Description: SRD 5.2.1 (CC BY 4.0)',
      );
      const anchor = provenance.querySelector('a')!;
      expect(anchor.textContent).toBe('SRD 5.2.1 (CC BY 4.0)');
      expect(anchor.getAttribute('href')).toBe('/legal');
    });

    it('labels a D&D Beyond description without a link', () => {
      render({ itemDescription: 'Some rules.', itemDescriptionSource: 'D&D Beyond' });
      const provenance = el('.provenance')!;
      expect(provenance.textContent!.replace(/\s+/g, ' ').trim()).toBe('Description: D&D Beyond');
      expect(provenance.querySelector('a')).toBeNull();
    });

    it('shows an unrecognised source verbatim, and no label when there is none', () => {
      render({ itemDescription: 'Some rules.', itemDescriptionSource: 'Homebrew Notes' });
      expect(el('.provenance')!.textContent).toContain('Homebrew Notes');
      expect(el('.provenance a')).toBeNull();

      render({ itemDescription: 'Some rules.', itemDescriptionSource: null });
      expect(el('.provenance')).toBeNull();
    });

    it('preserves paragraph breaks in the text', () => {
      const description = 'First paragraph.\nSecond paragraph.\n\nCharges | Effect';
      render({ itemDescription: description, itemDescriptionSource: 'D&D Beyond' });
      const body = el('.description__text')!;
      expect(body.textContent).toBe(description);
      expect(getComputedStyle(body).whiteSpace).toBe('pre-line');
    });

    it('renders the description before the flavour text and restrictions', () => {
      render({ itemDescription: 'Rules text.', itemDescriptionSource: SRD });
      const follows = (a: string, b: string) =>
        !!(el(a)!.compareDocumentPosition(el(b)!) & Node.DOCUMENT_POSITION_FOLLOWING);
      expect(follows('.description', '.quote')).toBe(true);
      expect(follows('.quote', '.visual')).toBe(true);
      expect(follows('.visual', '.restrictions')).toBe(true);
    });

    it('still shows the description when the detail fields are suppressed', () => {
      fixture.componentRef.setInput('fields', []);
      fixture.componentRef.setInput('showLink', false);
      render({ itemDescription: 'Rules text.', itemDescriptionSource: SRD });
      expect(el('dl')).toBeNull();
      expect(text()).toContain('Rules text.');
    });

    it('treats a whitespace-only description as absent', () => {
      render({ ...BARE, itemDescription: '  \n ', itemDescriptionSource: SRD });
      expect(el('.description')).toBeNull();
      expect(text()).toContain('No description available for this item yet.');
    });
  });

  describe('hand-written text', () => {
    it('is still shown alongside a description', () => {
      render({ itemDescription: 'Rules text.', itemDescriptionSource: SRD });
      expect(text()).toContain('“Only for those who can bear its weight.”');
      expect(text()).toContain('Gnarled darkwood');
      expect(text()).toContain('Restrictions: Sorcerer, Warlock, Wizard');
      expect(el('.empty')).toBeNull();
    });

    it('is shown on its own when there is no description', () => {
      render({ itemRestrictions: null });
      expect(text()).toContain('Only for those who can bear its weight.');
      expect(text()).not.toContain('Restrictions');
      expect(text()).not.toContain('Description:');
      expect(el('.empty')).toBeNull();
    });

    it('is safe with null restrictions', () => {
      expect(() => render({ itemRestrictions: null })).not.toThrow();
      expect(el('.restrictions')).toBeNull();
    });

    it('does not count as empty when only a restriction is present', () => {
      render({ ...BARE, itemRestrictions: 'Wizard' });
      expect(text()).toContain('Restrictions: Wizard');
      expect(el('.empty')).toBeNull();
    });
  });

  describe('fallback when there is nothing to show', () => {
    it('shows a muted note and a View on D&D Beyond link instead of an empty panel', () => {
      render(BARE);
      expect(text()).toContain('No description available for this item yet.');
      const anchors = fixture.nativeElement.querySelectorAll('a');
      expect(anchors).toHaveLength(1);
      expect(anchors[0].textContent).toContain('View on D&D Beyond');
      expect(anchors[0].getAttribute('href')).toBe(ITEM.itemUrl);
      expect(anchors[0].getAttribute('target')).toBe('_blank');
      expect(anchors[0].getAttribute('rel')).toBe('noopener noreferrer');
    });

    it('treats placeholder text as nothing', () => {
      render({
        ...BARE,
        itemVisualDesc: 'N/A',
        itemShopkeeperDesc: 'N/A',
        itemRestrictions: 'None',
      });
      expect(text()).toContain('No description available for this item yet.');
    });

    it('still links out when the detail link is suppressed, as the table row does', () => {
      fixture.componentRef.setInput('fields', []);
      fixture.componentRef.setInput('showLink', false);
      render(BARE);
      expect(text()).toContain('No description available');
      expect(el('a')!.getAttribute('href')).toBe(ITEM.itemUrl);
    });

    it('omits the link when the item has no URL', () => {
      render({ ...BARE, itemUrl: '' });
      expect(text()).toContain('No description available');
      expect(el('a')).toBeNull();
    });

    it('is never an empty panel for any combination of content', () => {
      const cases: Partial<Item>[] = [
        BARE,
        { ...BARE, itemDescription: 'Rules.', itemDescriptionSource: SRD },
        { ...BARE, itemShopkeeperDesc: 'A quote.' },
        { ...BARE, itemVisualDesc: 'Shiny.' },
        { ...BARE, itemRestrictions: 'Wizard' },
        { ...BARE, itemRestrictions: 'None' },
      ];
      for (const overrides of cases) {
        render(overrides);
        expect(text().trim().length).toBeGreaterThan(0);
      }
    });
  });
});

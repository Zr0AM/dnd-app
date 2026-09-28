import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { items } from '../../dev/items.fixture';
import { LootSplitter } from '../loot-splitter/loot-splitter';
import { TreasureGenerator } from './treasure-generator';
import { Hoard } from './hoard';

const KNOWN_HOARD: Hoard = {
  cr: 0,
  band: 'cr0-4',
  coinScale: 1,
  itemRoll: 40,
  coins: { pp: 0, gp: 20, sp: 300, cp: 600 },
  gems: [{ name: 'Azurite', valueGp: 10, count: 2 }],
  art: [],
  magic: [
    { key: 'item-12', table: 'A', rarity: 'Common', item: items[11], count: 2 },
    { key: 'table-G', table: 'G', rarity: 'Rare', item: null, count: 1 },
  ],
};

describe('TreasureGenerator', () => {
  let httpMock: HttpTestingController;
  let harness: RouterTestingHarness;
  let el: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            { path: 'treasure', component: TreasureGenerator },
            { path: 'loot-splitter', component: LootSplitter },
          ],
          withComponentInputBinding(),
        ),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  const stable = () => TestBed.inject(ApplicationRef).whenStable();

  async function render(flush = true) {
    harness = await RouterTestingHarness.create('/treasure');
    TestBed.tick();
    if (flush) {
      httpMock.expectOne('/api/items').flush({ success: true, results: items });
      await stable();
    }
    harness.detectChanges();
    el = harness.routeNativeElement as HTMLElement;
  }

  function rollButton(): HTMLButtonElement {
    return el.querySelector('.hoard-roll') as HTMLButtonElement;
  }

  function setHoard(hoard: Hoard) {
    const cmp = harness.routeDebugElement!.componentInstance as unknown as {
      hoard: { set(h: Hoard): void };
    };
    cmp.hoard.set(hoard);
    harness.detectChanges();
  }

  it('shows a sealed vault before the first roll', async () => {
    await render();
    expect(el.textContent).toContain('The vault is sealed');
    expect(el.querySelector('.hoard-result')).toBeNull();
  });

  it('disables rolling until the catalog has loaded', async () => {
    await render(false);
    expect(rollButton().disabled).toBe(true);
    expect(rollButton().textContent).toContain('Stocking the vault');
    httpMock.expectOne('/api/items').flush({ success: true, results: items });
    await stable();
    harness.detectChanges();
    expect(rollButton().disabled).toBe(false);
  });

  it('rolls a hoard for the selected challenge rating', async () => {
    await render();
    setCr(20);
    roll();

    expect(el.querySelector('.hoard-result')).not.toBeNull();
    const head = el.querySelector('.hoard-result__head')?.textContent;
    expect(head).toContain('CR 20');
    expect(head).toContain('CR 17+ table');
    expect(head).toContain('Coin ×');
    // CR 17+ always yields gold and platinum.
    expect(el.querySelector('.coin--gold')).not.toBeNull();
    expect(el.querySelector('.coin--platinum')).not.toBeNull();
    expect(rollButton().textContent).toContain('Roll again');
  });

  it('totals coin, gems and art but lists magic items separately', async () => {
    await render();
    setHoard(KNOWN_HOARD);
    // 600 cp + 300 sp + 20 gp = 56 gp, plus 2 × 10 gp gems.
    expect(el.querySelector('.hoard-total__value')?.textContent).toContain('76 gp');
    expect(el.querySelector('.hoard-total__sub')?.textContent).toContain('3 magic items');
    const text = el.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('2 × Azurite');
    expect(text).toContain('2 × Potion of Healing');
    expect(el.textContent).toContain('Potion of Healing');
    expect(el.textContent).toContain('Unnamed rare item');
    expect(el.textContent).toContain('Table G');
  });

  it('expands a magic item in place to show its catalog entry', async () => {
    await render();
    setHoard(KNOWN_HOARD);
    const toggle = el.querySelector('.hoard-magic__toggle') as HTMLButtonElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(el.querySelector('app-item-details')).toBeNull();

    toggle.click();
    harness.detectChanges();
    const details = el.querySelector('app-item-details') as HTMLElement;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.getAttribute('aria-controls')).toBe(details.id);
    const text = details.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('Potion');
    expect(text).toContain('50 gp');
    expect(text).toContain('Red liquid that shimmers when shaken.');
    expect(details.querySelector('a')?.getAttribute('href')).toBe(items[11].itemUrl);

    toggle.click();
    harness.detectChanges();
    expect(el.querySelector('app-item-details')).toBeNull();
  });

  it('leaves unnamed placeholder items as plain rows', async () => {
    await render();
    setHoard(KNOWN_HOARD);
    expect(el.querySelectorAll('.hoard-magic__toggle')).toHaveLength(1);
    expect(el.textContent).toContain('Unnamed rare item');
  });

  it('collapses expanded items when a new hoard is rolled', async () => {
    await render();
    setCr(0);
    for (let i = 0; i < 50 && !el.querySelector('.hoard-magic__toggle'); i++) {
      roll();
    }
    (el.querySelector('.hoard-magic__toggle') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(el.querySelector('app-item-details')).not.toBeNull();
    roll();
    expect(el.querySelector('app-item-details')).toBeNull();
  });

  function slider(): HTMLInputElement {
    return el.querySelector('#cr-slider') as HTMLInputElement;
  }

  function setCr(cr: number) {
    slider().value = String(cr);
    slider().dispatchEvent(new Event('input'));
    harness.detectChanges();
  }

  function roll() {
    rollButton().click();
    harness.detectChanges();
  }

  function replay(code: string) {
    const input = el.querySelector('#hoard-code') as HTMLInputElement;
    input.value = code;
    (el.querySelector('.replay button[type="submit"]') as HTMLButtonElement).click();
    harness.detectChanges();
  }

  const codeText = () => el.querySelector('.hoard-code__value')?.textContent?.trim() ?? '';
  const resultText = () =>
    [...el.querySelectorAll('.hoard-group')].map((g) => g.textContent).join('|');
  const flush = () => new Promise((resolve) => setTimeout(resolve));

  const readout = () => el.querySelector('.cr__readout')?.textContent?.replace(/\s+/g, ' ') ?? '';

  it('describes the table and coin scale for the chosen CR', async () => {
    await render();
    setCr(11);
    expect(readout()).toContain('CR 11');
    expect(readout()).toContain('CR 11–16 table');
    expect(readout()).toMatch(/Coin ×0\.\d the table’s DMG average/);
    setCr(16);
    expect(readout()).toMatch(/Coin ×[1-9]\.\d the table’s DMG average/);
  });

  it('nudges CR with the step buttons and stops at the ends', async () => {
    await render();
    const [lower, raise] = el.querySelectorAll<HTMLButtonElement>('.cr__stepper .btn--icon');
    setCr(0);
    expect(lower.disabled).toBe(true);
    raise.click();
    harness.detectChanges();
    expect(slider().value).toBe('1');
    setCr(30);
    expect(raise.disabled).toBe(true);
    lower.click();
    harness.detectChanges();
    expect(readout()).toContain('CR 29');
  });

  it('labels each roll with a hoard code for its CR', async () => {
    await render();
    setCr(13);
    roll();
    expect(codeText()).toMatch(/^CR13-[0-9A-Z]{7}$/);
  });

  it('replays the exact hoard from a pasted code and restores its CR', async () => {
    await render();
    setCr(22);
    roll();
    const code = codeText();
    const original = resultText();

    setCr(2);
    roll();
    expect(codeText()).not.toBe(code);

    replay(`  ${code.toLowerCase()} `);
    expect(codeText()).toBe(code);
    expect(resultText()).toBe(original);
    expect(slider().value).toBe('22');
  });

  it('rejects a malformed code without disturbing the current hoard', async () => {
    await render();
    roll();
    const code = codeText();
    replay('not-a-code');
    expect(el.querySelector('.replay__error')?.textContent).toContain('doesn’t look like a hoard code');
    expect(el.querySelector('#hoard-code')?.getAttribute('aria-invalid')).toBe('true');
    expect(codeText()).toBe(code);
  });

  it('copies the hoard code to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await render();
    roll();
    (el.querySelector('.hoard-code__copy') as HTMLButtonElement).click();
    await flush();
    harness.detectChanges();
    expect(writeText).toHaveBeenCalledWith(codeText());
    expect(el.querySelector('.hoard-code__copy')?.textContent).toContain('Copied');
  });

  it('pre-selects the code for a manual copy when the clipboard is blocked', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await render();
    roll();
    (el.querySelector('.hoard-code__copy') as HTMLButtonElement).click();
    await flush();
    harness.detectChanges();
    expect(el.querySelector('.hoard-code__copy')?.textContent).toContain('Ctrl/⌘+C');
    expect(getSelection()?.toString()).toBe(codeText());
  });

  it('hands the coins to the loot splitter', async () => {
    await render();
    setHoard(KNOWN_HOARD);
    const split = el.querySelector('.hoard-total a') as HTMLAnchorElement;
    expect(split.getAttribute('href')).toBe('/loot-splitter?gp=20&sp=300&cp=600');

    split.click();
    await stable();
    harness.detectChanges();
    const splitter = harness.routeNativeElement as HTMLElement;
    expect(splitter.querySelector('.loot-pool__value')?.textContent).toContain('56 gp');
  });
});

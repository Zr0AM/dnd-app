import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameDataService, SpellListRow } from './game-data.service';

const spell = { spellID: 1, spellName: 'Fireball', active: 1 } as SpellListRow;
const LISTS = ['/api/spells', '/api/monsters', '/api/equipment'];

describe('GameDataService', () => {
  let service: GameDataService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(GameDataService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  const settle = () => TestBed.inject(ApplicationRef).whenStable();

  // All three list resources request on the first tick. Answer `url` with the
  // given body and the others with empty lists so verify() sees no stragglers.
  async function flushLists(
    url: string,
    body: unknown,
    init?: { status: number; statusText: string },
  ) {
    TestBed.tick();
    for (const req of httpMock.match((r) => LISTS.includes(r.url))) {
      if (req.request.url === url) {
        req.flush(body, init);
      } else {
        req.flush({ success: true, results: [] });
      }
    }
    await settle();
  }

  it('exposes an empty default list before the request resolves', async () => {
    expect(service.spells.value()).toEqual([]);
    await flushLists('/api/spells', { success: true, results: [] });
  });

  it('parses the results array of a list endpoint', async () => {
    await flushLists('/api/spells', { success: true, results: [spell] });
    expect(service.spells.value()).toEqual([spell]);
  });

  it('drops retired rows even if the API sends them', async () => {
    await flushLists('/api/spells', {
      success: true,
      results: [spell, { ...spell, spellID: 2, active: 0 }, { spellID: 3 }],
    });
    expect(service.spells.value().map((s) => s.spellID)).toEqual([1, 3]);
  });

  it('falls back to an empty list when results is missing', async () => {
    await flushLists('/api/spells', { success: true });
    expect(service.spells.value()).toEqual([]);
  });

  it('reports an error on a failed request and can reload', async () => {
    await flushLists(
      '/api/monsters',
      { success: false },
      { status: 502, statusText: 'Bad Gateway' },
    );
    expect(service.monsters.error()).toBeTruthy();

    service.monsters.reload();
    TestBed.tick();
    httpMock
      .expectOne('/api/monsters')
      .flush({ success: true, results: [{ monsterID: 1, active: 1 }] });
    await settle();
    expect(service.monsters.error()).toBeUndefined();
    expect(service.monsters.value()).toHaveLength(1);
  });

  it('requests no detail until an id is set, then fetches that id', async () => {
    const id = signal<number | null>(null);
    const detail = TestBed.runInInjectionContext(() => service.spellDetail(() => id()));
    await flushLists('/api/spells', { success: true, results: [] });
    httpMock.expectNone('/api/spells/1');
    expect(detail.status()).toBe('idle');
    expect(detail.value()).toBeUndefined();

    id.set(1);
    TestBed.tick();
    httpMock
      .expectOne('/api/spells/1')
      .flush({ success: true, results: [{ spellID: 1, spellDescription: 'Boom' }] });
    await settle();
    expect(detail.value()).toMatchObject({ spellID: 1, spellDescription: 'Boom' });
  });

  it('gives an undefined detail when the row is not found', async () => {
    const id = signal<number | null>(5);
    const detail = TestBed.runInInjectionContext(() => service.monsterDetail(() => id()));
    TestBed.tick();
    for (const req of httpMock.match((r) => LISTS.includes(r.url))) {
      req.flush({ success: true, results: [] });
    }
    httpMock.expectOne('/api/monsters/5').flush({ success: true, results: [] });
    await settle();
    expect(detail.value()).toBeUndefined();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest as onCatchAll } from '../../functions/api/[[path]]';
import * as equipment from '../../functions/api/equipment';
import * as equipmentById from '../../functions/api/equipment/[id]';
import * as monsters from '../../functions/api/monsters';
import * as monstersById from '../../functions/api/monsters/[id]';
import * as spells from '../../functions/api/spells';
import * as spellsById from '../../functions/api/spells/[id]';
import { canonicalQuery } from '../../functions/_lib/rest-proxy';

const TOKEN = 'test-token';

type Stub = ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;
type Handler = (context: never) => Response | Promise<Response>;
interface Options {
  upstream?: () => Promise<Response> | Response;
  token?: string;
  params?: Record<string, string>;
}

function upstreamOk() {
  return new Response('{"success":true,"results":[{"x":1}]}', {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function call(handler: Handler, path: string, options: Options = {}, method = 'GET') {
  const fetchStub: Stub = vi.fn(async () => (options.upstream ?? upstreamOk)());
  const env = {
    DND_DB_REST_CONN: { fetch: fetchStub },
    DND_API_TOKEN: 'token' in options ? options.token : TOKEN,
  };
  const request = new Request(`https://dnd.example${path}`, { method });
  const res = await handler({ request, env, params: options.params } as never);
  return { res, fetchStub };
}

afterEach(() => vi.restoreAllMocks());

describe.each([
  ['spells', spells, 'SpellListView', 'spellLevel=3'],
  ['monsters', monsters, 'MonsterListView', 'creatureTypeName=Beast'],
  ['equipment', equipment, 'EquipmentListView', 'equipmentKind=weapon'],
] as const)('GET /api/%s (list)', (name, mod, view, filter) => {
  const path = `/api/${name}`;

  it('reads the list view upstream with active=1 and the bearer token', async () => {
    const { res, fetchStub } = await call(mod.onRequestGet, path);
    expect(res.status).toBe(200);
    expect(fetchStub.mock.calls[0][0]).toBe(`https://dnd-db-rest/rest/${view}?active=1`);
    const headers = new Headers(fetchStub.mock.calls[0][1]?.headers);
    expect(headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
  });

  it('forwards an allowed filter and overrides any caller-supplied active', async () => {
    const { fetchStub } = await call(mod.onRequestGet, `${path}?${filter}&active=0&ACTIVE=2`);
    const url = new URL(fetchStub.mock.calls[0][0]);
    const [key, value] = filter.split('=');
    expect(url.searchParams.get(key)).toBe(value);
    expect(url.searchParams.getAll('active')).toEqual(['1']);
  });

  it('rejects unknown query params without calling upstream', async () => {
    const { res, fetchStub } = await call(mod.onRequestGet, `${path}?secretColumn=x`);
    expect(res.status).toBe(400);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('answers 500 when the token secret is missing', async () => {
    const { res, fetchStub } = await call(mod.onRequestGet, path, { token: undefined });
    expect(res.status).toBe(500);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('maps upstream 5xx and auth failures to a generic 502', async () => {
    for (const status of [401, 403, 500]) {
      const { res } = await call(mod.onRequestGet, path, {
        upstream: () => new Response('boom: secret detail', { status }),
      });
      expect(res.status).toBe(502);
      expect(await res.text()).not.toContain('secret detail');
    }
  });

  it('answers a network failure with 502', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { res } = await call(mod.onRequestGet, path, {
      upstream: () => Promise.reject(new Error('down')),
    });
    expect(res.status).toBe(502);
  });

  it('mirrors GET for HEAD without a body and rejects other methods', async () => {
    const head = await call(mod.onRequestHead, path, {}, 'HEAD');
    expect(head.res.status).toBe(200);
    expect(await head.res.text()).toBe('');
    const post = await call(mod.onRequest, path, {}, 'POST');
    expect(post.res.status).toBe(405);
    expect(post.res.headers.get('Allow')).toBe('GET, HEAD');
  });
});

describe.each([
  ['spells', spellsById, 'Spell'],
  ['monsters', monstersById, 'Monster'],
  ['equipment', equipmentById, 'Equipment'],
] as const)('GET /api/%s/:id (detail)', (name, mod, table) => {
  const path = (id: string) => `/api/${name}/${id}`;

  it('reads one base-table row upstream, active only', async () => {
    const { res, fetchStub } = await call(mod.onRequestGet, path('42'), { params: { id: '42' } });
    expect(res.status).toBe(200);
    expect(fetchStub.mock.calls[0][0]).toBe(`https://dnd-db-rest/rest/${table}/42?active=1`);
  });

  it('accepts only numeric ids', async () => {
    for (const id of ['abc', '1/2', '-1', '1.5', '', '1234567890']) {
      const { res, fetchStub } = await call(mod.onRequestGet, path(id || 'x'), { params: { id } });
      expect(res.status, id).toBe(400);
      expect(fetchStub).not.toHaveBeenCalled();
    }
  });

  it('accepts only the fields param', async () => {
    const ok = await call(mod.onRequestGet, `${path('7')}?fields=spellID`, { params: { id: '7' } });
    expect(ok.res.status).toBe(200);
    for (const query of ['limit=1', 'active=0', 'sort_by=x']) {
      const { res, fetchStub } = await call(mod.onRequestGet, `${path('7')}?${query}`, {
        params: { id: '7' },
      });
      expect(res.status, query).toBe(400);
      expect(fetchStub).not.toHaveBeenCalled();
    }
  });

  it('passes a not-found row through as a 404-style error, not a leak', async () => {
    const { res } = await call(mod.onRequestGet, path('999999'), {
      params: { id: '999999' },
      upstream: () => new Response('{"success":false,"error":"Not found"}', { status: 404 }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ success: false, error: 'Bad request' });
  });
});

describe('canonicalQuery', () => {
  it('renames keys to their canonical casing and keeps values and repeats', () => {
    expect(canonicalQuery('?SPELLLEVEL=3&schoolname=Evocation&schoolname=Abjuration', [
      'spellLevel',
      'schoolName',
    ])).toBe('?spellLevel=3&schoolName=Evocation&schoolName=Abjuration');
  });

  it('returns an empty string for no params and null for an unknown one', () => {
    expect(canonicalQuery('', ['a'])).toBe('');
    expect(canonicalQuery('?b=1', ['a'])).toBeNull();
  });
});

describe('catch-all', () => {
  it('still answers 404 for unknown API paths', () => {
    expect(onCatchAll().status).toBe(404);
  });
});

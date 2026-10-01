import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest as onCatchAll } from '../../functions/api/[[path]]';
import { onRequest, onRequestGet, onRequestHead } from '../../functions/api/items';

const TOKEN = 'test-token';
const UPSTREAM_BASE = 'https://dnd-db-rest/rest/Item';

type Handler = (context: Parameters<typeof onRequestGet>[0]) => Response | Promise<Response>;
type Stub = ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;
interface Options {
  upstream?: () => Promise<Response> | Response;
  token?: string;
}

function upstreamOk() {
  return new Response('{"success":true,"results":[{"itemID":1}]}', {
    headers: { 'Content-Type': 'application/json' },
  });
}

// Invokes a Pages Function with just the parts of the context the handlers use.
async function call(handler: Handler, path: string, options: Options = {}, method = 'GET') {
  const fetchStub: Stub = vi.fn(async () => (options.upstream ?? upstreamOk)());
  const env = {
    DND_DB_REST_CONN: { fetch: fetchStub },
    DND_API_TOKEN: 'token' in options ? options.token : TOKEN,
  };
  const request = new Request(`https://dnd.example${path}`, { method });
  const res = await handler({ request, env } as unknown as Parameters<Handler>[0]);
  return { res, fetchStub };
}

const get = (path: string, options?: Options) => call(onRequestGet, path, options);

function upstreamUrl(fetchStub: Stub): URL {
  expect(fetchStub).toHaveBeenCalledTimes(1);
  return new URL(fetchStub.mock.calls[0][0]);
}

afterEach(() => vi.restoreAllMocks());

describe('GET /api/items', () => {
  it('calls the service binding with an exact upstream URL that always has active=1', async () => {
    const { res, fetchStub } = await get('/api/items');
    expect(res.status).toBe(200);
    expect(fetchStub.mock.calls[0][0]).toBe(`${UPSTREAM_BASE}?active=1`);
  });

  it('sends the bearer token and nothing else in the headers', async () => {
    const { fetchStub } = await get('/api/items?limit=5');
    const headers = new Headers(fetchStub.mock.calls[0][1]?.headers);
    expect(headers.get('Authorization')).toBe(`Bearer ${TOKEN}`);
    expect([...headers.keys()]).toEqual(['authorization']);
  });

  it('overrides every caller-supplied active param', async () => {
    for (const query of ['active=0', 'ACTIVE=0&active=2&Active=', 'active=1&active=0']) {
      const { fetchStub } = await get(`/api/items?${query}`);
      const url = upstreamUrl(fetchStub);
      expect(url.searchParams.getAll('active')).toEqual(['1']);
      expect(url.search.match(/active=/gi)).toHaveLength(1);
    }
  });

  it('keeps the other allowed params, values and repeats', async () => {
    const { fetchStub } = await get(
      '/api/items?sort_by=itemName&order=DESC&limit=20&offset=40&fields=itemName,itemCost' +
        '&itemRarity=Very+Rare&itemType=Wondrous%20item&itemType=Weapon&itemName=Bag%20%26%20Holding',
    );
    const url = upstreamUrl(fetchStub);
    expect(url.origin + url.pathname).toBe(UPSTREAM_BASE);
    const params = url.searchParams;
    expect(params.get('sort_by')).toBe('itemName');
    expect(params.get('order')).toBe('DESC');
    expect(params.get('limit')).toBe('20');
    expect(params.get('offset')).toBe('40');
    expect(params.get('fields')).toBe('itemName,itemCost');
    expect(params.get('itemRarity')).toBe('Very Rare');
    expect(params.getAll('itemType')).toEqual(['Wondrous item', 'Weapon']);
    expect(params.get('itemName')).toBe('Bag & Holding');
    expect(params.getAll('active')).toEqual(['1']);
    expect([...params.keys()]).toHaveLength(10);
  });

  it('accepts every Item column as a filter', async () => {
    const columns = [
      'itemID',
      'itemName',
      'itemRarity',
      'itemCost',
      'itemType',
      'itemRestrictions',
      'itemAttunement',
      'itemSource',
      'itemUrl',
      'itemVisualDesc',
      'itemShopkeeperDesc',
      'itemDescription',
      'itemDescriptionSource',
    ];
    const { res, fetchStub } = await get(`/api/items?${columns.map((c) => `${c}=x`).join('&')}`);
    expect(res.status).toBe(200);
    expect([...upstreamUrl(fetchStub).searchParams.keys()]).toEqual([...columns, 'active']);
  });

  it('matches keys case-insensitively and forwards the canonical name', async () => {
    const { fetchStub } = await get('/api/items?SORT_BY=itemName&ItemRarity=Rare&LIMIT=3');
    const params = upstreamUrl(fetchStub).searchParams;
    expect([...params.keys()]).toEqual(['sort_by', 'itemRarity', 'limit', 'active']);
  });

  it('rejects unknown keys with a generic 400 before contacting upstream', async () => {
    for (const key of ['x-y', 'xy', 'itemRarity2', 'inactive', 'itemName.x', '', 'constructor']) {
      const { res, fetchStub } = await get(`/api/items?limit=5&${key}=1`);
      expect(res.status).toBe(400);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ success: false, error: 'Unsupported query parameter' });
      if (key) expect(text).not.toContain(key);
      expect(fetchStub).not.toHaveBeenCalled();
    }
  });

  it('returns 500 JSON when the token is missing, without calling upstream', async () => {
    for (const token of [undefined, '']) {
      const { res, fetchStub } = await get('/api/items', { token });
      expect(res.status).toBe(500);
      expect(res.headers.get('Content-Type')).toContain('application/json');
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(await res.json()).toEqual({
        success: false,
        error: 'DND_API_TOKEN secret is not configured',
      });
      expect(fetchStub).not.toHaveBeenCalled();
    }
  });

  it('passes the upstream body through with a five-minute public cache', async () => {
    const { res } = await get('/api/items?limit=1');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(await res.text()).toBe('{"success":true,"results":[{"itemID":1}]}');
  });

  describe('upstream failures', () => {
    const leaky = () =>
      new Response('{"error":"D1_ERROR: no such column: xy at offset 12"}', { status: 500 });

    it('maps 5xx to a generic 502 and never relays the upstream body', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { res } = await get('/api/items?sort_by=nope', { upstream: leaky });
      expect(res.status).toBe(502);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ success: false, error: 'Upstream error' });
      expect(text).not.toMatch(/D1_ERROR|column/);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(String(spy.mock.calls[0])).toContain('500');
      expect(String(spy.mock.calls[0])).not.toMatch(/D1_ERROR|column|xy/);
    });

    it('passes a 4xx status through with a generic body', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { res } = await get('/api/items', {
        upstream: () => new Response('{"error":"bad limit: abc"}', { status: 422 }),
      });
      expect(res.status).toBe(422);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(await res.json()).toEqual({ success: false, error: 'Bad request' });
    });

    it('treats an upstream 401/403 as our own fault (502), not a bad request', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      for (const status of [401, 403]) {
        const { res } = await get('/api/items', { upstream: () => new Response('no', { status }) });
        expect(res.status).toBe(502);
        expect(await res.json()).toEqual({ success: false, error: 'Upstream error' });
      }
    });

    it('returns a generic 502 when the service binding throws', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const { res } = await get('/api/items', {
        upstream: () => Promise.reject(new Error('secret connection detail')),
      });
      expect(res.status).toBe(502);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(await res.json()).toEqual({ success: false, error: 'Upstream error' });
      expect(String(spy.mock.calls[0])).not.toContain('secret');
    });
  });
});

describe('HEAD /api/items', () => {
  it('mirrors the GET status and headers with an empty body', async () => {
    const { res, fetchStub } = await call(onRequestHead, '/api/items?limit=1', {}, 'HEAD');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300');
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(await res.text()).toBe('');
    expect(fetchStub.mock.calls[0][0]).toBe(`${UPSTREAM_BASE}?limit=1&active=1`);
  });

  it('applies the same validation as GET', async () => {
    const { res } = await call(onRequestHead, '/api/items?bogus=1', {}, 'HEAD');
    expect(res.status).toBe(400);
    expect(await res.text()).toBe('');
  });
});

describe('other methods on /api/items', () => {
  it('answers 405 JSON with an Allow header', async () => {
    const { res } = await call(onRequest, '/api/items', {}, 'POST');
    expect(res.status).toBe(405);
    expect(res.headers.get('Allow')).toBe('GET, HEAD');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ success: false, error: 'Method not allowed' });
  });
});

describe('/api/* catch-all', () => {
  it('answers unknown API paths with a JSON 404', async () => {
    const { res } = await call(onCatchAll, '/api/nope');
    expect(res.status).toBe(404);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ success: false, error: 'Not found' });
  });
});

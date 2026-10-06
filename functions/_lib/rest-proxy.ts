import { errorResponse } from './error-response';
import { withActiveOnly } from './active-only';

// Structural types so the handlers can be type-checked and unit-tested from src/.
export interface Env {
  DND_DB_REST_CONN: { fetch(input: string, init?: RequestInit): Promise<Response> };
  DND_API_TOKEN?: string;
}
export interface Context {
  request: Request;
  env: Env;
  params?: Record<string, string | string[]>;
}

const PAGING_KEYS = ['sort_by', 'order', 'limit', 'offset', 'fields'];

// Returns the query string to forward upstream with every key renamed to its
// canonical spelling (matching is case-insensitive), or null when the caller
// sent a key that is not allowed. `active` is always accepted: withActiveOnly
// overrides it.
export function canonicalQuery(search: string, filterKeys: readonly string[]): string | null {
  const canonical = new Map(
    [...PAGING_KEYS, 'active', ...filterKeys].map((key) => [key.toLowerCase(), key]),
  );
  const out = new URLSearchParams();
  for (const [key, value] of new URLSearchParams(search)) {
    const name = canonical.get(key.toLowerCase());
    if (name === undefined) {
      return null;
    }
    out.append(name, value);
  }
  return out.size === 0 ? '' : `?${out}`;
}

async function forward(env: Env, path: string, query: string, label: string): Promise<Response> {
  if (!env.DND_API_TOKEN) {
    return errorResponse(500, 'DND_API_TOKEN secret is not configured');
  }
  let upstream: Response;
  try {
    upstream = await env.DND_DB_REST_CONN.fetch(`https://dnd-db-rest/rest/${path}${query}`, {
      headers: { Authorization: `Bearer ${env.DND_API_TOKEN}` },
    });
  } catch {
    console.error(`${label}: upstream fetch failed`);
    return errorResponse(502, 'Upstream error');
  }
  if (!upstream.ok) {
    console.error(`${label}: upstream responded ${upstream.status}`);
    await upstream.body?.cancel();
    const callerError =
      upstream.status >= 400 &&
      upstream.status < 500 &&
      upstream.status !== 401 &&
      upstream.status !== 403;
    return callerError
      ? errorResponse(upstream.status, 'Bad request')
      : errorResponse(502, 'Upstream error');
  }
  const response = new Response(upstream.body, upstream);
  response.headers.set('Cache-Control', 'public, max-age=300');
  return response;
}

function methodGuards(get: (context: Context) => Promise<Response>) {
  return {
    onRequestGet: get,
    // Without this, Pages serves the SPA shell (200 text/html) for HEAD.
    onRequestHead: async (context: Context): Promise<Response> => {
      const response = await get(context);
      await response.body?.cancel();
      return new Response(null, response);
    },
    onRequest: (): Response => {
      const response = errorResponse(405, 'Method not allowed');
      response.headers.set('Allow', 'GET, HEAD');
      return response;
    },
  };
}

// GET /api/<name>: the active rows of a read-only list view, with an allowlist of filter columns.
export function listHandlers(view: string, filterKeys: readonly string[]) {
  return methodGuards(async ({ request, env }) => {
    const query = canonicalQuery(new URL(request.url).search, filterKeys);
    if (query === null) {
      return errorResponse(400, 'Unsupported query parameter');
    }
    return forward(env, view, withActiveOnly(query), view);
  });
}

// GET /api/<name>/<id>: one active row of a base table. Only `fields` is accepted.
export function detailHandlers(table: string) {
  return methodGuards(async ({ request, env, params }) => {
    const id = Array.isArray(params?.id) ? params.id[0] : params?.id;
    if (!id || !/^\d{1,9}$/.test(id)) {
      return errorResponse(400, 'Invalid id');
    }
    const search = new URL(request.url).search;
    for (const key of new URLSearchParams(search).keys()) {
      if (key.toLowerCase() !== 'fields') {
        return errorResponse(400, 'Unsupported query parameter');
      }
    }
    const query = canonicalQuery(search, []);
    if (query === null) {
      return errorResponse(400, 'Unsupported query parameter');
    }
    return forward(env, `${table}/${id}`, withActiveOnly(query), table);
  });
}

import { errorResponse } from '../_lib/error-response';
import { withActiveOnly } from '../_lib/active-only';
import { canonicalItemQuery } from '../_lib/item-query';

// Structural types instead of @cloudflare/workers-types' PagesFunction/Fetcher so the
// handlers can also be type-checked (and unit-tested) from src/ under the DOM lib.
interface Env {
  DND_DB_REST_CONN: { fetch(input: string, init?: RequestInit): Promise<Response> };
  DND_API_TOKEN?: string;
}
interface Context {
  request: Request;
  env: Env;
}

// Proxies GET /api/items to the dnd-db-rest Worker over the service binding,
// attaching the bearer token so the secret never reaches the browser.
//
// Only an allowlist of query params is forwarded (see _lib/item-query.ts):
// sort_by, order, limit, offset, fields, plus any Item column as a filter
// (e.g. ?itemRarity=Rare). Keys are matched case-insensitively and forwarded
// with their canonical name; any other key gets a 400 without reaching D1.
// Only active items are ever requested: active=1 is always sent upstream,
// overriding any caller-supplied active param.
//
// Upstream failures are never relayed: they are logged (status only) and
// answered with a generic JSON error (502 for 5xx, the same 4xx otherwise).
// HEAD mirrors GET without a body; other methods get 405.
export const onRequestGet = async ({ request, env }: Context): Promise<Response> => {
  if (!env.DND_API_TOKEN) {
    return errorResponse(500, 'DND_API_TOKEN secret is not configured');
  }

  const query = canonicalItemQuery(new URL(request.url).search);
  if (query === null) {
    return errorResponse(400, 'Unsupported query parameter');
  }

  // Service bindings ignore the hostname; only the path and query string
  // reach the Worker, but the Request constructor requires an absolute URL.
  let upstream: Response;
  try {
    upstream = await env.DND_DB_REST_CONN.fetch(
      `https://dnd-db-rest/rest/Item${withActiveOnly(query)}`,
      { headers: { Authorization: `Bearer ${env.DND_API_TOKEN}` } },
    );
  } catch {
    console.error('items: upstream fetch failed');
    return errorResponse(502, 'Upstream error');
  }

  if (!upstream.ok) {
    console.error(`items: upstream responded ${upstream.status}`);
    await upstream.body?.cancel();
    // 401/403 mean our own token is wrong, which is not the caller's fault.
    const callerError =
      upstream.status >= 400 &&
      upstream.status < 500 &&
      upstream.status !== 401 &&
      upstream.status !== 403;
    return callerError
      ? errorResponse(upstream.status, 'Bad request')
      : errorResponse(502, 'Upstream error');
  }

  // The catalog changes rarely; let browsers and the Cloudflare edge reuse
  // successful responses for a few minutes instead of re-querying D1.
  const response = new Response(upstream.body, upstream);
  response.headers.set('Cache-Control', 'public, max-age=300');
  return response;
};

// Without this, Pages serves the SPA shell (200 text/html) for HEAD.
export const onRequestHead = async (context: Context): Promise<Response> => {
  const response = await onRequestGet(context);
  await response.body?.cancel();
  return new Response(null, response);
};

export const onRequest = (): Response => {
  const response = errorResponse(405, 'Method not allowed');
  response.headers.set('Allow', 'GET, HEAD');
  return response;
};

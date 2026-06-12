interface Env {
  DND_DB_REST_CONN: Fetcher;
  DND_API_TOKEN: string;
}

// Proxies GET /api/items to the dnd-db-rest Worker over the service binding,
// attaching the bearer token so the secret never reaches the browser.
// Supported query params (forwarded as-is): sort_by, order, limit, offset,
// plus any Item column as a filter (e.g. ?itemRarity=Rare).
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.DND_API_TOKEN) {
    return Response.json(
      { success: false, error: 'DND_API_TOKEN secret is not configured' },
      { status: 500 },
    );
  }

  // Service bindings ignore the hostname; only the path and query string
  // reach the Worker, but the Request constructor requires an absolute URL.
  const search = new URL(request.url).search;
  const upstream = await env.DND_DB_REST_CONN.fetch(`https://dnd-db-rest/rest/Item${search}`, {
    headers: { Authorization: `Bearer ${env.DND_API_TOKEN}` },
  });
  if (!upstream.ok) {
    return upstream;
  }

  // The catalog changes rarely; let browsers and the Cloudflare edge reuse
  // successful responses for a few minutes instead of re-querying D1.
  const response = new Response(upstream.body, upstream);
  response.headers.set('Cache-Control', 'public, max-age=300');
  return response;
};

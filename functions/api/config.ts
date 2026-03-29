// functions/api/config.ts
export async function onRequest(context: any): Promise<Response> {
  // context.env contains your bindings from wrangler.toml
  // We return it directly so it matches the expected EnvConfig interface
  return new Response(JSON.stringify(context.env || {}), {
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

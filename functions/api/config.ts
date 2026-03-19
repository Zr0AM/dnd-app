// functions/api/config.ts
export async function onRequest(context: any): Promise<Response> {
  // context.env contains your bindings from wrangler.toml
  return new Response(JSON.stringify({
    ENV: context.env
  }), {
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

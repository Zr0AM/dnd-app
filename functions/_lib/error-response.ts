// Generic JSON error for the API. The message is always a fixed string (never
// upstream output or caller input) and errors are never cached.
export function errorResponse(status: number, error: string): Response {
  return Response.json(
    { success: false, error },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

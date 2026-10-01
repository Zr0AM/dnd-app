import { errorResponse } from '../_lib/error-response';

// Catch-all for /api/*: without it Pages serves the SPA shell (200 text/html)
// for unknown API paths. More specific routes such as /api/items win over it.
export const onRequest = (): Response => errorResponse(404, 'Not found');

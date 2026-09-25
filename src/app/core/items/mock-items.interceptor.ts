import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { delay, from, map } from 'rxjs';
import { environment } from '../../../environments/environment';

// Dev-only: serves the local sample catalog for GET /api/items so the app is
// fully usable without the Cloudflare Worker. The fixture is dynamically
// imported so it lands in its own lazy chunk and never touches the initial
// production bundle (the branch is dead in prod, where useMockApi is false).
export const mockItemsInterceptor: HttpInterceptorFn = (req, next) => {
  if (environment.useMockApi && req.method === 'GET' && req.url === '/api/items') {
    return from(import('../../../dev/items.fixture')).pipe(
      map((mod) => new HttpResponse({ status: 200, body: { success: true, results: mod.items } })),
      delay(400),
    );
  }
  return next(req);
};

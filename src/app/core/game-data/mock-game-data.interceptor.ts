import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { delay, from, map } from 'rxjs';
import { environment } from '../../../environments/environment';

// Dev-only: serves local sample data for GET /api/{spells,monsters,equipment}
// and their /:id variants so the screens work without the Cloudflare Worker.
// The fixture is dynamically imported so it never touches the production
// bundle (the branch is dead in prod, where useMockApi is false).
const ROUTE = /^\/api\/(spells|monsters|equipment)(?:\/(\d+))?$/;

const ID_FIELD = {
  spells: 'spellID',
  monsters: 'monsterID',
  equipment: 'equipmentID',
} as const;

export const mockGameDataInterceptor: HttpInterceptorFn = (req, next) => {
  const match = environment.useMockApi && req.method === 'GET' ? ROUTE.exec(req.url) : null;
  if (!match) {
    return next(req);
  }
  const kind = match[1] as keyof typeof ID_FIELD;
  const id = match[2] === undefined ? null : Number(match[2]);
  return from(import('../../../dev/game-data.fixture')).pipe(
    map((mod) => {
      const rows = mod[kind] as unknown as Record<string, unknown>[];
      const results = id === null ? rows : rows.filter((row) => row[ID_FIELD[kind]] === id);
      return new HttpResponse({ status: 200, body: { success: true, results } });
    }),
    delay(400),
  );
};

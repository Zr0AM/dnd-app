# Adventurer's Ledger

A companion web app for D&D players and dungeon masters — a searchable magic-item
emporium and a fair loot splitter. Built with **Angular 22** (zoneless, standalone,
signal-first) and deployed to **Cloudflare Pages** with a Pages Function proxying the
item catalog from a backing Worker.

## Tech at a glance

- **Angular 22**, zoneless change detection, all components `OnPush` + signals.
- **Reactive data** via `httpResource` (a single shared catalog resource).
- **URL-synced state** on the Market (search, filters, sort, paging) through
  `withComponentInputBinding()` — links are shareable and the back button works.
- **Fantasy design system** in `src/styles.scss` (parchment/grimoire themes via
  `light-dark()` tokens), self-hosted fonts (Cinzel / Inter / EB Garamond), and
  `@angular/cdk` for the accessible mobile drawer.
- **Vitest** + jsdom for unit tests.

## Development server

```bash
npm start
```

Open `http://localhost:4200/`. In development the `/api/items` request is served by a
local mock interceptor (`src/app/core/items/mock-items.interceptor.ts`) using the
sample catalog in `src/dev/items.fixture.ts`, so the app is fully browsable without the
Cloudflare backend. The mock is gated by `environment.useMockApi` and never ships to
production.

## Building

```bash
npm run build
```

Artifacts are written to `dist/dnd-app/browser` (the Cloudflare Pages output dir).

## Testing

```bash
npm test          # watch mode
npm run test:ci   # single run with coverage
```

## Deploying

```bash
npm run pages:deploy
```

The `functions/api/items.ts` Pages Function proxies `GET /api/items` to the
`dnd-db-rest` Worker over a service binding, attaching the bearer token server-side so
the secret never reaches the browser.

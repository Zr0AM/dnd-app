# Adventurer’s Ledger

A companion web app for D&D players and dungeon masters — a searchable magic item
Market, a Loot Generator that rolls DMG treasure hoards, and a fair Loot Splitter.
Built with **Angular 22** (zoneless, standalone,
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

The footer shows a build number and the short git commit, for example
`2026-10-01_042 · b2f2eb0`. These come from a generated, gitignored file (`src/app/core/build-info/build-info.values.generated.ts`) that
`angular.json` swaps in through `fileReplacements`. `npm run build|start|watch|test|test:ci`
generate it first via their `pre*` hooks, but running `ng build` or `ng serve` directly on a
fresh clone fails because the file does not exist yet. Run `npm run generate:build-info` once
first (or use the npm scripts). Type-checking, linting and the tests do not need it.

### Build number

The build number is `<UTC date>_<run>`, where `<run>` is the run number of the GitHub
Actions **Build** workflow (`.github/workflows/build.yml`) for the commit, zero-padded to at
least three digits (`2026-10-01_042`; `2026-10-01_1042` past 999). `package.json`'s version stays
the semantic version but is not displayed. `scripts/generate-build-info.mjs` picks the run
number from, in order:

1. `GITHUB_RUN_NUMBER`, when the build runs inside GitHub Actions.
2. On a Cloudflare Pages build (`CF_PAGES_COMMIT_SHA` set), a lookup in the public GitHub API
   for that commit's Build run (`GET /repos/Zr0AM/dnd-app/actions/workflows/build.yml/runs`).
   Pages builds through its own Git integration, outside Actions, so it has no run number of
   its own. The lookup tries up to 4 times, 8 s timeout each and about 3 s apart, because the
   run is created at about the same time as the Pages build. If `GITHUB_TOKEN` is set it is
   sent as a bearer token. If the lookup fails, the build prints a warning and uses `000`
   (for example `2026-10-01_000`); it never fails the build.
3. Otherwise (a local build) the suffix `dev`, for example `2026-10-01_dev`.

Limitations of the Pages lookup: unauthenticated requests share GitHub's rate limit of
60 per hour per IP address, and Pages builds may run from shared addresses, so some builds
can fall back to `000`; a build that starts before the Actions run exists falls back too once
the retries run out; and a commit that never triggers the Build workflow has no run number.
Set `GITHUB_TOKEN` (a token with no scopes is enough for this public repository) as a Pages
build variable to avoid the rate limit. `SOURCE_DATE_EPOCH` overrides the date for
reproducible builds.

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

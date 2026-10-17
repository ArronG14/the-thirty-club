# The Thirty Club

A deliberately minimal, documented foundation for Alise Khera's private birthday experience. The club experiences are not implemented yet.

## Local development

Use Node 22.13.1 (`nvm use`) or a compatible supported version and npm.

```sh
npm ci
npm run dev
```

## Checks

```sh
npm run check
npx playwright install chromium
npm run test:pwa
```

`check` runs strict types, lint, formatting, unit/integration tests and a production build. `test:pwa` builds and launches an isolated preview server on port 4173 for real Chromium offline checks. The PWA is disabled in development. Use `npm run build` then `npm run preview` for manual PWA checks.

Read PROJECT.md, ARCHITECTURE.md, AGENTS.md, TASKS.md and BUILD_LOG.md before changes. The provisional shell and install icons are foundation assets, not approved creative direction.

## Deployment and device rehearsal

Serve `dist/` over HTTPS. Rewrite application routes to index.html, excluding `/api/` and missing static assets. Serve `sw.js`, index.html and the manifest with revalidation; hashed assets may use immutable caching. First open online, wait for explicit offline-ready status, enable airplane mode, then reload the root and a navigation route. On the actual iPhone, test Safari and Home Screen standalone launches, safe areas, reduced motion and an update with a waiting worker. Clearing browser storage should require an online first visit again. Local Chromium checks do not replace this rehearsal.

No backend, secrets, personalised prize data or remote media are present. No remote repository, hosting deployment or production access gate has been configured.

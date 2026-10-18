# The Thirty Club

Alise's private birthday members' club. The Grand Entrance (locked doors, countdown, butler, midnight ceremony and foyer) is implemented. The club experiences beyond the foyer are not built yet.

## Local development

Use Node 22.13.1 (`nvm use`) or a compatible supported version and npm.

```sh
npm ci
npm run dev
```

## Previewing the entrance (development only)

Run `npm run dev`, then open:

| URL                                           | State                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| `http://127.0.0.1:5173/?preview=locked`       | Locked doors, ~2 days 6 hours remaining                                     |
| `http://127.0.0.1:5173/?preview=final-minute` | 64 s before midnight: watch the light build, then the full ceremony         |
| `http://127.0.0.1:5173/?preview=midnight`     | 8 s before midnight: the door-opening transition                            |
| `http://127.0.0.1:5173/?preview=arrival`      | After midnight, never entered: unlocked doors and "Enter the club"          |
| `http://127.0.0.1:5173/?preview=foyer`        | Returning member in the foyer ("Revisit the entrance" replays the ceremony) |

On WebGL-capable browsers each mode shows the real-time 3D entrance once it has loaded; the SVG entrance shows first and remains the fallback. A dashed "Dev preview" bar switches modes. Previews shift a clock and use in-memory storage, so they never alter the real device record. The parameter exists only in development builds and is removed from production: `npm run test:pwa` asserts that production ignores it. Plain `/` in development uses the real clock and record. To reset a real unlock on a device, clear the `thirty-club:entrance` localStorage key (or the site data). Turn on the OS "Reduce motion" setting to preview the reduced-motion ceremony.

## Entrance textures

Wood, stone and marble are CC0 scans from Poly Haven; see `src/features/entrance/scene/assets/CREDITS.md`. To regenerate them, download the listed 1K JPGs into a folder outside the repository, then run:

```sh
python3 -I tools/prepare-textures.py <download-folder>
```

This needs Pillow. Commit only the WebP outputs.

## Checks

```sh
npm run check
npx playwright install chromium
npm run test:pwa
```

`check` runs strict types, lint, formatting, unit/integration tests and a production build. `test:pwa` builds and launches an isolated preview server on port 4173 for real Chromium offline checks. The PWA is disabled in development. Use `npm run build` then `npm run preview` for manual PWA checks.

Read PROJECT.md, ARCHITECTURE.md, AGENTS.md, TASKS.md and BUILD_LOG.md before changes. Install icons and favicon are still provisional foundation assets.

## Deployment and device rehearsal

Serve `dist/` over HTTPS. Rewrite application routes to index.html, excluding `/api/` and missing static assets. Serve `sw.js`, index.html and the manifest with revalidation; hashed assets may use immutable caching. First open online, wait for explicit offline-ready status, enable airplane mode, then reload the root and a navigation route. On the actual iPhone, test Safari and Home Screen standalone launches, safe areas, reduced motion and an update with a waiting worker. Clearing browser storage should require an online first visit again. Local Chromium checks do not replace this rehearsal.

No backend, secrets, personalised prize data or remote media are present. The existing Git repository and origin are preserved. No hosting deployment or production access gate is confirmed by this preparation task.

## Netlify configuration

The active repository is `/Users/ag14/Documents/Projects/the-thirty-club`. `netlify.toml` uses the repository root, `npm run build`, publish directory `dist`, Node 22.13.1 and npm 10.9.2. No application environment variables are required. Keep build-time devDependencies installed.

Deploy the repository with its routing-only Edge Function, not just a drag-and-drop dist folder. It provides extensionless HTML navigation while leaving API and missing static resources as errors. API paths are reserved 404s until a backend is configured. HTML, manifest and worker revalidate; Vite generates exact immutable asset rules in dist/_headers. Public/unhashed assets receive no immutable rule.

Run both `npm run check` and `npm run test:pwa` before release. The PWA browser test verifies shell readiness/offline reload, query-bearing navigation, and refusal to substitute the shell for missing API/static requests. Vite preview is not a Netlify emulator: CDN routing, Edge runtime and response headers need a later authorised hosted preview. Check actual iPhone Safari/Home Screen installation and update behavior before production. This preparation does not deploy anything. See ADR-005 in ARCHITECTURE.md; the earlier MIGRATION_HANDOVER.md audit is historical.

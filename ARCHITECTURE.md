# Architecture

## Decision status

**Confirmed for this foundation:** React + strict TypeScript + Vite, Tailwind CSS via its Vite plugin, React Router, Zustand for ephemeral application state, npm lockfile, ESLint, Prettier, Vitest/Testing Library, and vite-plugin-pwa using generated Workbox service workers. Browser support starts at Safari/iOS 16.4 (Tailwind 4 baseline); the actual birthday iPhone must be confirmed. No backend is introduced in phase 1.

**Proposed, not implemented:** IndexedDB for versioned non-authoritative local records and selected downloads; a small backend for authentication, entitlements, unlocks, redemptions and notifications; Motion or GSAP after creative direction; selective Three.js only with a measured mobile budget. Hosting, API provider, authentication, notification channel and asset delivery remain undecided.

## Structure and boundaries

- `src/app/`: application composition and routes.
- `src/features/foundation/`: intentionally minimal entry view; future experiences live in separate feature folders.
- `src/shared/state/`: presentation-independent Zustand connectivity store; no membership or reward authority.
- `src/shared/pwa/`: service-worker registration and real offline/update status.
- `src/shared/ui/`: shared semantic layout.
- `src/styles/`: Tailwind import, provisional tokens, safe-area and reduced-motion foundations.
- `src/test/`: test setup; feature tests live next to implementation.
- `tests/`: production PWA browser checks.
- `public/`: bundled installation assets; never private surprise material.

Routes currently expose only `/` and an honest not-found view. Browser history requires hosts to rewrite application navigation to index.html while preserving asset and API errors. Every future experience should own its UI and domain logic. Shared interfaces belong in a domain folder only when first consumed; avoid speculative abstraction. Components consume stores or hooks rather than own authoritative state.

## State and persistence

Zustand holds connectivity signals in memory. `navigator.onLine` is a hint, not proof of API reachability. No personal, entitlement or redemption data is stored yet. Later IndexedDB records need schema versions, migrations, error handling, reset policy, storage-quota handling and tests. Request persistent storage only when the download experience justifies it. Browser storage can be evicted; server records are the source of truth for valuable actions.

Proposed boundaries: a reward service issues opaque server-validated entitlements; a redemption service accepts an entitlement plus idempotency key; notification delivery follows a committed server event. Feature UI must not invent success on request failure. Do not define unused service stubs that imply a working backend.

## Offline and service-worker strategy

Production only: `generateSW`, prompt-based updates, precache built HTML/JS/CSS plus local icons and manifest; navigation fallback to index.html excluding `/api/` paths. No blanket runtime caching, API caching, remote font dependency or video caching. First visit needs network. Offline-ready feedback is emitted only after Workbox reports successful precaching. A status banner distinguishes network loss from cached-shell readiness. Users opt into activating a waiting update, which reloads the page; future sensitive flows must delay that prompt until safe.

The worker exists only in production builds. Use `npm run build` and `npm run preview` to test it. localhost is sufficient for browser smoke tests; deployment and physical iPhone use require HTTPS. Clearing site data or storage eviction removes offline support. A previously cached app shell does not grant offline access to future media, gifts, authentication or authoritative actions. Runtime feature failures still need explicit error states.

For future media: show explicit download state, sizes and removal controls; verify complete local copies before claiming readiness. For future redemptions: either require online confirmation or persist an explicit pending intent with a stable idempotency key, reconcile with the server, and never label pending as redeemed. Decide that policy in phase 6. Display a recoverable message if storage or sync fails.

## Backend responsibilities and security (future)

Authenticate the sole member with an agreed recovery path; protect privileged content server-side; validate game rewards and gift rules; transact unique redemptions with idempotency; audit events without exposing surprises; deliver notifications server-side using secret credentials. Client configuration and bundled assets are public. No secrets in VITE_* variables. Notification permissions and iOS capabilities must be tested with a fallback channel; do not rely on push alone.

NFC and QR links are public inputs: validate identifiers server-side and never embed authority in the link. Separate member privileges from organiser operations. Define data retention, backups and recovery before storing private videos or personal data. No live AI endpoints.

## Quality and release boundary

Strict TS, lint, formatting, unit/integration checks and production build are local gates. A Playwright Chromium check verifies registration, installed precache, offline navigation and route fallback. It does not certify Safari, iPhone installation, storage eviction, notification delivery or future media. Real iPhone Safari + standalone checks and online/offline/update rehearsal remain release gates. Add broader browser coverage when creative interactions arrive.

## Decision record

- ADR-001 (2026-10-17): start with a small SPA and independent feature directories; defer backend/animation/IndexedDB implementation until consumed.
- ADR-002 (2026-10-17): explicit service-worker update action to avoid unexpected reloads; pre-cache only public shell assets.
- ADR-003 (2026-10-17): no client-authoritative reward state; server design must precede valuable redemptions.
- ADR-004 (2026-10-17): eight-phase naming and dates are planning proposals requiring coordination.

## Open questions

1. Confirm eight-phase names and delivery ownership across collaborating agents.
2. Confirm iPhone model/iOS, reveal time, hosting/domain and HTTPS deployment path.
3. Approve design, butler script/voice, member number and all personalised content.
4. Choose authentication/recovery, backend provider and organiser access.
5. Decide game fairness/repeat rules, prize inventory, offline redemption policy and notifications.
6. Confirm video permissions, download/storage budgets, Jamaica logistics and NFC/QR fallback.

## Reference documentation

[Vite](https://vite.dev/guide/), [Tailwind Vite integration](https://tailwindcss.com/docs/installation/using-vite), [Vite PWA update handling](https://vite-pwa-org.netlify.app/guide/prompt-for-update).

# Engineering journal

## 2026-10-18 17:10 BST (Europe/London) — Claude Code — iPhone Safari 3D entrance stability

- **Task:** Stop the 3D entrance reverting to the poster a few seconds after rendering on iPhone Safari.
- **Summary:** Reproduced in Playwright WebKit (iPhone 14 profile, DPR 3) against `39b07d1` with verification skipped: scene at about 3 s, poster at about 9 s. Cause: the performance governor lowered quality to tier 2 (frames at a vsync-quantised 33.3 ms, about 30 fps) and then returned the poster because 30 fps missed the 40 fps bar. The verification overlay is not involved. Fix: at the lowest tier only frames over 200 ms fall back; context loss waits 6 s for restoration (and resumes if it returns); long frame gaps, hidden pages and restored contexts restart the measuring windows; every fallback records its cause (`window.__entranceDiag`, sessionStorage, `/?entrance-diag` on-screen readout). No quality, lighting or animation change except that the lowest tier now persists instead of ending in the poster. The shared `judgeFrameTime` also applies to the lounge and casino scenes. No stale-timeout race existed (readiness is set once; no timer overrides it); the overlay does not remount the entrance (same canvas verified).
- **Created:** `scene/entranceDiagnostics.ts` (+ test), `ui/EntranceDiagBadge.tsx`, `playwright.webkit.config.ts`, `tests/entrance-webkit.spec.ts`.
- **Modified:** `EntranceScene.ts`, `EntranceCanvas.tsx`, `sceneMath.ts` (+ test), `Facade.tsx`, `playwright.config.ts`, `package.json` (`test:webkit`), `ARCHITECTURE.md` (ADR-013), `TASKS.md` (K14).
- **Checks and results:** `npm run check` PASS (432 tests, build). `npx playwright test --workers=1` PASS (32). `npm run test:webkit` PASS (6): repeat visit, first visit through Enter the Club (same canvas, 30 s), owner replay, context loss and restore, context never restored (poster, reason recorded), initialisation failure (poster, reason `error`).
- **Known issues / not verified:** No real iPhone. WebKit here is Playwright's build, not iOS Safari: GPU, memory limits and Low Power Mode differ. At tier 2 the entrance has no reflection or shadows if the phone cannot hold 40 fps.
- **Remaining work:** Open `/?entrance-diag` on the iPhone and read the line (tier, ms/frame, reason).
- **Commit:** see git history.

## 2026-10-18 16:05 BST (Europe/London) — Claude Code — Verification waits for "Enter the Club"

- **Task:** Baseline `eeffba0`. The final verification screen now stays until Alise chooses to continue.
- **Summary:** The last beat no longer auto-dismisses. An "Enter the Club" champagne-gold button (breathing glow, none under reduced motion) is focused when it appears; activating it records completion in `localStorage`, fades the overlay and reveals the already-mounted entrance. Completion is no longer recorded when the animation ends, so a refresh before clicking replays it. The verifying beat still waits for entrance readiness (10 s cap), so the button is enabled on arrival. The overlay only dismisses; it never touches the doors. The app stays `inert` until dismissal. Owner bypass and `?verify=replay` unchanged.
- **Modified:** `src/features/verification/{FirstVisitCinematic.tsx,firstVisit.css,firstVisit.test.tsx}`, `tests/first-visit.spec.ts`.
- **Checks and results:** `npm run check` PASS (429 tests, build). Full `npx playwright test --workers=1`: 31 passed; the first-visit spec failed on a 30 s test timeout, then PASSED alone after raising its timeouts (it runs two full sequences).
- **Known issues:** On this Mac the software-rendered 3D scene beneath slowed the overlay's timers noticeably, so the sequence ran longer in some Playwright runs. Not tried on a real iPhone or Safari.
- **Remaining work:** Real iPhone check.
- **Commit:** see git history.

## 2026-10-18 15:20 BST (Europe/London) — Claude Code — First-visit cinematic identity verification

- **Task:** Theatrical full-screen verification shown once, on a first visit to the entrance.
- **Summary:** `FirstVisitCinematic` renders in a portal above the app from `main.tsx`; the entrance stays mounted and loads underneath, and `#root` is `inert` while the overlay plays. Five beats (about 6.2 s minimum) hold on the verification beat until fonts and the 3D entrance chunk are ready, capped at 10 s; failed loads count as ready. Completion is stored in `localStorage` (`thirty-club:first-visit-verified`). Owner mode bypasses it; `/?verify=replay` and an owner-menu button replay it. Reduced motion shortens the holds and removes the sweep and rotation. No camera, no biometrics, no real authentication. Entrance, routes, access logic and all other rooms are unchanged.
- **Created:** `src/features/verification/{firstVisit.ts,FirstVisitCinematic.tsx,firstVisit.css,firstVisit.test.tsx}`, `tests/first-visit.spec.ts`.
- **Modified:** `src/main.tsx`, `src/features/owner/OwnerAccess.tsx` (one button), `playwright.config.ts` (existing suites start as already-verified), `TASKS.md` (formatting).
- **Checks and results:** `npm run check` PASS (429 tests, build). `npx playwright test --workers=1` PASS (32 tests including the new first-visit flow). Viewed in the in-app browser at 390×844; no flash of the entrance beneath (overlay and entrance commit together).
- **Known issues:** Not run on a real iPhone or Safari. A visitor whose storage is unreadable skips the sequence. The cinematic is skipped on routes other than `/`.
- **Remaining work:** Real iPhone check.
- **Commit:** see git history.

## 2026-10-18 14:10 BST (Europe/London) — Claude Code — Live countdown in the concierge letter

- **Task:** Add a live engraved countdown to the opened Departure Lounge letter.
- **Summary:** New `LetterCountdown` counts days, hours, minutes and seconds to 22 October 2026, 14:00 Europe/London (13:00 UTC), reusing `instantOf`, `remainingUntil`, `msUntilNextTick` and `pad`. It owns its one-second timer, so only it rerenders. At zero it tells `EntranceLetter`, which switches to the existing unlocked letter and link. Birthday countdown, concierge unlock logic and Gift Vault untouched. No animation was added, so reduced motion is respected by construction.
- **Created:** `src/features/concierge/ui/LetterCountdown.tsx`.
- **Modified:** `EntranceConcierge.tsx`, `entranceConcierge.css`, `src/features/entrance/ui/Entrance.test.tsx` (2 tests: live ticking, unlock at zero).
- **Checks and results:** `npm run check` PASS (420 tests in 34 files, production build). Playwright and `test:pwa` not run.
- **Known issues:** Not visually reviewed on an iPhone or in a browser; layout at 390px is by CSS design only.
- **Remaining work:** Visual check on iPhone.
- **Commit:** see git history.

## 2026-10-18 13:20 BST (Europe/London) — Codex — Owner menu and Departure Lounge integration

- **Task:** Integrate `concierge/pre-birthday` into `main`, add the Departure Lounge and Concierge Owner Console to the PIN owner menu, preview the full concierge flow silently, preserve guest locks, test and deploy.
- **Summary:** Fast-forwarded the two concierge branch commits onto `main` with no conflict. The new Departure Lounge menu action opens the existing server-key console with a start intent; a valid key issues a rehearsal session at 22 October 14:01 UK without presenting the travel credential. The NFC URL and manual code then run the boarding ceremony and redemption in the separate rehearsal realm. Rehearsal activations, redemptions and messages contact no Telegram or SMS provider; redeemed preview cards report `simulated` delivery. Owner Exit and Reset also end the device's concierge rehearsal. The existing owner menu layout and guest birthday rules were not changed.
- **Created:** No new source files; added a browser regression in `tests/owner.spec.ts`.
- **Modified:** `src/features/owner/OwnerAccess.tsx`; `src/features/concierge/{domain/contract.ts,owner/OwnerConsole.tsx,ui/DepartureLounge.tsx,ui/PrivilegeCard.tsx}`; `netlify/concierge/{channels.ts,service.ts,concierge.test.ts}`; `tests/concierge.spec.ts`; `ARCHITECTURE.md`, `TASKS.md`, `docs/{OWNER_ACCESS.md,CONCIERGE.md}`; this log. The branch merge also brought in all files listed in its earlier entry below.
- **Checks and results:** Final `npm run check` PASS (types, ESLint, Prettier, 418 tests in 34 files, production build); `npm run test:pwa -- --workers=1` PASS (31 production Chromium tests). The new browser case covers PIN menu, server-key rehearsal, early access, NFC URL, boarding, privilege redemption, no fake-channel output, clean live records and a locked separate visitor session. Existing birthday card and ordinary-visitor lock tests passed. A first sandboxed browser run could not bind port 4173 (`EPERM`); the authorized rerun passed.
- **Known issues:** The physical NFC tag and real iPhone/Safari have not been tested. Netlify deployment and server environment configuration are not yet confirmed as of this log entry. The concierge owner key is still required to create a server-backed rehearsal; the PIN alone is not server authorization.
- **Remaining work:** Push `main`, inspect the actual Netlify deployment and configuration, run a hosted rehearsal on the physical device, and clear server rehearsal records afterwards.
- **Commit:** This entry's commit (see git history); no hash was available when the entry was written.

## 2026-10-17 23:02 BST (Europe/London) — Codex — Foundation planning

- **Task:** Initialise The Thirty Club from supplied Prompt 01.
- **Summary:** Inspected the empty workspace and brief. Established product scope, confirmed/proposed architecture, agent operating rules and a dependency-aware proposed eight-phase backlog. Application implementation is in progress.
- **Files created:** PROJECT.md, ARCHITECTURE.md, AGENTS.md, TASKS.md, BUILD_LOG.md.
- **Tests:** Workspace inspection only; no application checks performed at this point.
- **Known issues:** Brief does not provide the referenced agreed eight-phase names; proposed names are labelled accordingly. No existing Git repository.
- **Remaining work:** Scaffold app, configure tools and PWA, run checks, update journal and task statuses.
- **Commit:** Unavailable; repository not yet initialised.

## 2026-10-17 23:07 BST (Europe/London) — Codex — Foundation implementation and verification

- **Task:** Complete phase 1 foundation (F01–F04).
- **Summary:** Initialised local Git repository on main. Added strict React/TypeScript/Vite app, Tailwind styling, root and not-found routes, separate Zustand connectivity state, accessible minimal shell, PWA install metadata/icons, production-only generated worker, precache readiness, user-triggered updates, formatting/lint/test tooling, locked npm dependencies and setup/deployment instructions. Marked only foundation tasks VERIFIED. No backend or club experiences implemented.
- **Files created/modified:** All five required root documents and README.md; package.json/package-lock.json; .gitignore, .nvmrc, .prettierrc.json, .prettierignore; eslint.config.js, vite.config.ts, tsconfig.json, tsconfig.app.json, tsconfig.node.json, playwright.config.ts, index.html; src/main.tsx, src/app/App.tsx and App.test.tsx, src/features/foundation/FoundationPage.tsx, src/shared/ui/AppShell.tsx, src/shared/state/connectivityStore.ts and useConnectivity.ts, src/shared/pwa/PwaStatus.tsx, src/styles/global.css, src/test/setup.ts; tests/pwa.spec.ts; public/favicon.svg and four installation PNGs. Build output and browser reports are generated and Git-ignored.
- **Tests performed and results:** `npm run check` passed: strict types, ESLint, Prettier, six Vitest application tests, production build. `npm run test:pwa` passed: one real Chromium test verifies successful precache, manifest/icons, offline reload under worker control, offline not-found navigation and return, and failed offline API fetch rather than cached shell. Worker generated with 16 precache entries (~279 KiB). npm installation audit reported zero vulnerabilities across 522 packages.
- **Issues resolved during verification:** Added DOM types for browser test callbacks. Upgraded deprecated ESLint 9 to compatible supported ESLint 10 and aligned Node types to Node 22. Corrected browser test's assumption that a first-install worker immediately controls its initial page; now checks control after offline reload. Sandbox denied npm networking and localhost binding initially; approved elevated runs completed dependency installation and browser verification. A transitive glob deprecation warning remains upstream; audit reports zero vulnerabilities.
- **Known issues/limits:** Physical iPhone Safari, Home Screen installation, worker update lifecycle on device, storage eviction and deployment HTTPS are unverified. Install icons and shell styling are provisional. No authentication, private asset protection, IndexedDB domain data, remote repo or hosting deployment exists. Eight-phase naming is proposed. Connectivity state is only a browser hint.
- **Remaining work:** Begin D01 creative direction and D02 device/content confirmation. Resolve backend/auth/hosting ownership and reward/offline policies before valuable actions. Complete all remaining phases and the final Jamaica/device rehearsal before the birthday reveal.
- **Commit:** Unavailable; local repository initialised, files intentionally left uncommitted for review.

## 2026-10-17 23:14 BST (Europe/London) — Codex — Audit and migration preparation

- **Task:** H01 project handover, GitHub and Netlify preparation; no phase 2 work.
- **Summary:** Located persistent local macOS project, inspected implementation/dependencies/configuration and all required documents, confirmed existing unborn main branch with no remotes/commits. Prepared guarded rsync copy/checksum verification preserving .git and untracked files, VS Code opening instructions, later GitHub procedure, proposed Netlify build/routing/header settings and documented risks. Appended missing local cache/temp/OS exclusions to .gitignore. No files were moved/deleted, no existing application source/configuration was replaced, and no repository was initialised, committed, connected, pushed or deployed.
- **Files created:** MIGRATION_HANDOVER.md.
- **Files modified:** Appended .gitignore, BUILD_LOG.md and TASKS.md. Requested test commands regenerated ignored dist/test output.
- **Tests performed and results:** `npm run check` PASS (typecheck, ESLint, Prettier, six Vitest application tests, production build). `npm run test:pwa` PASS (one Chromium offline/manifest/routing test; authorised localhost/browser access). No audit test failures. Required docs all exist; current Node 22.13.1/npm 10.9.2 match .nvmrc. A fresh security audit was not run.
- **Known issues:** No first commit/remote backup; Netlify routing/headers still proposals; iPhone/Safari/update lifecycle unverified; no auth/backend/private assets; phase names remain proposals. Minor NO_COLOR/FORCE_COLOR warning only.
- **Remaining work:** H02 actual copy and verification, H03 reviewed first commit and GitHub connection, H04 reviewed Netlify configuration/deployment workflow and device rehearsal. All remain NOT STARTED. Do not begin phase 2 yet.
- **Commit:** Unavailable; main has no commits. Git log's exit 128 is expected for this unborn branch.

- **Handover final validation:** Confirmed new .gitignore patterns with git check-ignore and migration shell syntax with bash -n (commands not executed). Formatting check initially flagged the newly appended TASKS.md table; formatted only that new appendix and reran checks.

## 2026-10-17 23:30 BST (Europe/London) — Codex — Netlify deployment configuration

- **Task:** H04 local preparation and verification; work exclusively in `/Users/ag14/Documents/Projects/the-thirty-club`.
- **Summary:** Added Netlify repository-root build/publish settings and tested Node/npm pins. Used a routing-only Edge Function for extensionless GET/HEAD HTML navigation, avoiding Netlify's blanket SPA catch-all and its missing-file masking. API paths return explicit static 404s; existing assets remain accessible and missing file paths bypass the SPA. Added HTML/manifest/service-worker/Workbox revalidation and exact immutable header paths generated only from fingerprinted Vite output. Shared API/static exclusions with Workbox while retaining prompt updates and actual offline-ready callbacks. No dependencies, member backend or unrelated features added. No deploy, Git commit or push performed.
- **Files created:** netlify.toml; netlify/edge-functions/spa.ts; netlify/routing.ts; build/netlifyHeaders.ts; public/404.html; src/test/netlify.test.ts.
- **Files modified:** vite.config.ts; tsconfig.node.json; tests/pwa.spec.ts; ARCHITECTURE.md (ADR-005); README.md; MIGRATION_HANDOVER.md (historical-state note); TASKS.md; BUILD_LOG.md. Ignored dist/test artifacts regenerated by requested checks.
- **Tests performed and results:** Final `npm run check` PASS: strict types, ESLint, Prettier, 28 Vitest application/routing/header tests across two files and production build. Final `npm run test:pwa` PASS: one Chromium test verifies real precache readiness, manifest/icons, offline reload, query-bearing navigation, offline API failure and rejected API/static navigation without shell substitution. Worker generated with 17 precache entries (~281 KiB), including the new public 404 document. Parsed netlify.toml with Python tomllib; inspected dist/_headers to confirm exactly three existing fingerprinted paths and no wildcard. Static 404 has no application root. Final documentation formatting and Git whitespace checks run separately.
- **Issues resolved during checks:** First expanded PWA assertion incorrectly expected Vite preview to emulate Netlify online 404s; preview's HTML fallback returned 200, so the test now checks offline worker boundaries directly. A subsequent Chromium failed-navigation/error-page race was resolved using separate tabs for rejected requests. Corrected the shared exclusion regex to ignore dots/slashes in query values (Workbox matches pathname plus search). Added explicit .ts config imports to remove Vite's native-loader warning. Final requested checks pass; remaining NO_COLOR/FORCE_COLOR message is a tooling warning.
- **Known issues/remaining deployment risks:** No hosted Netlify/Edge/CDN validation performed and Netlify CLI is not installed here. The configured Edge Function must be deployed with the repository; uploading dist alone does not reproduce SPA routing. A later authorised preview must verify root/deep/query/HEAD/conditional responses, response headers and MIME types, API/missing asset 404s, and asset rotation. Replace reserved API 404s when adding a backend. Browser tests use Vite preview, not the Netlify runtime. Physical iPhone Safari/Home Screen install, offline/update lifecycle and storage eviction remain unverified. Static site content remains public without future authentication/private-asset protection. Existing migration audit is historical; copy parity and remote reachability were not re-audited.
- **Remaining work:** H04 hosted verification and actual deployment remain NOT STARTED. Phase 2 remains NOT STARTED. Obtain deployment authorisation before any Netlify account connection that could trigger a deploy.
- **Commit:** Base c02dd3e (`chore: initialise Thirty Club foundation`); this task's changes are uncommitted on existing main.

## 2026-10-17 23:55 BST (Europe/London) — Claude Code (Opus 5.5) — Phase 2: The Grand Entrance

- **Task:** Implement the complete entrance (E01): locked private-club doors, mechanical countdown to device-local midnight on 24 October 2026, scripted butler, final-minute build, midnight door-opening ceremony, post-unlock foyer, development-only preview modes, tests and documentation. No casino, vault, screening room or other club experiences.
- **Summary:** Added the `src/features/entrance` feature:
  - Pure domain modules: countdown, stage reducer, versioned device record, butler script.
  - A `useEntrance` hook that recalculates from the clock on second boundaries and on visibility, pageshow and focus.
  - SVG and CSS artwork: stepped Art Deco portal, sunburst fanlight, mahogany doors with brass marquetry and a splitting "30" medallion, sconces, a number-drum timepiece, a brass bell-push and speaker grille, and an oxblood foyer with a members' register.
  - Light driven by one `--anticipation` property.
  - Reduced-motion variants and dev-only `?preview=` modes that are eliminated from production.

  Replaced the foundation placeholder view and restyled the shell, footer status and not-found page with the new tokens. Theme and manifest colours changed to #0B0B0D. Preserved all PWA, Netlify, offline and update behaviour from earlier tasks.

- **Dependencies added:** `@fontsource-variable/bodoni-moda`, `@fontsource-variable/cormorant-garamond`, `@fontsource-variable/jost` (self-hosted OFL fonts; only four latin woff2 files are bundled). npm reported 0 vulnerabilities.
- **Files created:**
  - Domain: `src/features/entrance/domain/{countdown,entranceMachine,entranceRecord,butlerScript,environment}.ts`, with `.test.ts` files for countdown, entranceMachine, entranceRecord and butlerScript.
  - Hook and environment: `src/features/entrance/{useEntrance,entranceEnvironment}.ts`.
  - UI: `src/features/entrance/ui/{Entrance,Facade,Portal,DoorLeaf,ClubDefs,Timepiece,ServiceBell,Foyer}.tsx`, `entrance.css`, `foyer.css`, `Entrance.test.tsx`.
  - Preview: `src/features/entrance/preview/{devPreview.ts,devPreview.test.ts,DevPreviewBar.tsx}`.
  - Shared and tests: `src/shared/ui/useReducedMotion.ts`, `tests/entrance.spec.ts`.
  - Local preview config: `.claude/launch.json` (local tool config, untracked).
- **Files modified:** src/app/App.tsx, src/app/App.test.tsx (foundation copy assertions replaced by entrance assertions; Date fixed so the suite is date-independent), src/shared/ui/AppShell.tsx, src/styles/global.css, index.html, vite.config.ts (woff2 precache, colours, description), tests/pwa.spec.ts (fixed clock and offline font assertion), package.json, package-lock.json, PROJECT.md, ARCHITECTURE.md (ADR-006), TASKS.md, README.md, BUILD_LOG.md.
- **Files deleted:** src/features/foundation/FoundationPage.tsx (superseded).
- **Tests and results:**
  - `npm run check` PASS: tsc strict, ESLint, Prettier, 94 Vitest tests in 8 files, production build. The tests cover:
    - local midnight in London, Jamaica, Los Angeles, Kolkata, Kiritimati and UTC, plus zone changes;
    - rounding, clamping and resumed sessions, phase boundaries, anticipation and tick alignment;
    - reducer transitions, no relock after a clock rollback, late arrival, replay, and record parsing and storage failure;
    - butler cycling and naming rules;
    - integration: countdown ticking, visibility resync, butler ring, midnight ceremony with persistence and focus, reduced-motion timeline and still drums, already-passed date, returning visit, foyer controls;
    - preview modes.
  - `npm run test:pwa` PASS, 5 Chromium tests:
    - existing offline/precache/routing test, now also asserting all four font faces load offline;
    - Jamaica-timezone midnight unlock through the foyer, with reload persistence;
    - London same-instant shows awaiting-entry;
    - production ignores `?preview=`;
    - reduced-motion ceremony with no door transform.
  - The production bundle was grepped and contains no preview code. Precache is 21 entries (~471 KiB). `_headers` lists the fonts as exact immutable paths.
  - Visual review in the in-app Chromium at 390×844, 375×667 (short-screen layout added after the bell fell below the fold) and 1280×800, including a live final-minute → midnight → foyer run.
- **Issues found and fixed during checks:**
  - Frame grain bled outside the crown silhouette.
  - The dev preview bar caused horizontal overflow on mobile.
  - A foyer dado line crossed the text.
  - Test timings needed tick slack; the final-minute preview deliberately starts 4 s before the final minute.
  - A font-family quoting mismatch in the offline font assertion.
- **Known issues and limits:**
  - Not tested on a physical iPhone, Safari/WebKit or the Home Screen standalone app. Performance of the SVG grain filter and the 3D door transforms on older iPhones is unmeasured.
  - Device-local time can be changed by the user; this is accepted, ceremonial and not a security gate.
  - Timezone changes while the app is open rely on the platform updating the JS time zone (usually after reload).
  - Butler copy, his name, the medallion and the register wording await owner approval (D02).
  - No audio.
  - Install icons and favicon are still provisional.
  - The update prompt is not deferred during the ceremony, since it only applies on user action.
- **Remaining work:**
  - D01 owner approval on device.
  - D02 content approval.
  - E02 real-iPhone rehearsal of final minute and midnight.
  - Optional E03 bell sound.
  - New install icons matching the entrance.
  - Lounge and all club experiences remain NOT STARTED.
  - Hosted Netlify verification (H04) remains pending.
- **Commit:** Unavailable. Changes are uncommitted on main, on top of c02dd3e and alongside the earlier uncommitted Netlify work.

## 2026-10-18 00:24 BST (Europe/London) — Claude Code (Opus 5.5) — Phase 2B: art direction and real-time lookdev

- **Task:** Establish a concrete visual target for a cinematic, game-quality entrance before any rewrite. Recommend a rendering strategy. Do not rebuild the shipped entrance.
- **Summary:**
  - Evaluated CSS/SVG, pre-rendered plates and video, real-time 3D, and hybrid approaches. No image-generation or offline renderer is available here, so the visual target is a working Three.js lookdev prototype rather than a painted concept.
  - The prototype contains:
    - a recessed stepped Art Deco doorway in procedural limestone, walnut and brass;
    - lacquered mahogany doors 75 mm thick, with bevelled panels, brass marquetry and the splitting "30" medallion;
    - a reeded amber fanlight and fan sconces with point lights;
    - a grazing shadowed downlight, a polished marble floor with planar reflection, fog, dust, ACES grading, bloom, grain and vignette;
    - a brass time-lock countdown across both leaves, driven by the shipped countdown domain;
    - a jamb bell-push with a glowing grille and subtitle dialogue from the shipped butler script;
    - the final-minute build, and a midnight swing with the camera passing through the doorway.
  - The shipped entrance, logic, preview modes and tests are unchanged.
- **Dependencies added:** `three@0.186.1` and `@types/three` as **devDependencies** (prototype only; not in the production bundle). Move them to dependencies only if V02 is approved.
- **Files created:** `lookdev/entrance.html`, `lookdev/main.ts`, `lookdev/scene.ts`, `lookdev/textures.ts`, `docs/ENTRANCE_ART_DIRECTION.md`, and `docs/lookdev/01-locked.jpg` through `05-passing-through.jpg`.
- **Files modified:** `tsconfig.app.json` (include `lookdev` for strict type checking), `package.json`, `package-lock.json`, `TASKS.md`, `BUILD_LOG.md`.
- **Tests and results:**
  - `npm run check` PASS: strict types (now including `lookdev`), ESLint, Prettier, 94 Vitest tests, production build. The precache is unchanged at 21 entries (~471 KiB), and a grep confirms no Three.js or lookdev code in `dist`.
  - `npm run test:pwa` PASS: 5 Chromium tests.
  - The prototype was reviewed in the in-app Chromium at 390×844 across locked, bell, final-minute, unlock, opening and passing-through. It ran at ~120 fps (display-capped) in desktop Chromium at DPR 2, with ~15k triangles and ~290 draw calls.
- **Issues found and fixed during lookdev:**
  - Counter drums hidden inside the door slab.
  - A blown-out fanlight.
  - Polished brass reflecting black (fixed with a warm environment field).
  - Over-regular mahogany figure.
  - Over-exposed opening.
  - Seam light lingering in the open doorway.
  - Framing widened so the sconces sit in shot.
- **Known issues and limits:**
  - No iPhone or WebKit measurement.
  - The draw-call count is above the proposed mobile budget (merging is planned).
  - Procedural materials stand in for authored textures.
  - The time-lock unit labels are illegible at phone size.
  - The interior beyond the doors is a placeholder gradient.
  - The prototype has no fallback, adaptive quality or accessible bell button.
  - The prototype's pointer coordinates are not tested.
- **Remaining work:** owner decisions 1–5 in the art direction, then V02 production implementation and V03 device measurement.
- **Commit:** Unavailable. Changes are uncommitted on main, alongside the earlier uncommitted phase 2 and Netlify work.

## 2026-10-18 00:58 BST (Europe/London) — Claude Code (Opus 5.5) — Phase 2B: production real-time entrance (V02)

- **Task:** Build the approved direction for production: real-time 3D with the SVG entrance as poster and fallback, the time-lock countdown, foyer hand-off option (a), and CC0 scanned textures.
- **Summary:**
  - Downloaded 11 CC0 Poly Haven 1K JPGs (Sapele Veneer, Black Walnut Veneer 01, Marble 01, Granite Tile 03), with explicit owner approval of the file list and sizes, into an isolated scratch folder. Graded and re-encoded them to 11 WebP files (~410 KB) with the new `tools/prepare-textures.py`. Only the outputs are committed, with `CREDITS.md`.
  - Ported the lookdev into `src/features/entrance/scene/`: pure `sceneMath`, `canRender3D`, `canvasTextures`, `materials` (scans), `architecture` (builders and per-material static merging), the `EntranceScene` controller and the lazy `EntranceCanvas`.
  - The Facade now runs poster → fading → scene, with fallback on failure.
  - HTML overlays: a projected accessible bell button with caption, projected unit labels, and subtitle-style lines, entry and butler speech. The butler's words now withdraw after a reading-length pause.
  - The time-lock gained a bolt that withdraws at midnight, with a keeper on each leaf.
  - The room beyond the doors is a painted oxblood interior with an arch, glimpsed before the HTML foyer.
  - The adaptive quality tiers use wall-clock windows.
  - Shaders compile with `compileAsync` before the first frame.
  - Context loss and errors fall back to the poster.
  - Removed the `lookdev/` prototype and reverted its tsconfig include.
- **Dependencies:** `three@0.186.1` moved to dependencies; `@types/three` stays a devDependency. npm reported 0 vulnerabilities.
- **Files created:**
  - Scene modules: `src/features/entrance/scene/{sceneMath.ts,sceneMath.test.ts,canRender3D.ts,canvasTextures.ts,materials.ts,architecture.ts,EntranceScene.ts,EntranceCanvas.tsx}`.
  - Assets: `scene/assets/*.webp` (11 files) and `CREDITS.md`.
  - Tooling, tests and frames: `tools/prepare-textures.py`, `tests/entrance-poster.spec.ts`, `docs/entrance/01–06*.jpg`.
- **Files modified:**
  - Entrance UI: `ui/Facade.tsx`, `ui/ServiceBell.tsx`, `ui/entrance.css`, `ui/Entrance.test.tsx`.
  - Domain: `domain/butlerScript.ts` (`speechDuration`).
  - Config: `vite.config.ts` (webp precache, chunk warning limit for the lazy 3D chunk), `package.json`, `package-lock.json`, `tsconfig.app.json`.
  - Tests: `tests/entrance.spec.ts`, `tests/pwa.spec.ts`.
  - Docs: `docs/ENTRANCE_ART_DIRECTION.md`, `ARCHITECTURE.md` (ADR-007), `PROJECT.md`, `TASKS.md`, `README.md`, `BUILD_LOG.md`.
- **Files deleted:** `lookdev/` (entrance.html, main.ts, scene.ts, textures.ts).
- **Tests and results:**
  - `npm run check` PASS: strict types, ESLint, Prettier, 106 Vitest tests, build. The main bundle is ~91 KB gzip (unchanged); the 3D chunk is 167 KB gzip; the precache is 30 entries, ~1.47 MB.
  - `npm run test:pwa` PASS, 7 Chromium tests:
    - the 3D scene reaches `scene` and the projected bell answers;
    - the offline reload reaches the 3D scene from the precache, and the fonts load offline;
    - without WebGL the poster is kept and no 3D chunk is requested;
    - the reduced-motion poster;
    - the Jamaica local-midnight ceremony and persistence;
    - the London same-instant check;
    - production ignores `?preview=`.
  - Visual pass in the in-app Chromium (Apple M3, Metal) at 390×844: locked, final minute, bell, midnight unlock, doors open, late arrival and foyer.
- **Issues found and fixed:**
  - Under StrictMode, a shared canvas meant the disposed scene killed the live context. Fixed with a canvas per instance.
  - The bell overlay inherited the plate's width and shadow.
  - The MINUTES and SECONDS labels collided (now abbreviated Mins and Secs), and the duplicate 3D legends were removed.
  - The scanned mahogany read muddy and orange; regraded.
  - Glare on the drum enamel.
  - `PCFSoftShadowMap` is removed in r186; now uses `PCFShadowMap`.
  - The frame-count quality check could not catch very slow (software) renderers.
  - The offline-ready wait was too short for the larger precache.
  - Fake-clock ceremony tests were driving software-rendered frames.
- **Known issues and limits:**
  - No iPhone, Safari or WebKit measurement. The tier thresholds are untuned.
  - Headless tests use SwiftShader (first frame ~18 s).
  - The first visit now downloads ~1.5 MB before offline readiness.
  - The interior beyond the doors is a painted plane, not modelled.
  - The 3D reduced-motion path is unit-covered only through shared logic, not by a browser test.
  - Install icons are still provisional.
- **Remaining work:** V03 device rehearsal and tuning, D02 content approval, optional V04 polish, and hosted Netlify verification (H04).
- **Commit:** Unavailable. Changes are uncommitted on main.

## 2026-10-18 01:40 BST (Europe/London) — Claude Code (Opus 5.5) — Phase 4: The Members' Lounge (L01)

- **Task:** replace the foyer holding room with the Members' Lounge: a 3D hub, first-arrival membership ceremony, persistent progress, butler guidance, a members' directory and a room-registry navigation foundation. Codex was writing `EXPERIENCE_BLUEPRINT.md` in parallel; it was not read for direction, edited, formatted or staged.
- **Summary:** see ADR-008. Real-time lounge (walnut, oxblood velvet, marble fireplace with live flames, "30" sunburst overmantel, Deco chandelier, curtained screening-room doorway, brass directory board) with a CSS poster fallback. Four-beat induction ending in a personalised card ("Alise · Founding member · Lifetime · No. 1 of 1 · 24 · X · MMXXVI", provisional) and acceptance. Afterwards: butler briefing, one guided destination ("Your evening continues: The Private Screening Room — Being prepared"), and a dock (Members' Directory, Membership card, Ring for service). Unbuilt rooms never offer a control. Jamaica-time scheduled unlocks, latched once open. Entrance flow, countdown, butler, midnight, fallback and record unchanged; the entrance's foyer butler lines were removed as they described the old holding room.
- **Created:** `src/features/club/` (domain: `rooms.ts`, `schedule.ts`, `membershipRecord.ts`, `clubState.ts`, `loungeScript.ts`, `club.test.ts`; `useClub.ts`; `ui/RoomGate.tsx`, `ui/roomGate.css`, `ui/RoomGate.test.tsx`), `src/features/lounge/` (`preload.ts`; `scene/LoungeScene.ts`, `LoungeCanvas.tsx`, `loungeArchitecture.ts`, `loungeTextures.ts`, `loungeMath.ts`, `loungeMath.test.ts`; `ui/Lounge.tsx`, `MembershipCard.tsx`, `Directory.tsx`, `Sheet.tsx`, `lounge.css`, `Lounge.test.tsx`, `LoungeBuiltRoom.test.tsx`), `src/features/entrance/scene/postfx.ts`, `tests/lounge.spec.ts`, `docs/lounge/01–06*.jpg`.
- **Modified:** `src/app/App.tsx` (room route); entrance `Entrance.tsx`, `Facade.tsx` (lounge prefetch), `EntranceScene.ts` (post-FX moved to `postfx.ts`), `architecture.ts` and `canvasTextures.ts` (helpers exported), `domain/environment.ts` and `entranceEnvironment.ts` (membership storage), `domain/butlerScript.ts` (foyer context removed), `preview/devPreview.ts` (lounge previews), `ui/entrance.css`; tests `Entrance.test.tsx`, `butlerScript.test.ts`, `devPreview.test.ts`, `tests/entrance-poster.spec.ts`, `tests/pwa.spec.ts`; `.claude/launch.json` (second dev server on 5174); `ARCHITECTURE.md`, `TASKS.md`, this log. **Removed:** `src/features/entrance/ui/Foyer.tsx`, `foyer.css`.
- **Checks and results:**
  - `npm run typecheck` — passed. `npm run lint` — passed.
  - `npm run format:check` — **failed only on `EXPERIENCE_BLUEPRINT.md`** (Codex's file, left untouched); `prettier --check . '!EXPERIENCE_BLUEPRINT.md'` passed. Consequently `npm run check` as one command stops there; its remaining steps were run individually.
  - `npm test` — 14 files, 151 tests passed. `npm run build` — passed; precache 32 entries (~1.54 MB); main bundle ~96 KB gzip, lounge chunk ~12 KB gzip, shared three.js chunk ~165 KB gzip. Production bundle grep: no preview, `__lounge` or `lookdev` code.
  - `npm run test:pwa` — 11 Chromium tests passed (after fixing one ambiguous selector in a new test).
  - Visual review at 390×844 in headless Chromium (SwiftShader) across arrival, card, invitation, hub, directory and poster fallback; several composition/lighting iterations (symmetric → three-quarter camera, desaturated velvet and rug, calmer fire, specular/bloom artefacts fixed with an HDR clamp).
- **Known issues:** no iPhone, Safari or WebKit test of any kind; quality tiers untuned for the lounge. Software rendering makes headless frame timings meaningless. The in-app browser pane was hidden during this session, so its throttled rendering was not used for verification. The guided destination currently shows "Being prepared" because the screening room is not built. Side walls are plain panelling and only seen in the focus shots. The camera eases slowly in software rendering (frame-time clamp), which made some screenshots need a dev-only shot override. Card copy and unlock hours are provisional.
- **Remaining work:** S01 Private Screening Room, L02 iPhone rehearsal, L03 owner approval, I02 install guidance, B05 sync policy.
- **Commit:** unavailable — changes are uncommitted on `main`, as before.

## 2026-10-18 (Europe/London) — Claude — Screening Room preparation

- **Task:** Architecture and low-risk foundations for S01; no cinema UI.
- **Summary:** Inspected registry, `RoomGate`, lounge entry. Wrote the implementation plan and added a typed video-message content format with placeholder entries only. `screening-room` remains `built: false`; `ROOM_VIEWS` unchanged.
- **Files created:** docs/SCREENING_ROOM_IMPLEMENTATION.md, src/features/screening/domain/videoMessages.ts, src/features/screening/domain/videoMessages.test.ts.
- **Files modified:** BUILD_LOG.md (appended).
- **Checks:** app typecheck, ESLint and Prettier on the new files passed; 4 focused Vitest tests passed. Full `npm run check` and `npm run test:pwa` not run.
- **Known issues:** Video hosting/storage, captions source and offline policy undecided. No real content exists.
- **Remaining work:** S01a–S01e per the plan.
- **Commit:** Unavailable; nothing staged or committed.

## 2026-10-18 02:23 BST (Europe/London) — Codex — Prompt 05: Private Screening Room

- **Task:** Build the fixed cinematic destination and complete interactive premiere in the existing project; preserve the entrance/lounge and existing uncommitted work.
- **Summary:** Implemented a photographic 2.5D private cinema with separate HTML projection surface, first/return premiere states, actual HTML5 video playback, persistent controls, previous/next/replay/seek, portrait enlargement and fullscreen fallback, a modal message collection, per-message watched/resume persistence, errors/empty-state recovery and tasteful closing. Registered the lazy room through the existing membership gate and registry; directory/butler navigation follows automatically. Completion stamps the club record only after all real messages end. Added a disabled optional future entrance-film integration with Skip, failure/timeout, reduced-motion and seen-state fallbacks. No entrance film or real birthday content was generated.
- **Created:** `src/features/screening/domain/progress{,.test}.ts`; `src/features/screening/ui/{ScreeningRoom.tsx,ScreeningRoom.test.tsx,ScreenPlayer.tsx,MessageList.tsx,CinemaBackdrop.tsx,EntranceFilm.tsx,EntranceFilm.test.tsx,cinemaConfig.ts,screening.css}`; `src/features/screening/preview/ScreeningPreview.tsx`; `public/images/screening/{cinema-portrait,cinema-desktop}.webp`; `build/screeningPreviewMedia.ts`; `playwright.screening.config.ts`; `tests/screening{,.dev}.spec.ts`; two silent synthetic H.264 fixtures in `tests/fixtures/`; `tools/{create-screening-fixtures,capture-screening}.mjs`; `docs/screening/` reference/UI captures and asset prompts.
- **Modified:** screening metadata adds optional transcript while preserving validation; club `rooms.ts`, `useClub.ts`, `RoomGate.tsx` and relevant tests; `src/app/App.tsx` development-only preview; Vite/Playwright configuration; tests formerly assuming screening was unbuilt in entrance/lounge; `docs/SCREENING_ROOM_IMPLEMENTATION.md`, `ARCHITECTURE.md` (ADR-009), `TASKS.md`, this log. `EXPERIENCE_BLUEPRINT.md` received formatting-only cleanup to resolve its documented pre-existing Prettier failure. No entrance/lounge rendering code was changed; no dependencies added.
- **Checks and results:**
  - Final `npm run check` PASS: strict types, ESLint, repository formatting, **175 tests across 18 files**, production build. Screening lazy JS ~5.01 KB gzip, CSS ~2.36 KB gzip; architectural WebPs ~222 KB together. Shell precache 36 entries, ~1.74 MiB, with no video files.
  - `npm run test:pwa` PASS: **13 Chromium tests**, including production gate, no-WebGL room, lounge/directory round trip and production preview/media exclusion. One earlier run found a stale directory expectation (updated for the now-built room). Another run hit the existing software-rendered lounge’s 15-second transition timeout while other checks/captures ran concurrently; a clean isolated full rerun passed, without changing lounge code or test timeout.
  - `npx playwright test --config playwright.screening.config.ts` PASS: **2 Chromium tests** with real synthetic H.264 playback, pause, scrubbing, portrait enlargement, resume, end tracking, recovery, reduced motion and equal projection bounds between clean/premiere/player states. These caught and resolved a real StrictMode source-cleanup issue that mocked media tests did not detect.
  - The optional future film’s Skip/error/autoplay-rejection/timeout/reduced-motion/seen paths are unit-tested. Final malformed-playlist/returning-viewer guard is covered by the 175-test check.
  - `node tools/capture-screening.mjs` captured and visual review inspected 390×844, **1170×2532 (3×)** and 1440×900 end frames plus mobile premiere/player/collection. Dimensions checked. `git diff --check` passed.
- **Known issues / limits:** No actual iPhone, Safari/WebKit, standalone, audio or final-content rehearsal. Test films are silent technical fixtures, never production messages. Current production content remains placeholder-only and is honestly shown as unavailable. Local progress can be lost on eviction/device change. Videos are not cached offline. Generated backdrops are replaceable artwork; 3× captures are browser output, not a claim of native 3× source detail. Fullscreen availability depends on browser support. No private-media backend was added.
- **Remaining work:** Owner approves the end-frame composition; supplies approved videos, sender/order metadata and captions or transcripts; chooses media hosting/privacy and travel backup; rehearses every message on the actual iPhone. Separately generate the entrance cinematic from the captured end frame, then populate the prepared configuration. The local dev server remains available on port 5185 for review.
- **Commit:** No commit or push performed. Existing base observed as `c02dd3e`; all prior uncommitted work preserved. New work remains uncommitted on `main`.

## 2026-10-18 02:37 BST (Europe/London) — Codex — Correct Screening Playback destination

- **Task:** Preserve the cinema as the arrival journey and make the final cinematic/playback destination fill the device display.
- **Summary:** Added a distinct playback presentation independent of the architectural image. Begin/Resume expands the illuminated projection surface to the viewport over 850 ms and removes the room; reduced motion cuts directly. The same HTMLVideoElement continues playing beneath the transition. Portrait video uses full available width at its intrinsic aspect ratio, with transport, collection and sender details below; landscape gives the video most of the display with a compact persistent toolbar. Rotation never remounts/reloads the current video or changes its time, and restores scroll to the film after a tall portrait clip. Existing playlist, completion, persistence, fullscreen and lounge navigation remain intact. Future entrance completion now releases the screen-filling destination directly.
- **Previews:** `?preview=screening-endframe` is now only the illuminated, viewport-filling surface; `?preview=screening-arrival` preserves the seated cinema. `?preview=screening-demo` demonstrates the transition and responsive player. Original WebP artwork was not edited. Landscape arrival uses proportional cover sizing and crop-adjusted screen anchors instead of stretching.
- **Modified:** `src/features/screening/ui/ScreeningRoom.tsx`, `screening.css`, `src/features/screening/preview/ScreeningPreview.tsx`, `tests/screening.dev.spec.ts`, `tools/capture-screening.mjs`, `docs/SCREENING_ROOM_IMPLEMENTATION.md`, `ARCHITECTURE.md`, `TASKS.md`, this log. Regenerated `docs/screening/endframe-*.png` and UI captures; added `arrival-*.png`, `endframe-landscape.png`, `player-landscape.png`, `portrait-source-landscape.png`, `portrait-source-mobile.png`.
- **Checks:** Final `npm run check` PASS (175 tests, typecheck, lint, formatting, build); dedicated Chromium suite PASS (5 tests). Added 390×844 and 375×667 rotation cases in both directions, actual same-element identity, paused-time preservation, continued playback, natural portrait ratio, contain-fit landscape rendering, toolbar visibility and no horizontal overflow. Also tested screen-filling clean reference, separate arrival, reduced motion and push-in completion. `npm run test:pwa` PASS (13 tests); final arrival-anchor/safe-area CSS refinements subsequently passed the default checks and dedicated browser suite. Captures regenerated and visually reviewed at portrait, landscape and desktop dimensions, including 1170×2532 output. `git diff --check` passed.
- **Known limits:** Chromium viewport tests are not physical iPhone/Safari/standalone verification. Technical films remain synthetic and silent. Real messages, audio/captions and the future AI film still require owner content and device rehearsal. A portrait source remains fully visible with letterboxing in landscape; it is never cropped to fill the device.
- **Remaining work:** Approve the corrected final cinematic reference and add real content/film as previously documented. No new dependencies or unrelated room changes.
- **Commit:** None created; all pre-existing uncommitted work preserved on main. Base remains `c02dd3e`.

## 2026-10-18 02:53 BST (Europe/London) — Codex — Private premiere playback refinement

- **Task:** Replace the dashboard-like playback chrome with a restrained, viewport-fitting private premiere while preserving media/navigation/progress contracts.
- **Summary:** Inline playback now has one custom control system and one scrubber; native inline controls are disabled while `playsInline`, deliberate tap playback and optional native iPhone fullscreen are retained. A compact icon transport row and sender line replace the button grids and repeated headings. Messages remains directly accessible; replay, fullscreen, mute, captions/transcript and return-to-lounge live in a native modal options dialog. Portrait viewing centres a full-width natural-aspect film; only sources too tall for a short viewport scale down with contain-fit so the film and controls remain visible without scrolling. Landscape fills the viewport, with tap/keyboard-revealed controls fading after 2.8 seconds of playback. Pausing, errors, keyboard focus and reduced motion retain control access. Routine PWA footer presentation is deferred during active viewing without unmounting worker/status state.
- **End behaviour:** The player keeps the ended source selected and replaces transport chrome with one sender/end overlay. Watch Next, Replay and Browse Messages are explicit actions; there is no automatic advance. The last message offers The end, rewatch/replay/browse and return to lounge. The room continues to own the playlist, persistence and all-message completion; arrival art, push-in and final-frame previews remain functional.
- **Created:** `src/features/screening/ui/premiere.css`; `docs/screening/message-ended-mobile.png`, `message-ended-landscape.png`.
- **Modified:** `src/features/screening/ui/ScreenPlayer.tsx`, `ScreeningRoom.tsx`, `ScreeningRoom.test.tsx`; `tests/screening.dev.spec.ts`; `tools/capture-screening.mjs`; regenerated player/collection/source-orientation captures in `docs/screening/`; `docs/SCREENING_ROOM_IMPLEMENTATION.md`, `ARCHITECTURE.md`, `TASKS.md`, this log. No dependencies or unrelated room implementations changed.
- **Checks/results:**
  - Final `npm run check` PASS: TypeScript, ESLint without warnings, Prettier, **176 tests across 18 files**, production build.
  - `npx playwright test --config playwright.screening.config.ts` PASS: **7 Chromium browser tests** with actual synthetic H.264 playback, pause/seek/resume, same-element rotation, source ratio/contain behaviour, viewport/no-scroll checks at 390×844 and 375×667, control fading/reveal/keyboard access, and ended-source retention until explicit Watch Next. Unit coverage also checks the gesture-called native iPhone fullscreen API path, inline attributes and one scrubber.
  - Default parallel `npm run test:pwa` had 11 passes and 2 failures in unchanged software-rendered lounge timing assertions (handoff visibility and a greeting withdrawing before the scene completed). `npm run test:pwa -- --workers=1` then PASS: **all 13 tests**, with no changes to lounge code, assertions or timeouts.
  - Captured/reviewed `player-mobile.png` (390×844), `player-landscape.png` (844×390), `message-ended-mobile.png`, `message-ended-landscape.png`, and both orientations of the portrait source. Primary film/control layout fits the viewport. Separate arrival/end-frame references were preserved by the capture workflow. `git diff --check` and targeted documentation formatting passed.
- **Known limits:** Playwright WebKit is not installed. No physical iPhone/Safari, standalone, audio or final-content rehearsal is claimed. The native fullscreen branch is unit-tested rather than exercised on a phone. Technical test films remain synthetic and silent. Large-text/device safe-area behaviour and real message codecs/captions still need the existing real-device release rehearsal.
- **Remaining work:** Owner visual review and the existing real-content/iPhone rehearsal. Nothing in this task adds offline media, private hosting or an entrance film.
- **Commit:** No commit or push; base `c02dd3e`. Prior uncommitted work remains preserved on main.

## 2026-10-18 BST (Europe/London) — Claude Code — Temporary developer navigation and final verification

- **Task:** Add a developer-only navigation tool, verify everything serially and prepare the combined Grand Entrance, Members' Lounge and Private Screening Room commit.
- **Summary:** Added a small floating "Dev" menu (bottom-left, 48 px toggle, 44 px minimum link targets, safe-area aware) listing the Entrance countdown states, Lounge states, the Screening Room (unlocked via preview, and the real production gate), Cinema arrival, Playback demo, End-of-message preview, a not-yet-built room gate and an unknown route. It reuses the existing development-only `?preview=` modes (shifted clock, in-memory storage), so it never writes the saved membership and changes no production unlock or access rule. It is mounted from `src/main.tsx` behind a static `import.meta.env.DEV` guard as a lazy chunk; to remove it, delete `src/dev/` and the marked lines in `src/main.tsx`. No dependencies and no visual changes to any approved room.
- **Created:** `src/dev/{DevMenu.tsx,DevMenu.test.tsx,devLinks.ts,devMenu.css}`.
- **Modified:** `src/main.tsx`; `tests/pwa.spec.ts` (production ships no dev menu and ignores preview params); `tests/screening.dev.spec.ts` (menu/touch-target tests; two existing "no buttons" assertions now exclude the dev toggle); `TASKS.md`, this log.
- **Checks and results:** `npm run check` PASS (typecheck, ESLint, Prettier, **179 tests across 19 files**, production build); `grep` of `dist/` finds no developer-menu strings. `npx playwright test --workers=1` PASS (**14** production tests); `npx playwright test -c playwright.screening.config.ts --workers=1` PASS (**9** dev-server tests, including measured >=44 px targets). With Playwright's default 5 parallel workers the software-rendered lounge hand-over test times out (15 s) under load; it passes alone and serially. This is the same existing timing sensitivity logged earlier, not a regression; no lounge code or timeouts were changed. Diff reviewed for secrets and temporary files: none found.
- **Known issues:** Not exercised on a physical iPhone/Safari. The menu is a testing aid, not a feature for Alise.
- **Remaining work:** Delete `src/dev/` before launch if desired; real content and device rehearsal as previously logged.
- **Commit:** See git history for the commit containing this entry.

## 2026-10-18 05:30 BST (Europe/London) — Claude Code (scheduled overnight run) — The Grand Casino and the prize engine

- **Task:** Build the Grand Casino (3D lobby, playable roulette, playable slots), the club-wide prize engine and the Gift Vault contract (not the vault), integrated with the Members' Lounge. Authorised explicitly by the owner for the casino only; no backend, no live AI, no new dependencies.
- **Summary:** `src/features/prizes/` is a game-agnostic ledger (counters, eligibility, one-time awards, claim, versioned persistence and migration, Gift Vault reader). `src/features/casino/` holds pure roulette and slot engines with scripted outcomes (decided and saved before any animation), a lazily loaded Three.js room (roulette table with a 37-pocket wheel and ball, antique slot machine with three reels and a lever, chandelier, panelling, curtains, marble floor with brass inlay), cinematic camera paths, a flat fallback when WebGL is unavailable or slow, the butler's casino lines, a skippable prize reveal, a collection sheet, Web Audio synthesis with a mute switch, a centralised asset registry and an optional entrance-film hook, and dev-only tools. The casino room is now `built` and reachable from the Members' Lounge directory and the butler's guidance. Dev previews: `?preview=casino-lobby|casino-roulette|casino-slots|casino-jackpot|casino-completed`.
- **Created:** `src/features/prizes/*`; `src/features/casino/{config,domain,scene,ui,audio,dev}/*`, `useCasino.ts`; `tests/casino.spec.ts`, `tests/casino.look.spec.ts`, `playwright.casino.config.ts`; `docs/PRIZE_SYSTEM.md`, `docs/GRAND_CASINO_REPORT.md`, `docs/casino/*.png` (full-quality captures, portrait and landscape).
- **Modified:** `src/features/club/domain/rooms.ts` (casino `built: true`), `club/ui/RoomGate.tsx` (lazy casino view, per-room preparing text), `entrance/domain/environment.ts` and `entrance/preview/devPreview.ts` (casino preview modes), `src/dev/devLinks.ts`, `club.test.ts` and `RoomGate.test.tsx` (the built-rooms list now includes the casino; the "still being prepared" case now uses the Gift Vault), `playwright.config.ts`, `eslint.config.js`, `.prettierignore`, `.gitignore`, `package.json` (`capture:casino`), `ARCHITECTURE.md` (ADR-010), `TASKS.md`, this log.
- **Checks and results:**
  - `npm run check` PASS: typecheck, ESLint, Prettier, **310 tests in 28 files** (the casino and prize suites account for 131 of them), production build.
  - `npm run test:pwa -- --workers=1` PASS: **17 production-build browser tests** (the 14 existing plus 3 casino). In software-rendered Chromium the casino's performance guard downgrades the scene to the flat fallback within seconds, so these exercise the fallback path end to end (spin, result, reveal, claim, persistence, reload, corrupt data).
  - `npm run capture:casino` PASS (2 tests): a look-development build that keeps full quality in software rendering; plays roulette (scripted win, reveal, claim) and slots in 3D at 390×844 and 844×390. Screenshots reviewed by eye: lobby, camera travel, roulette bet/spin/result, prize reveal, slot machine at rest/spinning/result; the 3D payline (rose, rose, crown) matched the interface's result for the same spin. Measured in the slots view: 81 draw calls, ~51,500 triangles, 50 textures.
  - Production bundle checked: no dev tools or look-dev flag strings in `dist/`.
- **Known issues:** Never run on a physical iPhone; frame rate and thermal behaviour are unmeasured. The Playwright runs use software rendering. Audio is synthesised and untested by ear. The roulette ball landing is proved by unit tests for every pocket and start angle; that the ball rests on the pocket printed with the result was not confirmed at pixel level. The 3D lever tap, the dev tools panel and the `?preview=casino-*` URLs were not exercised in a browser (a dev server could not be started in this run); their logic is unit-tested. The optional entrance film has never been played with a real video. Placeholders await the owner: clue text, Vault Key code `TC-0000` and vault id, House Favour privilege, emblem art. Unlock codes in the client bundle are not secure (ADR-003/010).
- **Remaining work:** Owner review (docs/GRAND_CASINO_REPORT.md lists a prioritised inspection list), real content (C04), bespoke artwork (C05), real-iPhone rehearsal (C06), Gift Vault (not started, by design).
- **Commit:** Code `0368753` (plus earlier `f0eb44c`, `a6da56e`); this log entry and the report are committed immediately after, see git history.

## 2026-10-18 11:53 BST (Europe/London) — Codex — Secret owner access

- **Task:** Add production-compatible private owner rehearsal via the Grand Entrance clock; preserve the guest countdown, isolate every test record, document use, verify and push for Netlify.
- **Summary:** Added a rolling five-tap gesture, PIN 1414 (explicitly requested), Art Deco native modal, owner navigation for implemented rooms, full birthday ceremony preview, locked rehearsal, reset and exit. Reused the existing entrance/club state machines and casino test tools. Owner records use a separate sessionStorage namespace; guest localStorage keys and the actual birthday are unchanged. Authorization is snapshotted for the lifetime of the document, and reset/exit suspends old-document writes so asynchronous cleanup cannot recreate cleared records or affect guest rewards. No backend, dependencies or general production development-mode switch added.
- **Created:** `src/features/owner/{session.ts,session.test.ts,OwnerAccess.tsx,owner.css}`, `tests/owner.spec.ts`, `docs/OWNER_ACCESS.md`.
- **Modified:** `src/app/App.tsx`; entrance environment, timepiece/facade and scene clock projection; entrance/membership/screening/casino/prize storage adapters; optional casino film session storage; casino tool gating/copy/styles; `ARCHITECTURE.md`, `TASKS.md`, this log.
- **Checks and results:** Initial `npm run check` passed (314 tests across 29 files, types, lint, formatting, production build). Four production Chromium owner tests passed. WebKit initially exposed a click-through bug: opening on pointer-up let the same touch-generated click hit the newly shown Close button. Activating on the completed click fixed it; all four WebKit owner tests then passed, including actual taps over the projected Three.js clock. Final `npm run check` passed (314 tests). `npm run test:pwa -- --workers=1` passed all 21 production Chromium tests, including the 17 existing guest/room/offline checks and four owner cases. Matching Playwright WebKit was installed after the first launch attempt reported a missing executable; no project dependency changed. Test panel screenshot reviewed at 390×844; native dialog centered and scrollable, controls at least 44px. Browser output is generated/ignored, not committed.
- **Known issues:** Physical iPhone Safari/Home Screen rehearsal remains unperformed; browser-engine tests do not measure device GPU/thermal performance or safe areas. Browser restore-tab/session features may restore sessionStorage: Exit owner mode is the explicit handover action. Existing placeholder casino rewards and absent real screening messages remain unchanged. Public bundles contain the requested PIN; this is a convenience gate, not private-asset authentication. Vite preview checks production assets but does not emulate Netlify Edge routing.
- **Remaining work:** Physical device/content rehearsal and hosted deployment confirmation remain outside the local browser checks. The completed code is committed for the requested main-branch push to Netlify.
- **Commit:** `2259c27` — completed owner-access implementation; base `cfe61f4`. Final production rebuild and all four WebKit owner cases passed again after the storage cleanup and typography refinements. Work performed in an isolated checkout under the attached `30club` workspace; the original clean checkout was not edited.

## 2026-10-18 13:10 BST (Europe/London) — Claude Code (Opus 5.5) — The Concierge: pre-birthday journey (ADR-012)

- **Task:** Design and implement the pre-birthday Concierge from the owner's brief:
  - Phase One invitation and Departure Lounge (22 Oct 14:00 Europe/London).
  - NFC travel credential with a manual fallback.
  - Duty-Free and In-Flight privileges with real notifications to Arron.
  - Friday correspondence.
  - The Saturday membership-card gate before the Members' Lounge.
  - Scheduled concierge messages to Alise.
  - Owner testing.
- **Summary:**
  - **Plan.** Written first in `docs/CONCIERGE.md` Part 1, then implemented.
  - **Backend (the first; ADR-003 had deferred it).**
    - One Netlify Function at `/api/*` and a Scheduled Function every minute.
    - Netlify Blobs, using create-if-new and ETag writes.
    - HMAC-signed sessions, constant-time credential checks and per-IP rate limits.
    - Idempotent redemptions with delivery status tracked separately: `delivered` only on Telegram `ok: true`. Retries with backoff, then owner resend.
    - Scheduled messages claimed once. Alise's messages are handed to Arron by Telegram (default) or sent by Twilio SMS (`ALISE_DISPATCH=sms`).
    - A server-side rehearsal realm with a virtual clock, `[REHEARSAL]`-marked notifications and no SMS to Alise.
  - **Client (new feature `src/features/concierge/`).**
    - A 2.5D Departure Lounge (`/departure`): split-flap board, concierge letters, luggage-tag riddle, boarding-pass ceremony, leather wallet, and wax-sealed envelopes. Each envelope runs through locked, reveal, active, redemption, ink-stamp confirmation and redeemed states. All state persists, and offline pending intents are never shown as redeemed.
    - The NFC arrival route (`/c/:token`).
    - The owner console (`/concierge/owner`) and a rehearsal ribbon.
  - **Entrance.**
    - A sealed letter on the step (Phase One, then a link once the lounge opens).
    - The countdown now targets **Jamaica midnight explicitly** (amends ADR-006).
    - New stage `awaiting-credential`: the birthday alone no longer opens the doors. The card's link, the number printed on it, or detection by a paired display plays the existing ceremony.
    - Scheduled rooms (Casino 2 pm, unchanged time) now also require the membership, so direct links cannot skip it.
  - **Integration with the other agent's work.**
    - Another agent pushed the PIN owner test mode (`2259c27`, also numbered ADR-011) during this task. I rebased onto it without changing its behaviour. Its storage adapter now takes the concierge's realm keys. Its environment supplies the card: absent in the locked preview, presented in the birthday and open previews.
    - Its birthday preview now starts at Jamaica midnight; `docs/OWNER_ACCESS.md` is corrected to say so.
    - The concierge record is renumbered ADR-012.
- **Created:**
  - `src/features/concierge/**` (domain, client, ui, owner, testing helper, tests).
  - `netlify/concierge/**` (store, Blobs adapter, config, auth, channels, service, api, dispatch, test doubles, 41 tests).
  - `netlify/functions/api.ts` and `netlify/functions/concierge-dispatch.ts`.
  - `build/conciergeLocalApi.ts`.
  - `tests/concierge.spec.ts` and `tests/concierge-helpers.ts`.
  - `tools/membership-hash.mjs`.
  - `docs/CONCIERGE.md` and `.env.example`.
- **Modified:**
  - Project: `netlify.toml` (functions directory; `/api/*` 404 redirect removed, bare `/api` kept); `vite.config.ts` (local API plugin, netlify tests included); `playwright.config.ts` (`CONCIERGE_LOCAL_API=1`); `package.json` and lockfile (`@netlify/blobs` ^11.1.2).
  - App: `src/app/App.tsx` and its test; `src/dev/devLinks.ts` and its test.
  - Club: `clubState.ts`, `membershipRecord.ts` (key parameter), `club.test.ts`.
  - Entrance domain: `countdown`, `entranceMachine`, `entranceRecord` (key parameter), `environment`, `butlerScript`.
  - Entrance UI and scene: `entranceEnvironment`, `useEntrance`, `Facade`, `Entrance`, `entrance.css`, `EntranceScene`, `devPreview`, and their tests.
  - Lounge tests.
  - Browser tests: `tests/entrance-poster.spec.ts` and `tests/lounge.spec.ts`.
  - Docs: `docs/OWNER_ACCESS.md` (one line), `ARCHITECTURE.md` (ADR-012), `TASKS.md` (K01–K12), `README.md`.
- **Checks and results (final, on the rebased branch):**
  - `npm run check` PASS: types, ESLint, Prettier, **418 tests in 34 files**, production build.
  - `npx playwright test --workers=1` PASS: **30 production Chromium tests**, including the 8 new concierge tests (390×844 mobile emulation, fake channels) and the other agent's 4 owner tests.
  - `npx playwright test -c playwright.screening.config.ts --workers=1` PASS: 9 tests. This ran before the rebase, and that suite was not touched by it.
  - `grep` of `dist/` found no test keys, local-API routes or test helpers.
  - Visually reviewed in the in-app browser at 390×844, against the dev server and its fake API: closed lounge, credential request, boarding ceremony, wallet, seal break, Duty-Free granted with the fake Telegram outbox checked, in-flight choices and SERVED stamp, letter on the step, birthday card prompt, owner console.
  - The review led to fixes: boarding-pass stub overflow, seal and title overlap, stamp placement, envelope eyebrow contrast and mark placement.
- **Not verified (honest):**
  - No Netlify deploy. The Functions, Blobs, scheduled function and edge routing have not run on Netlify.
  - No real Telegram or Twilio call; every test uses fakes.
  - No physical NFC tag, iPhone, Safari or WebKit run of the concierge.
  - The in-flight time (18:30 UK), Friday time (09:00 Jamaica), the riddles and all concierge copy are PROVISIONAL, awaiting the owner.
- **Remaining work (owner):**
  - K08: create the Telegram bot, set the environment variables, deploy, send a console test.
  - K09: write and test NFC tags in a rehearsal, print the codes, choose the riddles.
  - K10: full iPhone rehearsal, then clear test records.
  - K11: optional Twilio.
  - K12: copy and time approvals.
- **Commit:** `9b4fb5d` (feature, on branch `concierge/pre-birthday`, rebased onto `6ebc301`); this log entry is committed immediately after it. See git history.

## 2026-10-18 Europe/London — Codex — Phase A backend contract

- **Task:** Inspect actual source repository and existing concierge, establish PostgreSQL authority and commit the frontend contract before implementation.
- **Summary:** Read required project documentation; inspected existing Netlify Blobs concierge, owner/rehearsal routes, credentials, Twilio channel and slots engine. Isolated branch starts at source commit `2e345de`; original `.env.example` modification preserved. Created dedicated Supabase project The Thirty Club in AG14, London, after explicit organization choice; quoted cost $0/month. Added exact v1 contract, shared types and ADR-014.
- **Created/modified:** `docs/CONCIERGE_API_CONTRACT.md`, `src/shared/concierge/types.ts`, `ARCHITECTURE.md`, `TASKS.md`, `BUILD_LOG.md`.
- **Checks/results:** Repository and API inspection; contract formatting/type checks recorded at commit. No backend implementation or production verification claimed.
- **Known issues/remaining work:** Phase B implementation, migrations, server environment configuration, deployment and real redemption rehearsal. No SMS approved or sent.
- **Commit:** This Phase A commit; hash reported to the owner immediately after creation.

## 2026-10-18 17:19 BST (Europe/London) — Codex — Phase B backend and Butler’s Office

- **Task:** Complete authorized backend infrastructure, secure redemption APIs, mobile owner dashboard, Twilio outbox, scheduling, Casino compatibility, tests and deployment handoff after the separately committed contract.
- **Summary:** Dedicated Supabase project `fzndcjzenodcixmuvfsb` has five applied migrations matching the local history. Added members, hashed single-use invitations/future NFC assignments, revocable opaque sessions, persistent login rate limits, privileges, transactional redemptions, numeric voucher balances/ledger, server-issued slot outcomes, activity, scheduled messages and delivery logs. All tables have RLS and explicit service-only policies; browser roles have no table/RPC grants. Owner password uses server-side scrypt; HttpOnly/Secure/SameSite Strict cookies and mutation origin/header checks protect the APIs. Neither the cinematic verification nor the existing rehearsal PIN grants v1 authority.
- **Beauty flow:** Independent single-use Nail/Brow Appointment privileges, variable integer GBP pence, server time gates, stable idempotency keys, atomic duplicate prevention, pending claims and idempotent owner fulfilment. Browser rehearsal completed owner login → invitation → secure member API → £42.50 nail claim → exact replay → owner fulfilment → member status. No live claim remains in Supabase.
- **Rewards:** First actual server slots play grants exactly ten drink vouchers once. Later server-validated qualifying outcomes add quantities; no product balance cap. Claims deduct atomically without overdraw; owner adjustments are audited and idempotent. The existing Casino visuals/interaction code were preserved; only two type-import file extensions changed for server tooling. The frontend integration point is documented and remains a frontend handoff.
- **Messaging:** Existing Twilio Messaging Service SID, environment-only credentials/recipients, approval-based PostgreSQL outbox, every-minute Netlify scheduled function, bounded retry/backoff for definite rate limits, provider delivery logs, signed callbacks bound to each send attempt. Ambiguous sends are held for reconciliation. Claims survive SMS failures. Initial scheduled messages are drafts; Friday is undated; future transactional approval is disabled. Global sending defaults false. No real SMS or Telegram message was sent.
- **Legacy data:** Existing concierge/rehearsal interfaces remain available. A guarded, paginated copy/verification tool preserves Blobs records before explicit PostgreSQL cutover; the old storage remains selected until that step completes. Source data is never deleted or overwritten by the tool. Existing legacy scheduled dispatch is replaced by the approved outbox worker to prevent unapproved provisional messages.
- **Created:** `netlify/backend/**`; five `supabase/migrations/*.sql`; `src/features/butlers-office/**`; `src/shared/concierge/time{,.test}.ts`; `build/butlersOfficeLocalApi.ts`; `playwright.office.config.ts`; `tests/butlers-office.spec.ts`; `tools/{owner-password,migrate-concierge}.mjs`; `docs/BACKEND_OPERATIONS.md`.
- **Modified:** `netlify/functions/{api,concierge-dispatch}.ts`, `src/app/App.tsx`, shared API types/contract (additive owner notification policy and provider attempt ID), Vite/Playwright configuration, `netlify.toml`, package manifest/lockfile (pinned PGlite dev dependency), `.env.example` with blank secret placeholders, `.gitignore`, README and project/architecture/task/journal documentation.
- **Checks/results:** Final `npm run check` PASS: strict TypeScript, ESLint, Prettier, **472 tests in 38 files**, production build. New PostgreSQL/API/time suites contribute **40 tests** covering authentication/revocation, access/time gates, invalid amounts, duplicate/concurrent requests, fulfilment, ledger/overdraw integrity, first-play rewards, owner editing, SMS failures/retries, scheduler idempotency and callback races. `npx playwright test --workers=1` PASS **32 existing production Chromium regressions** (5.1 minutes), preserving Casino, entrance, verification, lounge, PWA, owner rehearsal, screening and concierge flows. Final `npx playwright test -c playwright.office.config.ts` PASS **2 mobile Chromium office tests**, including actual local PostgreSQL redemption/fulfilment and explicit Jamaica timezone drafting. `npm run functions:build` PASS with Netlify CLI 27.13.0; both bundles and the `/api/*` route/minute schedule appear in its manifest. Production bundle scan found no server-key names, local rehearsal password, scrypt hash or PGlite code. `git diff --check` and both setup scripts' syntax checks passed. Mobile office screenshot reviewed at 390px (1170px device output), no horizontal overflow.
- **Hosted database checks:** Beauty claim/retry/fulfilment and callback-before-result race verified inside rolled-back transactions; final state is zero redemptions, four draft messages, zero approvals, transactional policy false. Supabase security advisor has **no findings**. Performance advisor has informational unused-index notices on the new empty database, documented in operations guide; indexes retained for queues, foreign keys and recent history.
- **Verification fixes:** Corrected a PL/pgSQL column/variable ambiguity found by Casino tests. Bound callbacks to attempt IDs so old callbacks cannot mutate a new retry, and handled a callback arriving before the send result. Corrected a browser selector for the native timezone control. A first sandboxed Playwright start was denied localhost binding; the authorized rerun passed. Original source checkout's unrelated uncommitted `.env.example` values were not copied or committed.
- **Deployment status / blockers:** Code and Functions are locally verified. Supabase schema is applied. Netlify CLI is not logged in; no application deployment performed. Owner is configuring server environment variables. Real Twilio delivery, hosted browser redemption and physical iPhone/Safari/Home Screen verification are not claimed. Legacy data copy/cutover requires Netlify access and a write freeze. Casino frontend must adopt the documented server-play API. No real sends are authorized by this log.
- **Remaining work:** Owner follows exact environment/deploy steps in `docs/BACKEND_OPERATIONS.md`, deploys the reviewed branch, integrates the frontend Desk/Casino where assigned, performs the hosted beauty rehearsal and approves any real message separately.
- **Commits:** Phase A `1486f9ae50ab26e38dd0dfcf6b82a73d10ba6667`; this implementation entry is included in the Phase B commit reported in the handoff.

## 2026-10-18 17:22 BST (Europe/London) — Codex — Final backend publication

- **Task:** Complete the reviewable branch and deployment handoff.
- **Summary:** Published Phase B commit `05250c763fc9f97cd8b73314fd5161b235ec5361`. Included the local PostgreSQL rehearsal plugin registration in Vite in this follow-up so a clean checkout can run the already-verified office suite. Updated operations instructions with a direct branch comparison link.
- **Modified:** `vite.config.ts`, `docs/BACKEND_OPERATIONS.md`, `BUILD_LOG.md`.
- **Checks/results:** All final implementation checks recorded above ran with this Vite registration present: 472 tests, 32 existing browser regressions, 2 office browser tests and both Netlify bundles passed. Final formatting and Git whitespace/status checks passed.
- **Known issues:** GitHub connector rejected PR creation with HTTP 403 (`Resource not accessible by integration`); no PR was created. The feature branch is successfully pushed and directly reviewable. No app deployment or real message was attempted.
- **Remaining work:** Owner configuration, manual PR creation/merge and the hosted/device verification described in operations documentation. No additional production credentials are needed for completed local work.
- **Commit:** This final handoff commit; hash reported with Phase A and Phase B in the final response.

### Final rescheduling recovery check — 2026-10-18 17:25 BST (Europe/London) — Codex

- **Task/summary:** Final review found that editing an exhausted scheduled SMS retained its five-attempt counter, allowing approval without a future send. Added a sixth migration to reset the bounded cycle and invalidate old send identifiers only when the owner edits an unsent scheduled draft. Saving still removes approval.
- **Modified:** Sixth migration, `netlify/backend/database.test.ts`, API contract/operations/architecture/task documentation and this log.
- **Checks/results:** Focused PostgreSQL/API/time suites PASS **41 tests**, including the exhausted-message edit/reapproval/claim regression. Migration applied to the dedicated hosted project; no provider call. Final `npm run check` PASS: **473 tests in 38 files**, strict types, ESLint, Prettier and production build. Final hosted security advisor again returned no findings. Existing 32 browser regressions and 2 mobile office tests remain the unchanged UI verification.
- **Known issues/remaining work:** Production credentials, deployment, legacy copy and hosted/device rehearsal remain as recorded above. No real SMS.
- **Commit:** Included in the final unpublished handoff commit before its first push; Phase A and Phase B history are preserved.

## 2026-10-18 17:40 BST — Claude (Sonnet 5.5) — Shopping Privilege (no Supabase)

- **Task:** Surprise Shopping Privilege: SMS announcement, deep link `/?concierge=shopping`, Butler UI, hidden server-side £100 ceiling, SMS to Arron. Built on branch `feature/shopping-privilege` (separate worktree) so it cannot collide with the Supabase/desk work.
- **Summary:** One new concierge route, `GET/POST /api/concierge/shopping`, using the existing session, rate limit, Netlify Blobs store (create-if-new, so single use is genuinely enforced) and Twilio channel. Amount parsed to integer pence server-side; the ceiling exists only in `netlify/concierge/shopping.ts`. Success is returned only after Twilio accepts the SMS to `ARRON_PHONE`; on failure nothing is recorded and she may retry. Test mode is the existing rehearsal realm (`/concierge/owner?start=shopping`, owner key required): separate records, SMS to Arron marked `[TEST — NOT REAL]`, never to Alise. `npm run butler:shopping` sends the announcement (confirmation prompt, `--dry-run`, once-only marker).
- **Created:** `netlify/concierge/shopping.ts`, `shopping.test.ts`, `src/features/concierge/client/shoppingApi.ts`, `ui/ShoppingPrivilege.tsx`, `ui/shoppingPrivilege.css`, `tools/butler-shopping.mjs`.
- **Modified:** `netlify/concierge/api.ts`, `client/api.ts` (export `call`), `App.tsx`, `firstVisit.ts` (cinematic skipped for the shopping link), `OwnerConsole.tsx` (`?start=shopping`), `package.json`, `.gitignore`.
- **Checks:** `npm run check` PASS (454 tests, 17 new). Browser check at 375×812 against the dev server with fake channels: rehearsal start, Butler intro, £150 refused with the Butler's wording, £75 accepted, AWAITING SETTLEMENT, fake SMS outbox correct. `dist/` contains no ceiling or refusal copy.
- **Not verified:** No Netlify deploy, no real Twilio call, no iPhone/Safari run, no Playwright suite run. `npm run butler:shopping` was only dry-run, and only up to the missing-variables check (local `.env` has no Twilio values).
- **Known limits:** Single use is per realm, not per identity: the first valid request wins. Anyone holding a membership session on the live realm can use it. The live link carries no secret; a device with no session must present the membership card number first.
- **Remaining:** Deploy approval; set env vars; iPhone test; send announcement.
- **Commit:** see git history on `feature/shopping-privilege`.

## 2026-10-18 17:38 BST (Europe/London) — Codex — Permanent backend deployment preparation

- **Task:** Review the approved backend, preserve concurrent Shopping work, prepare a mergeable branch and guide production configuration one step at a time.
- **Summary:** Fetched published main `7a1f815`, which already includes Shopping. Merged those committed changes into the backend branch only; resolved additive conflicts in ignore rules, package scripts and project journals/backlog. The App merge retains both the Shopping overlay and `/owner`. All ten Shopping implementation files match main byte for byte. Sonnet's worktree and the original project checkout were not edited. Found separate unpublished `/api/desk` work in the original checkout; it is outside this deployment candidate.
- **Created/modified:** Merged main's Shopping files; preserved all backend files; updated `BUILD_LOG.md`, `TASKS.md` and `docs/BACKEND_OPERATIONS.md` with the compatibility/deployment boundary. Generated a unique owner password and verified scrypt hash by driving the existing interactive script locally. Credentials are in a private 0600 file outside Git; no values are included here or in chat.
- **Checks/results:** Combined `npm run check` PASS: strict types, lint, formatting, **490 tests in 39 files**, production build. Both Netlify Functions bundled successfully. Two mobile owner/beauty API browser rehearsals passed with fake/disabled providers. Git whitespace check passed. Shopping's own unit tests are included in the 490. The earlier 32 cinematic/PWA browser checks remain recorded above; not rerun in this preparation task.
- **Known issues:** GitHub connector still returns 403 for PR creation; direct comparison link is provided. Netlify CLI has no authenticated account, so browser authorization is initiated. Existing Shopping owns its direct SMS behavior; production verification will not POST a Shopping claim or execute its announcement command. `SMS_SENDING_ENABLED=false` remains required for the permanent backend; no messages or policy approvals were enabled.
- **Remaining work:** Owner authorizes Netlify access, then configure only the required environment safely, review/merge the candidate and verify the actual deployed owner/API/Functions. No production deployment or real SMS occurred during this preparation.
- **Commit:** This compatibility merge commit; reported in the handoff.

## 2026-10-18 17:41 BST (Europe/London) — Codex — Production backend configuration started

- **Task/summary:** Netlify browser authorization completed. Identified the existing `thirty-club` site by its `30.ag14.co` custom domain and `ArronG14/the-thirty-club` main-branch binding. Configured production Functions `SUPABASE_URL`, `CONCIERGE_SITE_URL`, the privately generated `OWNER_PASSWORD_HASH` (marked secret), and `SMS_SENDING_ENABLED=false`. No secret values were printed, committed or sent in chat.
- **Modified:** This journal and TASKS.md; external production Functions environment only. Source/Shopping worktrees remain untouched.
- **Checks/results:** Netlify confirmed all four variable writes. The candidate is clean, pushed, and includes published main. Private bootstrap credentials have 0600 permissions. Earlier combined 490 tests, two owner browser checks and Function bundles passed.
- **Known issues/remaining work:** Dedicated-project `SUPABASE_SERVICE_ROLE_KEY` must be added privately by the owner before authenticated hosted APIs can operate. No merge to main, application deployment, scheduled approval or real SMS has been performed. Shopping's direct notification path will not be exercised during verification.
- **Commit:** This configuration checkpoint commit; no application behavior changes.

## 2026-10-18 20:47 BST (Europe/London) — Claude (Opus 5.5) — The Private Gift Vault (ADR-015)

- **Task:** Build the Private Gift Vault on the PostgreSQL backend: compartments, NFC treasure-hunt verification, cinematic opening, owner controls and preview. Continued after the first session was interrupted by a full disk.
- **Summary:** Isolated worktree `../the-thirty-club-vault`, branch `feature/gift-vault`, created from `origin/codex/backend-butlers-office` (`f6c4222`); the original checkout's uncommitted desk work was not touched. Added migration `20261019090000_gift_vault.sql` (`ttc_vaults` plus a separate `ttc_vault_action` RPC; `ttc_action` unchanged). The new RPC gives:
  - states LOCKED → READY → OPENED, with atomic, idempotent opening under a row lock;
  - SHA-256-looked-up NFC tokens and backup codes, and failure rate limits;
  - the server birthday time-lock (24 Oct 00:00 Jamaica), lazy scheduled readiness and a casino release;
  - a read-only preview and tag verification.

  `netlify/backend/vault.ts` adds the member and owner routes and the membership bridge (live concierge session → v1 member cookie). Frontend `src/features/vault/`:
  - `/v/<token>` → `/vault`, with the key held across reloads and the membership prompt;
  - a lazy Three.js deposit chamber: curved brass box bank, round vault door, compass floor, oculus;
  - the dial, bolt and door ceremony with synthesised sound, the envelope and letter;
  - the CSS chamber fallback and reduced motion.

  The Butler's Office gains a vault tab: create/edit, triggers, ready/lock/unlock, NFC URL with a self-contained QR encoder, backup codes, rotation and Preview. The Gift Vault room now opens with the birthday membership; the provisional 18:00 Jamaica schedule was removed and the lounge announcement reworded.

- **Created:** `supabase/migrations/20261019090000_gift_vault.sql`, `netlify/backend/vault.ts`, `netlify/backend/vault.test.ts`, `src/features/vault/**`, `src/features/butlers-office/{VaultOffice.tsx,qr.ts,qr.test.ts}`, `tests/gift-vault.spec.ts`, `docs/GIFT_VAULT.md`.
- **Modified:**
  - backend: `netlify/backend/{api,database,database.test}.ts`, `build/butlersOfficeLocalApi.ts` (local-only time-lock switch, bridge secret);
  - app: `src/shared/concierge/types.ts`, `src/app/App.tsx`, `src/features/butlers-office/{ButlersOffice.tsx,office.css}`;
  - club: `src/features/club/{domain/rooms.ts,domain/schedule.ts,ui/RoomGate.tsx}` and its tests, `src/features/lounge/ui/Lounge.test.tsx`;
  - other: `src/features/concierge/ui/CredentialArrival.tsx` (resume at the vault when a key is held), `tests/entrance-poster.spec.ts`, Playwright configs;
  - docs: `ARCHITECTURE.md`, `TASKS.md`, `PROJECT.md`, `docs/CONCIERGE_API_CONTRACT.md`.
- **Checks/results (final run):**
  - `npm run check` PASS: strict types, ESLint, Prettier, 536 tests in 43 files (including 27 vault backend tests, 38 existing database tests, vault maths, held key and QR round-trip), production build;
  - `npx playwright test -c playwright.office.config.ts` PASS: 5 tests (2 existing office tests and 3 vault tests: full NFC journey with reload, membership, interrupted ceremony, re-scan and location edit after opening; preview immutability; malformed link);
  - `npx playwright test --workers=1` PASS: 32 existing production regressions, after updating three tests (one Playwright, two unit) to the intended room opening and the reworded announcement;
  - visual review in the in-app browser and headless captures at 390×844 and 1280×800.
- **Fixes from verification:**
  - a CSS-fallback ceremony could hang when the 3D scene finished loading mid-ceremony;
  - a scene created after an NFC scan built the door already open;
  - lighting: bloom, seam and wash glare, a dark entry shot, house lights now dim on approach, the cornice glare;
  - the poster order and clipping, the portrait close-up framing, the status footer deferred during close-ups;
  - an inaccurate Butler line;
  - example locations removed from the bundled owner-form placeholders.
- **Known issues:**
  - `RoomGate.test.tsx` "admits an inducted member to the screening room" failed once in about ten full parallel unit runs: the lazy Screening Room chunk had not resolved within `findByText`'s 1 s. It is pre-existing and load-sensitive, with no screening code changed, and was left unweakened.
  - Casino-triggered availability is not live: the casino frontend plays slots locally and never calls `POST /api/v1/casino/slots/play` (GV07).
  - Software-rendered Chromium falls back to the CSS chamber at large viewports, as designed. There is no iPhone measurement.
  - `npm run functions:build` was not rerun.
  - The disk had 3.0 GB free after removing the npm cache and unused Playwright browser builds.
- **Remaining work:** GV08 (owner approves and applies the migration to the hosted project, merge and deploy, programme NTAG tags, iPhone Safari rehearsal), GV07, GV09 (copy approval).
- **Commit:** see `git log` on `feature/gift-vault` (not pushed, not merged).

## 2026-10-18 21:40 BST (Europe/London) — Claude (Opus 5.5) — Gift Vault + permanent backend integration

- **Task:** Prepare one coherent application: production `main` + the Supabase backend + the Gift Vault, without disturbing the live Shopping Privilege.
- **Summary:** New worktree `../the-thirty-club-integration`, branch `integration/gift-vault-backend`, from `origin/main` `277eaa7`. Merged `origin/codex/backend-butlers-office` (`f6c4222`), then `feature/gift-vault` (`870edb9`); both merges were conflict-free. Shopping implementation files, `netlify/concierge/{api,blobStore,channels}.ts` and the legacy owner console are byte-identical to `origin/main`. `/owner` holds every backend tab plus _vault_; the legacy `/concierge/owner` console remains for the Blobs concierge. Added the integrated release runbook to `docs/BACKEND_OPERATIONS.md` (migrations, environment, the dispatcher behaviour change, release and rollback steps).
- **Created/modified:** two merge commits; `docs/BACKEND_OPERATIONS.md`, `TASKS.md`, `BUILD_LOG.md`.
- **Checks/results:**
  - `npm run check` PASS (strict types, ESLint, Prettier, 537 tests in 43 files including 27 vault backend, 38 database and the Shopping suites, production build);
  - `npx playwright test -c playwright.office.config.ts` PASS 5 (office redemption and SMS drafting; vault NFC journey with membership, reload, interrupted ceremony, re-scan and location edit; preview immutability; malformed link);
  - `npx playwright test --workers=1` PASS 32 production regressions;
  - `npm run functions:build` (Netlify CLI 27.13.0) PASS: `api` (`/api/*`, vault code present) and `concierge-dispatch` (every minute).
- **Known issues / decisions for the owner:**
  - Inherited from the backend branch: `concierge-dispatch` now runs only the approved PostgreSQL SMS outbox, so legacy Blobs scheduled messages and Telegram retries stop. Shopping is unaffected because it sends synchronously.
  - `CONCIERGE_LEGACY_STORAGE` must stay blank until the documented copy, or Shopping's redemption record would be hidden.
  - The original checkout's local `main` (`49142ef`, unpublished) carries another agent's separate `/api/desk` PostgreSQL design (its own ADR-014 and migrations). It is not part of this integration and competes with the backend chosen here; it needs a coordination decision before any of it is merged.
  - No hosted migration, secret change, merge, push or deploy was performed.
- **Remaining work:** GV11 owner release steps, GV08 tags and iPhone rehearsal, GV07 casino frontend adoption of the server slots API.
- **Commit:** this integration commit on `integration/gift-vault-backend` (not pushed).

## 2026-10-18 23:15 BST (Europe/London) — Claude (Opus 5.5) — Scheduler audit fix on the integration branch

- **Task:** Codex's read-only audit found that replacing `concierge-dispatch` stopped the legacy travel announcements and Telegram retries. Requirement: keep PostgreSQL as the only scheduler of future Butler SMS, preserve immediate redemption notifications and legacy retries, never duplicate a scheduled message, and keep `/concierge/owner` honest.
- **Summary:**
  - New framework-free `netlify/backend/scheduledRound.ts`, run by `netlify/functions/concierge-dispatch.ts`, with two halves isolated by `Promise.allSettled`:
    - (1) the approved PostgreSQL outbox, unchanged;
    - (2) new `runRetries()` in `netlify/concierge/dispatch.ts`: the retry half of the legacy round only, live and rehearsal, with rehearsal never contacting a channel.
  - Legacy scheduled messages to Alise are no longer sent automatically by anything.
  - `runDispatch` is retained (tests and local) and now delegates its retries to `runRetries`.
  - The legacy store follows `CONCIERGE_LEGACY_STORAGE` exactly as `/api/*` does. Shopping (`live/shopping/privilege`) is outside the retry scan.
  - `/concierge/owner`: the Messages intro now says nothing sends on its own and points to `/owner`; rows read "Planned for … · not sent automatically"; the inert automatic-send toggle was removed. Manual Send now, Copy and I sent it myself are unchanged.
  - Found while verifying: the vault ceremony was timed in clamped frame steps, so on a slow renderer it could stretch past 15 s, and intermittently it never reached the letter. It is now wall-clock timed (about 7.4 s on any device), with a 12 s watchdog that shows the letter regardless (the server has already opened the compartment).
- **Created/modified:**
  - created: `netlify/backend/scheduledRound.ts`, `netlify/backend/scheduledRound.test.ts`;
  - modified: `netlify/concierge/dispatch.ts`, `netlify/functions/concierge-dispatch.ts`, `src/features/concierge/owner/OwnerConsole.tsx`, `src/features/vault/scene/VaultScene.ts`, `src/features/vault/ui/GiftVault.tsx`, `docs/BACKEND_OPERATIONS.md`, `TASKS.md`, `BUILD_LOG.md`.
- **Checks/results:**
  - `npm run check` PASS: 542 tests (5 new round tests: a retry still delivers after the backoff; a due legacy Departure message is NOT sent, with no dispatch record; Shopping's record is byte-identical before and after; rehearsal retries contact no channel; each half survives the other failing). The 59 existing concierge tests pass, including `runDispatch` retry, give-up and resend.
  - Office/vault Playwright: 16 of 17 runs passed after the ceremony fix. One run failed with an unusually long duration and could not be reproduced in 12 further runs; before the fix the stall recurred in about 2 of 6 runs.
  - `npx playwright test --workers=1` PASS 32.
  - `npm run functions:build` PASS (the new round is in `concierge-dispatch`, every minute).
  - The rendered `/concierge/owner` was checked headlessly against the local concierge API: new wording present, toggle count 0.
- **Known issues / owner decisions:**
  - Choose, per travel moment, either the approved PostgreSQL SMS (direct to Alise from THIRTYCLUB) or a manual send from the legacy console (to Arron to forward), never both.
  - Legacy `unconfigured` notifications will be delivered by the retry round once Telegram is configured, as before.
  - The ceremony fix exists on this integration branch only, not on `feature/gift-vault`.
- **Remaining work:** GV11 release steps, GV08, GV07, GV09.
- **Commit:** this commit on `integration/gift-vault-backend` (not pushed).

## 2026-10-18 23:36 BST (Europe/London) — Codex — Release candidate consolidation and audit

- **Task:** Audit all branches/worktrees and prepare an isolated, locally verified release candidate without changing production or Opus's Correspondence work.
- **Summary:** Confirmed GitHub `main` at `277eaa7` through the GitHub API. Audited seven local branches, three GitHub branches, five existing worktrees and an older local clone. Created a separate clone in this task's writable workspace and fast-forwarded `codex/release-candidate-2026-10-18` from `277eaa7` to committed integration `bccce30`. No merge conflicts. Backend and Gift Vault feature commits are already ancestors; the separate Shopping feature is superseded by production; divergent local `main` desk work is excluded. The active Correspondence branch/worktree was not modified. Shopping's six key code/storage files have identical Git blob IDs to production and the legacy adapter still defaults to Netlify Blobs.
- **Created/modified files:** `docs/RELEASE_CANDIDATE_2026-10-18.md` (inventory, risks, Correspondence procedure, release checklist); `TASKS.md` (RC01–RC04); `ARCHITECTURE.md` (release integration questions); `BUILD_LOG.md` (this entry). Only this isolated candidate worktree was edited. Build outputs and copied dependencies are ignored.
- **Checks/results:** `npm run check` PASS: TypeScript, ESLint, formatting, 542 unit/integration tests in 44 files, production/PWA build. Netlify CLI 27.13.0's underlying `zipFunctions` bundler PASS: `api.zip` and `concierge-dispatch.zip`, schedule `* * * * *`; the CLI wrapper itself was blocked from writing a global preference file by the sandbox. Production Playwright Chromium PASS 32/32; phone-sized owner/Gift Vault Chromium PASS 5/5; iPhone-profile WebKit PASS 6/6. Browser tests used fake channels/local embedded PostgreSQL and did not contact Twilio or Telegram. Hosted Supabase read-only check found six backend migrations applied, vault migration absent, and zero security advisor findings. The exact-lockfile `node_modules` was copied from the clean integration worktree because offline `npm ci` lacked cached tarballs.
- **Known issues:** One previously reported intermittent owner/vault run (16/17 repeated passes) remains unexplained; this task's 5/5 pass does not prove it fixed. The legacy scheduled Departure messages are intentionally no longer automatic; Arron must choose their delivery path. The Casino frontend does not yet call the authoritative play API. The hosted vault migration, live Blobs Shopping readback, real iPhone/NFC rehearsal, and production provider checks remain outstanding. `SMS_SENDING_ENABLED=false` gates the new outbox only, not existing direct Shopping/legacy manual actions.
- **Remaining work:** Obtain Arron's approvals and private Netlify/Supabase configuration, integrate Correspondence only after a clean committed handoff, run the full final gates, apply approved hosted migrations, merge/release through GitHub, and perform read-only production checks before any explicitly approved real messaging. Exact sequence is in the release report. No branch was pushed, no production environment changed, no hosted migration applied, and no real message sent.
- **Relevant commits:** production `277eaa75692492117d3cde5b80dae5d0b049e236`; integrated candidate source `bccce307abac043f9cc9ebbf9778fa6ffc00aed9`. Documentation commit: `9bea495391fb375df3926a31fe82077b583339d6`.

## 2026-10-19 00:06 BST (Europe/London) — Claude (Opus 5.5) — The Correspondence Desk (ADR-016)

- **Task:** An owner-controlled correspondence service: Arron writes, schedules and sends letters from `/owner`; the Butler publishes them, sends the invitation SMS, answers thanks and passes Alise's messages to Arron.
- **Isolation:** New worktree `../the-thirty-club-correspondence`, branch `feature/correspondence-desk`, from `integration/gift-vault-backend` `bccce30`. The integration worktree and the original checkout (including its uncommitted `/api/desk` work) were not modified. `node_modules` is an APFS clone of the integration worktree's (identical lockfile) because the disk had 2.2 GB free.
- **Summary:**
  - Migration `20261020090000_correspondence_desk.sql`: `ttc_letters`, `ttc_letter_replies` and a separate RPC `ttc_correspondence_action`, plus a widened `ttc_messages.category` CHECK (`correspondence-alise`, `correspondence-arron`). RLS, service-only grants and policies.
  - Publication runs inside the existing every-minute round, before the outbox (`FOR UPDATE SKIP LOCKED`), and lazily on any correspondence read. It queues the invitation in the same transaction, chosen by the delivery hour in the letter's zone (morning, afternoon, evening or night).
  - Thanks are recorded once and queue one reply SMS to Alise. Her messages are stored and queue a notification to Arron in the agreed format. Limits: idempotency keys, an identical message within 10 minutes counts once, 5 per 10 minutes, 40 per day.
  - Every SMS is an approved outbox message, still gated by `SMS_SENDING_ENABLED`. Unsent SMS to Alise expire to `failed` after six hours. An invitation not yet sent when she opens the letter is cancelled. Owner retry only from `failed` or `cancelled`. `recipientFor` maps categories to phones explicitly.
  - Owner Console tab _correspondence_: compose, edit, delete draft, preview (real presentation, inert), schedule with London/Jamaica (UTC storage, UK equivalent shown, template named), Send now and delete with inline confirmations, cancel delivery, delivery and SMS history, and the inbox of Alise's messages. Membership tab: _Copy correspondence link_ (one-time `/correspondence#invitation=`).
  - Member: `/correspondence` collection and `/correspondence/:id` letter (envelope, splitting wax seal, flap and sheet, laid paper, drop cap, reduced-motion cross-fade). ✉️ Thank the Butler and 🎩 Butler, A Word. The Butler's arrival notice appears at the locked entrance and in the lounge after induction (singular and plural; Later per session). The pages are outside RoomGate and write no club record.
- **Decision found during verification:** the Desk does **not** offer the membership-card prompt (as Shopping does). Presenting the card before 24 October records it on the server, and the entrance would then skip the birthday card ceremony. Identity is the v1 cookie, the existing live-concierge bridge, or Arron's one-time introduction link.
- **Created:** `supabase/migrations/20261020090000_correspondence_desk.sql`, `netlify/backend/correspondence.ts`, `netlify/backend/correspondence.test.ts`, `src/shared/correspondence/templates.ts`, `src/features/correspondence/**` (client, domain, ui, test), `src/features/butlers-office/{CorrespondenceDesk.tsx,deskText.ts,desk.css}`, `tests/correspondence.spec.ts`, `playwright.correspondence.config.ts`, `docs/CORRESPONDENCE_DESK.md`.
- **Modified:**
  - backend: `netlify/backend/{api,database,sms,scheduledRound}.ts`, `netlify/functions/concierge-dispatch.ts`, `build/butlersOfficeLocalApi.ts` (local-only `__local/correspondence-due`);
  - frontend: `src/shared/concierge/types.ts`, `src/app/App.tsx`, `src/features/butlers-office/ButlersOffice.tsx`, `src/features/entrance/ui/Facade.tsx`, `src/features/lounge/ui/Lounge.tsx`;
  - tooling: `package.json` (`test:correspondence`), `playwright.config.ts` (ignore the new spec);
  - docs: `ARCHITECTURE.md`, `TASKS.md`, `docs/CONCIERGE_API_CONTRACT.md`, `docs/BACKEND_OPERATIONS.md`.
- **Checks/results:**
  - `npm run check` PASS: strict types, ESLint, Prettier, **578 tests in 46 files** (28 new backend tests on PGlite with every real migration, 8 new component/unit tests; all existing database, vault, round, concierge and Shopping suites pass), production build.
  - `npx playwright test -c playwright.correspondence.config.ts` PASS 3: the full owner → member → owner journey with SMS off; the entrance notice and Later; a refused reused introduction, no card entry, 401 for a stranger.
  - `npx playwright test -c playwright.office.config.ts` PASS 5 (existing office and vault).
  - `npx playwright test --workers=1` PASS 32 production regressions.
  - `npm run functions:build` PASS: `api` and `concierge-dispatch` (every minute) both contain the Desk code.
  - Visual review of 390×844 captures: envelope, mid-opening, letter, replies, owner desk and inbox, entrance notice.
- **Known issues:**
  - The office login rate limit (8 per 15 minutes per address, shared by owner and member sign-ins) made the Desk spec collide with the vault spec on one local server. It now has its own config and server.
  - No real SMS was sent or tested; Twilio is faked in tests. No iPhone, Safari or installed-PWA run.
  - The six-hour expiry, limits, default salutation and Butler lines await owner approval.
- **Remaining work:** CD04 (apply the migration after the Gift Vault one, merge after the backend release, deploy), CD05 (authorised controlled SMS exchange), CD06 (iPhone rehearsal; send the introduction link), CD07 (copy approval).
- **Commit:** `a3f8a1b2f6918179418e8cf2bd75092856c3b350` on `feature/correspondence-desk` (not pushed; integrated only into the isolated local release candidate).

## 2026-10-19 00:47 BST (Europe/London) — Codex — Consolidated Correspondence release candidate

- **Task:** Integrate the completed Correspondence Desk into a new isolated candidate, verify the combined Vault/Correspondence upgrade and release gates, and prepare production steps without changing hosted state.
- **Summary:** Reconfirmed GitHub `main` at `277eaa7`; verified Correspondence `a3f8a1b` is one commit above integration `bccce30` and prior candidate `9bea495` also descends from that base. Reviewed the 38-file feature diff, including permission, scheduler, SMS, member and owner flows. Created `codex/release-candidate-correspondence-2026-10-19` in this task's workspace and merged the completed feature as `2dc6fe2`. Only `ARCHITECTURE.md`, `TASKS.md` and `BUILD_LOG.md` conflicted; both histories were retained. The divergent local `main` Desk work was excluded. Shopping code/storage files are identical to production, and the legacy API still selects Netlify Blobs by default. No production or source worktree was edited.
- **Created/modified:** Added `tools/verify-release-migrations.mjs` and `docs/RELEASE_CANDIDATE_2026-10-19.md`; updated `playwright.config.ts` to one worker for software-rendered 3D stability, `docs/BACKEND_OPERATIONS.md` for the combined order, and this task/architecture record. No product implementation or SQL was changed after the feature merge.
- **Checks/results:** `npm run check` passed TypeScript, ESLint, Prettier, 578 tests in 46 files and production/PWA build. Disposable PGlite upgrade passed all eight migrations in order, preserved five existing outbox rows, verified the widened category constraint, RLS and service-only grants/policies on all three release tables and 13 functions; anonymous RPC execution was denied and both feature RPCs passed as `service_role`. Correspondence browser passed 3/3 phone-sized Chromium and 3/3 iPhone-profile WebKit. Owner/Vault browser passed 5/5. iPhone-profile entrance WebKit passed 6/6. Pinned Netlify Functions bundler produced API and every-minute dispatcher ZIPs, inspected for Correspondence publication, SMS gate and Blobs selector. The first `npm run test:pwa` ran five software-rendered browser workers and timed out in the lounge handoff and projected-clock gesture (30/32); full serial diagnostic passed 32/32. With `workers: 1` set in the candidate config, the named `npm run test:pwa` passed 32/32. Hosted read-only Supabase check still showed only six baseline migrations and no security advisor findings.
- **Known issues:** The prior Owner/Vault suite had one unexplained failure in 17 repeated runs; this task's 5/5 pass does not establish its root cause. Five-worker software-rendered 3D browser contention required the one-worker release gate. Actual iPhone Safari/PWA, real NFC, hosted Shopping redeemed-state readback, and approved real Twilio delivery remain untested. The Casino frontend still does not call the authoritative server play API. Legacy travel announcements are no longer automatic, and queued messages must be reviewed before any SMS switch is enabled. The Netlify CLI wrapper was not run because it writes a global preferences file outside this isolated worktree; its pinned underlying Functions bundler passed.
- **Remaining work:** Arron's approval of copy, scheduling/expiry limits and legacy travel delivery path; private service-role environment verification; hosted Vault then Correspondence migrations; reviewed GitHub PR/merge and Netlify deploy; read-only Shopping/Owner/Correspondence smoke; physical iPhone, PWA and NFC rehearsal; and separately approved controlled SMS exchange. The exact sequence and rollback are in `docs/RELEASE_CANDIDATE_2026-10-19.md`.
- **Relevant commits:** production `277eaa75692492117d3cde5b80dae5d0b049e236`; integration `bccce307abac043f9cc9ebbf9778fa6ffc00aed9`; prior candidate `9bea495391fb375df3926a31fe82077b583339d6`; Correspondence `a3f8a1b2f6918179418e8cf2bd75092856c3b350`; local merge `2dc6fe22b4955aa6dca423fc0d21c4cbb45ffd6e`. Verification documentation commit SHA is unavailable until this entry is committed.

## 2026-10-19 02:40 BST (Europe/London) — Claude (Opus 5.5) — The Butler's Service (ADR-017)

- **Task:** Make the Butler's service real for Alise, Arron and rehearsal: letters at the locked doors, a working service bell, a translucent correspondence collection, thanks and requests; Arron's direct SMS and request responses in `/owner`; full Dev Mode rehearsal; Departure Lounge access and directory entry.
- **Isolation:** New worktree `/Users/ag14/Documents/ChatGPT/30club/butlers-service-2026-10-19`, branch `feature/butlers-service-2026-10-19`, from the consolidated candidate `877fbb8` (found in the `release-candidate-2026-10-18` repository, not the `Projects/the-thirty-club` clone). The candidate, original `main` checkout (and its uncommitted `/api/desk` work) and other worktrees were not modified.
- **Summary:**
  - Backend: migration `20261021090000_butlers_service.sql` and separate RPC `ttc_service_action`. Bell requests reuse `ttc_letter_replies` (`letter_id` nullable, new `resolved_at`) with the Desk's idempotency and limits; `ttc_request_responses` links SMS or Desk letters; `ttc_direct_messages` lists direct Butler SMS. All SMS are approved messages in existing categories, gated by `SMS_SENDING_ENABLED`; cancel only before claim, retry only after failure/cancellation. Routes in `netlify/backend/service.ts`.
  - Member: `src/features/butler-service/` — envelope for the newest unread letter at the doors, one greeting per letter through the bell's speech area once the entrance settles, the existing letter animation in a translucent overlay (doors or lounge visible), Thank You, Butler closes and he answers in the room, both existing bells open one menu, shared request composer with truthful acknowledgement, Butler's invitation to the Departure Lounge. Six moments × six lines, never repeated back to back. The old arrival notice was removed.
  - Owner: Messages → Write to Alise (send now / schedule London or Jamaica, exact preview, history and states, cancel, send again, SMS-off banner); new Requests tab (reply by SMS, write and deliver a Desk letter, resolve/reopen, notification status).
  - Dev Mode: simulated letters/requests in owner session storage with no network calls; every line listed; Dev disc moved top-left, clear of the lounge heading.
  - Navigation: `departure-lounge` registry entry (always open, never recommended) so the Members' Directory lists it.
- **Created:** `supabase/migrations/20261021090000_butlers_service.sql`, `netlify/backend/service.ts`, `netlify/backend/service.test.ts`, `src/features/butler-service/**`, `src/features/butlers-office/{ButlerSmsDesk.tsx,RequestsDesk.tsx,serviceApi.ts}`, `tests/butler-service.spec.ts`, `playwright.butler.config.ts`, `docs/BUTLERS_SERVICE.md`, `docs/butlers-service/screenshots/*.jpg`.
- **Modified:** `netlify/backend/{api,database}.ts`; `src/shared/concierge/types.ts`, `src/shared/correspondence/templates.ts`; `src/features/entrance/ui/{Facade,ServiceBell}.tsx`; `src/features/lounge/ui/Lounge.tsx`; `src/features/correspondence/ui/{LetterPresentation,CorrespondenceRoom}.tsx`, `correspondence.css`, `domain/butlerLines.ts`; `src/features/butlers-office/{ButlersOffice.tsx,desk.css}`; `src/features/owner/{OwnerAccess.tsx,owner.css}`; `src/features/club/domain/rooms.ts`; tests (`App.test.tsx`, `club.test.ts`, `Lounge.test.tsx`, `correspondence.test.tsx`, `tests/{correspondence,owner,entrance-poster}.spec.ts`); `tools/verify-release-migrations.mjs` (now nine migrations); `package.json` (`test:butler`); `playwright.config.ts`; `.claude/launch.json`; `ARCHITECTURE.md`, `TASKS.md`, `docs/CORRESPONDENCE_DESK.md`. Deleted `CorrespondenceNotice.tsx`, `noticeSlot.tsx`, `notice.css`.
- **Checks/results:**
  - `npm run check` PASS: strict types, ESLint, Prettier, **594 tests in 48 files** (9 new backend tests on PGlite with every real migration and mocked Twilio; 7 new unit tests), production build.
  - `node tools/verify-release-migrations.mjs` PASS: all nine migrations in order, existing outbox rows and letter replies preserved, RLS and service-only policies on five release tables, 17 restricted functions, anonymous RPC execution denied for Correspondence and Service.
  - `npx playwright test -c playwright.butler.config.ts` PASS 7/7 (Chromium iPhone profile) and PASS 7/7 with `--browser=webkit`: letter at the locked doors → greeting → seal → thanks → acknowledgement (one thanks SMS, queued); bell → menu → request → acknowledgement → owner inbox; owner SMS scheduled 10:00 Jamaica → cancelled → send now queued with SMS off; request → SMS reply → letter reply delivered → resolved → envelope at the doors; 3D entrance greeting on screen at 390×844 and 390×664; Departure Lounge and back with doors locked; Dev Mode rehearsal with zero correspondence/service network calls and unchanged server records, collection over the lounge, directory.
  - `npx playwright test` PASS 32/32; correspondence PASS 3/3; office PASS 5/5 (after restoring the "Scheduled correspondence" heading I had renamed); WebKit entrance PASS 6/6.
  - Screenshot review at 390×844/664 led to fixes: overlay rows lacked paper styling (CSS variable scope), title/close-button crowding, too-dark veil, greeting below the fold in the poster fallback (now scrolled into view) and during the 3D fade-in (now waits), plinth covering the timepiece and the 3D bell caption (compact row, letter left of the bell), "send now" shown as scheduled (clock skew).
- **Known issues:** No physical iPhone, Safari or installed-PWA run; no real SMS. The Departure Lounge keeps its own Thursday 22 October 14:00 UK opening and travel credential. On a phone over plain-HTTP LAN the local API's `Secure` cookie is refused, so sign-in previews need localhost or a hosted preview. `npm run functions:build` was not run (the Netlify CLI writes global preferences outside the worktree). Copy awaits owner approval.
- **Remaining work:** BS09 (hosted migration after `20261020090000`, merge, deploy), BS10 (iPhone rehearsal), BS11 (authorised SMS exchange), BS12 (copy approval), BS13 (future panoramic lounge, not started).
- **Commit:** recorded in the final report; this entry is committed with the work on `feature/butlers-service-2026-10-19` (not pushed).

## 2026-10-19 09:20 BST (Europe/London) — Claude (Opus 5.5) — Owner Control Centre, universal rehearsal engine, production polish (ADR-018)

- **Task:** One Owner Control Centre (LIVE / TEST), a rehearsal engine for every room and timed event, the Dev Menu as a rehearsal launcher, fixes for the Gift Vault rehearsal, the entrance letter lifecycle, the locked-Casino invitation and iPhone layout, and an owner-password process.
- **Isolation:** New worktree `../the-thirty-club-control`, branch `feature/owner-control-centre`, from production `1a3be938d538c718314018a76fe406dc99bcd27d`. The original checkout, its uncommitted work and other worktrees were not touched (node_modules is an APFS clone of the integration worktree's identical lockfile).
- **Summary:**
  - `/concierge/owner` is the canonical Control Centre: LIVE = existing Butler's Office (all tabs) + existing Concierge console, with existing server auth; `/owner` redirects (`?tab=` kept). TEST = `/concierge/owner/test`: the same consoles plus Rehearsal.
  - Rehearsal pages answer their own `/api/` calls: the real `netlify/backend` and `netlify/concierge` handlers with all nine real migrations in PGlite (IndexedDB), `now()` rewritten to follow one rehearsal clock, auto-signed simulated sessions in tab storage, fake providers, provider hosts blocked, fail-closed. Browser-only aliases for `node:crypto`/`node:util` and a ceiling-free Shopping stub (`build/rehearsalShims.ts`).
  - Rehearsal clock, timeline (fixed + scheduled-in-office), 11 scenarios, manual triggers, room launches that satisfy real prerequisites, per-room and full reset, simulated notification log, rehearsal codes.
  - Dev Menu rewritten as the launcher; amber hazard indicator; LIVE pages in a Dev tab are marked LIVE.
  - Fixes: step letter read lifecycle + "From the concierge" in My Correspondence; room-aware letter invitations; rehearsal vault (seeded compartments, simulated key); Dev disc/back-link and Casino test-controls overlaps; read-only Shopping state in the owner overview.
  - `npm run owner:set-password` (local scrypt hash → Netlify secret → redeploy).
- **Created:** `src/features/rehearsal/**`, `src/features/control-centre/**`, `src/features/concierge/client/stepLetters.ts`, `src/features/correspondence/{ui/RoomInvitations.tsx,domain/roomMentions.ts}`, `src/features/butlers-office/tabs.ts`, `build/rehearsalShims.ts`, `tools/set-owner-password.mjs`, `netlify/backend/ownerPasswordTool.test.ts`, `tests/rehearsal.spec.ts`, `playwright.rehearsal.config.ts`, `docs/REHEARSAL.md`, `docs/rehearsal/screenshots/**`.
- **Modified:** `src/app/App.tsx`, `src/main.tsx`, `vite.config.ts`, `package.json`, `playwright.config.ts`, `netlify/concierge/api.ts` (read-only `shopping` in owner overview), owner/entrance/butler-service/butlers-office/concierge/correspondence/vault/casino files listed in the commit, tests (`owner`, `butler-service`, `concierge` specs; `Entrance`, `butlerService` unit tests), `ARCHITECTURE.md`, `TASKS.md`, `docs/OWNER_ACCESS.md`, Butler's Service screenshots (regenerated).
- **Checks/results:**
  - `npm run check` PASS: strict types, ESLint, Prettier, **603 tests in 50 files**, production build. Main bundle +5 KB gzip; PGlite in `rehearsal-*` chunks excluded from the PWA precache (80 entries, 2.28 MB).
  - Production Playwright (`--workers=1`) PASS 32/32 (incl. offline PWA and rewritten owner tests).
  - Rehearsal journeys (`playwright.rehearsal.config.ts`) PASS 9/9 Chromium iPhone 13 and PASS 9/9 WebKit iPhone 13 (one earlier WebKit run failed 3/9 on 5 s waits under load; waits widened to 30 s, rerun green). Every TEST/rehearsal journey asserts zero requests reach the server.
  - Office 5/5, Correspondence 3/3, Butler 7/7, WebKit entrance 6/6 PASS.
  - `npm run functions:build` PASS: `api` (real Shopping with ceiling, no rehearsal code) and `concierge-dispatch`.
  - Build grep: no Shopping ceiling in any browser asset.
- **Known issues:** No physical iPhone run; PGlite (~5 MB compressed) first load and memory on a real phone unmeasured. Owner password not changed (needs Arron's choice). Travel-credential variables not visible in Netlify. Privileges room not built. Casino slots remain local; the jackpot → vault link is rehearsed only.
- **Remaining work:** OC08 run by Arron, OC09 iPhone rehearsal, OC10 default-section decision; existing CD/BS/GV items unchanged.
- **Commit:** recorded in the sprint report (this entry is committed with the work).

## 2026-10-19 09:25 BST (Europe/London) — Claude (Opus 5.5) — ADR-018 release and production smoke

- **Task:** Release `feature/owner-control-centre` and verify production read-only.
- **Summary:** GitHub `main` fast-forwarded `1a3be93 → f041b23` (no force). Netlify deploy `6ad5cffd88e13a25c89f5fc3` built and published `f041b230c89b28adf0793a91201a47d88b2434c2` at 08:09 UTC.
- **Checks/results (production, read-only):** `GET /api/v1/auth/session` unsigned → 401 JSON. PGlite WebAssembly served `200 application/wasm`, immutable. Concierge owner overview (owner key, GET only): `shopping` = awaiting settlement, £100.00, i.e. the redeemed Shopping Privilege is intact; live legacy redemptions 0. Netlify environment (names only): `SMS_SENDING_ENABLED=false`, `CONCIERGE_LEGACY_STORAGE` absent. WebKit iPhone 13 smoke against https://30.ag14.co PASS: guest entrance locked with no Dev disc; PIN → TEST boots the simulated office from production; rehearsal letter delivered; Gift Vault launch shows 3 rehearsal compartments; letter at the doors; **zero `/api/` requests** from rehearsal pages; `/owner` → LIVE sign-in which calls the real `GET /api/v1/auth/session`; Exit Dev Mode. Screenshots: `docs/rehearsal/screenshots/production/`.
- **Known issues:** Alise's device will show the concierge's step letter once more as unread (opened state is newly tracked) until she opens it. Google Drive upload of the handover documents failed: the Drive connector requires re-authentication.
- **Commit:** this documentation commit follows `f041b23`.

## 2026-10-19 21:36 BST (Europe/London) — Claude (Opus 5.5) — The birthday screening (ADR-019)

- **Task:** Final Private Screening Room experience: the Butler's escort from the Lounge, one continuous birthday film in the native player, natural end and early exit, returning visits, LIVE protection until the real film is supplied, rehearsal through Dev Mode / TEST, a real five-second test MP4.
- **Isolation:** New worktree `../the-thirty-club-screening`, branch `feature/screening-final`, from production `origin/main` `b36a3a7`. The original checkout (divergent local `main` with another agent's uncommitted desk work) and the other worktrees were not touched.
- **Summary:**
  - One configuration point `src/features/screening/config/screeningFilm.ts`: `BIRTHDAY_FILM = null` (LIVE shows the poster and "Your screening is being prepared.", no control, no video), `TEST_FILM` for rehearsal pages and the dev server only, labelled on screen.
  - Real test film `public/media/screening/screening-test-5s.mp4`: H.264 Main 1280×720 30 fps + AAC mono, 5.000 s, 147 KB, fast start; countdown, progress rule, "TEMPORARY TEST FILM · NOT THE BIRTHDAY SCREENING", a chime each second. Generator `tools/create-screening-test-film.swift` (AVFoundation, no dependency).
  - Room rewritten around one film: poster on the existing photographic screen, Butler's introduction / welcome back / closing / encore / kept-place lines, Watch Movie calling `play()` then fullscreen synchronously in the tap, `<video controls>` without `playsinline` (iPhone native player), theatre fallback, push-in and settle-back CSS, dark fade-in. Early exit, refresh, unmount, errors and the iOS end race all return to the seat; completion counted once per playback and stamped in the club record.
  - Record `thirty-club:screening` v2 (entered, introduced, plays, completed, completions, resume per film).
  - Lounge escort: Butler's line, new `escort` camera shot, fade to black, room prefetch (`club/ui/roomViews.ts`), navigation at 2.3 s; dark room-loading fallback.
  - Rehearsal: launch `screening-journey` (fresh first visit from the Lounge); `resetRoom('screening-room')` also clears the room's visit/completion stamps.
  - Retired the message collection (`ScreenPlayer`, `MessageList`, `EntranceFilm`, `videoMessages`, `progress`, `premiere.css`), the synthetic fixtures and their dev middleware, `tests/screening.dev.spec.ts`, obsolete captures.
- **Created:** `src/features/screening/config/screeningFilm.ts`, `src/features/screening/domain/{screeningRecord,screeningScript}.ts`, `screeningRecord.test.ts`, `src/features/screening/ui/filmPresentation.ts`, `src/features/club/ui/roomViews.ts`, `public/media/screening/screening-test-5s.mp4`, `tools/create-screening-test-film.swift`, `tests/screening-film.spec.ts`, `docs/screening/journey/*.jpg`.
- **Modified:** `src/features/screening/ui/{ScreeningRoom.tsx,ScreeningRoom.test.tsx,screening.css,cinemaConfig.ts}`, `screening/preview/ScreeningPreview.tsx`, `src/features/lounge/{ui/Lounge.tsx,ui/lounge.css,ui/LoungeBuiltRoom.test.tsx,scene/loungeMath.ts}`, `src/features/club/{domain/loungeScript.ts,ui/RoomGate.tsx,ui/RoomGate.test.tsx,ui/roomGate.css}`, `src/features/rehearsal/engine.ts`, `src/dev/devLinks.ts`, `vite.config.ts`, `playwright.config.ts`, `playwright.screening.config.ts`, `package.json` (`test:screening`), `tests/screening.spec.ts`, `tools/capture-screening.mjs`, `docs/SCREENING_ROOM_IMPLEMENTATION.md`, `docs/REHEARSAL.md`, `docs/OWNER_ACCESS.md`, `docs/rehearsal/screenshots/14-screening.jpg`, `ARCHITECTURE.md` (ADR-019), `PROJECT.md`, `TASKS.md` (SR01–SR10).
- **Checks/results:**
  - `npm run check` PASS: strict types, ESLint, Prettier, **602 tests in 48 files**, production build (precache 82 entries, 2.27 MB; no `.mp4`).
  - Production Playwright (`npx playwright test`, 1 worker) PASS **32/32**, including the updated `screening.spec.ts` (LIVE gate, unconfigured state, Directory → escort, previews stripped, MP4 `206` byte ranges, not precached).
  - `playwright.screening.config.ts` (production build, iPhone 13 profile) PASS **4/4 Chromium** and **4/4 WebKit**: full journey with the real MP4 (escort 2–4.5 s, introduction, Watch Movie geometry, real playback 1280×720 unmuted with native controls, natural end, closing words, club completion, encore, returning welcome, zero `/api/` requests, guest localStorage untouched); early exit + refresh + resume + restart without false completion; LIVE locked before midnight and unconfigured after; phone landscape. In WebKit the theatre fallback was used (headless WebKit did not enter element fullscreen).
  - Rehearsal journeys PASS 9/9 (Chromium iPhone 13). WebKit entrance PASS 6/6.
  - 3D escort camera checked by eye once in software-rendered Chromium.
- **Known issues:** No physical iPhone: native fullscreen player, auto-close at the end, Done, audio with the ringer switch and rotation are unverified (manual steps in the handover doc). The birthday film is not supplied; hosting above ~95 MB needs an external HTTPS host with byte ranges, and committing a private film needs the owner's decision. Poster wording and Butler lines are provisional.
- **Remaining work:** SR08 (owner supplies and configures the film), SR09 (iPhone rehearsal), SR10 (copy approval).
- **Commit:** `9529e112eb441734355468afeca88df757cff00d`.

## 2026-10-19 21:45 BST (Europe/London) — Claude (Opus 5.5) — ADR-019 release and production smoke

- **Task:** Release the birthday screening and smoke-test production.
- **Summary:** GitHub `main` fast-forwarded `b36a3a7 → 9529e11` (no force); branch `feature/screening-final` pushed. Netlify deploy `6ad67faef110ed512a458826` built and published commit `9529e11` at 20:38:39 UTC on https://30.ag14.co.
- **Checks/results (production):** `GET /media/screening/screening-test-5s.mp4` with a range → `206`, `video/mp4`, `bytes 0-1/146746`; `sw.js` contains no `.mp4`. `tests/screening-film.spec.ts` against https://30.ag14.co (iPhone 13 profile) PASS **4/4 WebKit** and **4/4 Chromium**: Dev Mode → Screening Room journey → escort → introduction → real five-second film to its end → closing words → encore → returning welcome, with zero `/api/` requests and the browser's guest records untouched; early exit, refresh, resume and restart; LIVE locked before midnight and "being prepared" after (simulated in the test browser only); landscape. Screenshots `docs/screening/journey/production/`. No file under `netlify/`, `supabase/`, Shopping, Casino or Vault changed in this release; production credentials, `SMS_SENDING_ENABLED` and LIVE data were not touched.
- **Known issues:** as in the entry above: no physical iPhone run; birthday film not configured.
- **Commit:** this documentation commit follows `9529e11`.

## 2026-10-20 00:17 BST (Europe/London) — Claude (Opus 5.5) — The birthday journey: admissions, milestones, Butler delivery (ADR-020)

- **Task:** Central orchestration for the birthday: one persistent room-admission lifecycle (LOCKED → INVITED → ADMITTED) enforced in routing, the Butler's delivery of admission summonses and return invitations, an authoritative milestone engine in Jamaica time, Owner Control Centre controls, and an integration contract for the Casino/rewards work running in parallel (Codex).
- **Isolation:** New worktree `../the-thirty-club-journey`, branch `feature/birthday-journey`, from production `origin/main` `54b9cf2` (the verified baseline; the original checkout's local `main` is 26 commits behind with another agent's uncommitted desk work, untouched). No other worktree, LIVE data, provider or Netlify setting was touched. Not merged, pushed or deployed.
- **Contract first:** `docs/BIRTHDAY_JOURNEY_INTEGRATION_CONTRACT.md` + `src/shared/journey/{contract,templates}.ts`, committed alone as `586191b` for hand-off to Codex.
- **Summary:**
  - Migration `20261022090000_birthday_journey.sql` (additive): `ttc_room_admissions`, `ttc_journey_milestones` (seeded with `on conflict do nothing`), `ttc_journey_events` (unique source + key), nullable `journey_ref`/`action_*` on `ttc_letters`, redefined letter JSON functions (adds `action`), RPC `ttc_journey_action`, `ttc_journey_publish` (transactional publishing for other systems), `ttc_room_admitted` (server guard), `ttc_journey_hook` call point, RLS/service-only grants.
  - Server: `netlify/backend/journey.ts` (member/owner routes, `publishJourneyEvent`, `runJourneyRound`); the every-minute round fires due milestones first; the rehearsal office runs the same round.
  - Device: `JourneyProvider` (reads when consulted; caches only confirmed admissions), `AdmissionGate` in `RoomGate` and keyless `/vault`, `/lounge` route, Letter of Admission in the Lounge with escort, ENTER/RETURN buttons on journey letters, Directory/3D labels/room mentions/Butler copy never name an unadmitted room.
  - Owner: Butler's Office → journey (timeline, trigger/hold/resume/retry/change time, introduce/withdraw, letters + SMS retry, events + retry, history).
  - Rehearsal: launches and scenarios admit through the real actions on the destination page; new early-membership and Casino ceremony rehearsals; Screening Room journey starts with its Letter of Admission.
- **Created:** `supabase/migrations/20261022090000_birthday_journey.sql`, `netlify/backend/journey.ts`, `netlify/backend/journey.test.ts`, `src/shared/journey/contract.ts`, `src/shared/journey/templates.ts`, `src/features/journey/**` (provider, context, access domain, API client, AdmissionGate, AdmissionLetter, LetterActionButton, CSS, tests), `src/features/lounge/ui/LoungeRoute.tsx`, `src/features/butlers-office/JourneyOffice.tsx`, `tests/journey.spec.ts`, `docs/BIRTHDAY_JOURNEY.md`, `docs/BIRTHDAY_JOURNEY_INTEGRATION_CONTRACT.md`, `docs/journey/screenshots/*.jpg`.
- **Modified:** `netlify/backend/{api,database,scheduledRound}.ts`, `netlify/functions/concierge-dispatch.ts`, `src/app/App.tsx`, `src/shared/concierge/types.ts`, `src/features/club/{domain/clubState,domain/loungeScript,useClub,ui/RoomGate}.ts(x)`, `src/features/lounge/ui/Lounge.tsx`, `src/features/correspondence/ui/{LetterPresentation,RoomInvitations}.tsx`, `src/features/vault/ui/VaultRoutes.tsx`, `src/features/butlers-office/{ButlersOffice.tsx,tabs.ts,office.css}`, `src/features/rehearsal/{engine,office}.ts`, `src/features/rehearsal/sim/v1.ts`, `src/features/control-centre/RehearsalDesk.tsx`, `src/features/rehearsal/rehearsal.test.ts`, specs (`casino`, `entrance-poster`, `lounge`, `owner`, `pwa`, `rehearsal`, `screening`, `screening-film`), `playwright.config.ts`, `playwright.rehearsal.config.ts`, `ARCHITECTURE.md` (ADR-020), `PROJECT.md`, `TASKS.md` (BJ01–BJ17), `docs/REHEARSAL.md`, `docs/CONCIERGE_API_CONTRACT.md`, `docs/SCREENING_ROOM_IMPLEMENTATION.md`.
- **Checks/results (local, this worktree):**
  - Strict types, ESLint and Prettier PASS. Vitest **647 tests in 50 files** PASS, including 25 new PGlite tests with every real migration (`journey.test.ts`) and 20 new client tests (`journey.test.tsx`): locked room absent and refused; persistent letter; invited still hidden; acceptance admits once (also concurrently); admitted listed and deep-linkable; spins → RETURN letter; deferred spins; no repeated admission; schedule survives a restart (PGlite on disk, closed and reopened); held never fires; manual trigger fires once; Jamaica conversions; missing hook fails only its milestone and retries with the same key; existing redemption and letter unchanged by the migration; offline cache.
  - Production build PASS. `npm run functions:build` PASS (`api` bundle contains the journey routes; `concierge-dispatch` the journey round).
  - Playwright Chromium (production build): main **32/32**, rehearsal incl. `journey.spec.ts` **11/11** (Casino ceremony end to end and owner journey tab in TEST, zero `/api/` requests, guest storage untouched), screening **4/4** (the Letter of Admission, then the unchanged escort, real test film, natural end, closing words, encore), Butler **7/7**, office **5/5** (Gift Vault NFC journey incl. reload after opening), correspondence **3/3**.
  - Playwright WebKit, iPhone 13 profile: screening **8/8** (each test twice) and `journey.spec.ts` **2/2**. One earlier WebKit run failed once: the Butler service's unread-letter greeting could replace the escort line. Fixed by silencing the service around a Letter of Admission and during an escort; rerun green.
  - TEST/LIVE: every rehearsal journey asserts no request reached the preview server; the journey reuses the ADR-018 simulation, so TEST cannot write LIVE.
- **Screening Room:** the owner reports a real iPhone Safari check on 19 October: escort, native fullscreen player, automatic return to the cinema, Butler's closing message. Recorded in `docs/SCREENING_ROOM_IMPLEMENTATION.md`; not repeated by this agent. Birthday film deferred (SR08).
- **Known issues:** No physical iPhone has run the journey. No SMS sent or tested (`SMS_SENDING_ENABLED` stays false). Codex's `casino.spins.issued` publication and `ttc_journey_hook` do not exist yet (`casino-opening-spins` held). Deploying without the migration closes every exclusive room. Alise needs a v1 member session before 20 Oct 13:00 Jamaica. Under a frozen Playwright clock the simulated office does not persist across page loads (documented in `docs/REHEARSAL.md`). Butler wording and milestone times are provisional.
- **Remaining work:** BJ12–BJ17 (TASKS.md): apply migration then deploy, send the introduction link, Codex integration, iPhone rehearsal, copy approval, authorised SMS test.
- **Commit:** see the branch head of `feature/birthday-journey` (this entry is committed with the work).

## 2026-10-19 23:09 BST (Europe/London) — Codex — Casino and rewards isolated implementation

- **Task:** Implement owner-controlled spin batches, a prize catalogue, persistent vouchers, Vault gifts and the committed Birthday Journey integration contract on an isolated worktree.
- **Summary:** Started at verified production `54b9cf2` on `feature/casino-rewards-vault`; copied only the three contract files from Opus's `586191b`. Added additive PostgreSQL Casino/reward schema and RPC, exact Journey event publication inside the state transaction, admission-guarded member spins, owner issue/cancel/catalogue controls, voucher request/cancel/fulfilment, Vault gift unlock/reveal/physical fulfilment, a single authoritative member reel, a Lounge Voucher Wallet and a mobile Owner Control Centre section. The older roulette/slots visuals remain development previews. No production data, migration, deployment or notification was touched.
- **Created/modified:** `supabase/migrations/20261022100000_casino_rewards.sql`; `netlify/backend/{casino.ts,casino.test.ts,api.ts,database.ts}`; Casino, Lounge and Control Centre UI/CSS; `tests/{casino,casino-owner}.spec.ts` and isolated Playwright config; copied Journey contract/types/templates; project, architecture, task, rehearsal and API documentation; `docs/CASINO_REWARDS_INTEGRATION.md`. The Screening Room implementation was not changed.
- **Checks/results:** `npm run check` PASS (typecheck, ESLint, Prettier, **612 tests in 49 files**, production build). Focused Casino/Vault/privilege PGlite tests PASS (75 tests). Isolated 390 px Casino member/owner Chromium browser checks PASS 2/2, including recovery of a committed spin after reloading during animation; screenshots inspected and the Control Centre tabs corrected to wrap on iPhone width. Screening Room browser regressions PASS 4/4. Netlify Functions bundled locally with a cached CLI. The actual committed Journey migration from Opus's `a704e67` was applied in memory before the Casino migration; all four required RPCs resolved, owner issue and the Journey milestone hook both persisted `casino.spins.issued` events. The initial `npm run functions:build` could not fetch its pinned CLI because npm registry DNS was unavailable; the cached CLI bundle succeeded. No hosted or physical-device check is claimed.
- **Known issues/remaining work:** This isolated branch does not include Opus's Journey implementation, so a standalone TEST/LIVE issue or spin returns `not-configured` until integrated; full Butler/admission/rehearsal browser verification remains. The committed Journey milestone create route requires `key`, while its shared `MilestoneInput` type omits it. `vault.gift.unlocked` is record-only in the contract, so a Butler Vault invitation needs an agreed contract extension; the Casino result links to the gate. The older Casino lookdev and owner rehearsal browser tests still target local outcomes and need updating after integration. No full default browser suite or physical iPhone run was performed. Production migrations and launch require review and owner-controlled integration.
- **Commit:** implementation `5dc15408280f0c77cba50231e6d3c8d7f1d94b34`; this hash was recorded in the subsequent documentation commit.

## 2026-10-20 08:10 BST (Europe/London) — Claude (Opus 5.5) — Final integration, communication hold, release readiness (ADR-021)

- **Task:** Integrate the birthday journey (`feature/birthday-journey` `c48224e`) with Codex's Casino/rewards (`feature/casino-rewards-vault` `382e05e`), fix the two known contract issues, connect the Casino opening hook, add the owner's communication hold (nothing new to Alise on 20 October; earliest release 21 October, Jamaica), rehearse end to end and prepare the release. No deployment, hosted migration, merge to `main`, SMS or invitation.
- **Isolation:** New worktree `../the-thirty-club-final`, branch `feature/birthday-final-integration` from `c48224e`; Codex's branch fetched read-only from its worktree into `refs/remotes/codex-local/casino-rewards-vault`. Both feature branches and every other worktree untouched.
- **Summary:** merge `2d7910a` (conflicts in `database.ts`, `Lounge.tsx`, the contract files, `casino.spec.ts` and the docs resolved keeping both sides; Codex's test stand-in replaced by the real journey functions); hold `2021b7c` (migration `20261022110000_communication_hold.sql`: triggers on letter publication and Alise SMS, wrapped schedulers, unsent Alise SMS cancelled, owner release with typed confirmation not before 21 Oct 00:00 Jamaica, release returns due items to the owner; early membership held on 21 Oct; `/owner/communications` routes; `on-hold` 409); contract fixes `e45237f` (issue A key and idempotent creation; issue B vault-gift journey; Casino scheduler in Jamaica time and armed; immediate journey processing after Casino mutations; wallet only after Casino admission); owner/rehearsal `182ee9d` (hold panel on every Control Centre section; hold-aware journey tab; rehearsal launches trigger milestones and issue server spins); final commit: integration tests, `tools/verify-final-release-migrations.mjs`, simulated requests wait for launch intents, Jamaica times in Casino/voucher displays, specs updated for the authoritative Casino and the hold, documentation and `docs/FINAL_INTEGRATION_RELEASE_HANDOVER.md`.
- **Created:** `supabase/migrations/20261022110000_communication_hold.sql`, `netlify/backend/{hold.ts,hold.test.ts,integration.test.ts}`, `src/features/control-centre/CommunicationHold.tsx`, `tests/integration.spec.ts`, `tools/verify-final-release-migrations.mjs`, `docs/FINAL_INTEGRATION_RELEASE_HANDOVER.md`, `docs/integration/screenshots/*`; plus everything from `feature/casino-rewards-vault`.
- **Modified:** `supabase/migrations/20261022090000_birthday_journey.sql` (never applied anywhere: held 21 Oct seed, `event` invitations, vault-gift reaction, idempotent creation), `netlify/backend/{api,database,journey,casino.test,journey.test,service.test,correspondence.test,vault.test,database.test}.ts`, `build/butlersOfficeLocalApi.ts`, `tools/verify-release-migrations.mjs`, `src/shared/{concierge/types,journey/contract,journey/templates}.ts`, `src/features/{journey,lounge,control-centre,butlers-office,casino,rehearsal}/…`, `src/features/entrance/ui/Entrance.test.tsx`, specs (`owner`, `journey`, `rehearsal`, `casino`), Playwright configs, `package.json` (script `verify:final-migrations`), `ARCHITECTURE.md` (ADR-021), `PROJECT.md`, `TASKS.md` (FI01–FI14), `docs/{BIRTHDAY_JOURNEY,BIRTHDAY_JOURNEY_INTEGRATION_CONTRACT,CASINO_REWARDS_INTEGRATION,REHEARSAL,CONCIERGE_API_CONTRACT}.md`.
- **Checks/results (local):**
  - Types, ESLint, Prettier PASS; Vitest **673 tests in 53 files** PASS, including `hold.test.ts` (8, over LIVE-like data on the real migration chain), `integration.test.ts` (8, real handlers), `journey.test.ts` (25), `casino.test.ts` (10, now on the real journey functions).
  - `npm run verify:final-migrations` PASS: nine hosted migrations + LIVE-like data (fulfilled £100 redemption, published letter, outbox, vault) → three release migrations; existing records byte-identical, unsent Alise SMS held, hold active until 21 Oct 00:00 Jamaica, early membership held, only `birthday-screening`/`birthday-vault`/`casino-opening` armed, 10 tables and 34 functions closed to browser roles.
  - Playwright Chromium on the production build: rehearsal **13/13** (incl. Casino ceremony, owner journey tab, voucher round trip, hold enforcement; zero `/api/` requests), screening **4/4**, Butler **7/7**, office **5/5** (incl. NFC Vault), correspondence **3/3**, Casino-rewards **2/2**; main suite: see the closing line of this entry. WebKit iPhone 13 profile: screening **4/4**, journey + integration **4/4**.
  - `npm run check` and `npm run functions:build`: see the closing line of this entry.
- **Communication hold:** active from the moment the migration is applied; verified in PGlite and in TEST. Not verifiable from here: whether anything was sent to Alise before today (no hosted database or Twilio access); production last showed `SMS_SENDING_ENABLED=false` (19 Oct).
- **Known issues:** no hosted run, no physical iPhone run of the integrated build, no real SMS; `casino-opening-spins` and the travel/breakfast letters held for owner configuration; Butler wording provisional; under a frozen Playwright clock the simulated office does not persist across reloads (tests avoid relying on it).
- **Remaining work:** FI11–FI14 (owner approvals, 21 October release and first invitation, prizes and batches, iPhone rehearsal).
- **Closing results (final build):** `npm run check` PASS (673 tests, build); Playwright main suite **31/31**; `npm run functions:build` PASS (`api` bundle contains the hold and journey routes; `concierge-dispatch` the journey round).
- **Commit:** the final commit on `feature/birthday-final-integration` (reported in the delivery summary).

## 2026-10-20 19:55 BST (Europe/London) — Claude (Opus 5.5) — Final release remediation: SMS policy, SMS operations, early admission (ADR-022)

- **Task:** Answer Codex's NO-GO on `c869d67` (`docs/FINAL_INDEPENDENT_RELEASE_VERIFICATION.md`, `codex/final-release-verification` `b03d065`, read and left unchanged): close the legacy SMS bypass, add owner SMS modes OFF/REHEARSAL/LIVE with real-SMS rehearsal, links in every Butler invitation, the 21 Oct 16:00 UK teaser, the 19:00 UK early admission, Casino consistency. No merge, push, deploy, hosted migration, Netlify change or SMS.
- **Summary:** `15566f8` — one sending boundary (`netlify/backend/smsPolicy.ts` `deliverSms`, the only Twilio caller; legacy concierge injected with it; LIVE legacy send refused `on-hold`); migration `20261022120000_sms_operations.sql` (persistent mode, fail-closed OFF, audited owner changes, outbox claim requiring LIVE + released hold + approval after LIVE began, unclaim on mid-flight change, rehearsal store, teaser draft); invitation links per destination; `open-entrance` effect, public `/entrance`, member `/journey/enter`; Casino spins before the letter and copy without spins. `9ef9dfb` — Control Centre SMS operations, `/rehearse` links, server-clock early admission at the doors (hold at 00:00:10, final ten seconds when eligible and visible), Casino cancel/refresh. Final commit — release browser spec; rehearsal launches withdraw a stale Lounge admission and clear the journey cache; specs updated for the teaser draft and for doors that honour the server's admission; documentation.
- **Created:** `supabase/migrations/20261022120000_sms_operations.sql`, `netlify/backend/{smsPolicy,smsOperations,legacySms,smsPolicy.test}.ts`, `src/shared/sms/rehearsal.ts`, `src/features/entrance/domain/earlyAdmission.ts`, `src/features/entrance/ui/EarlyAdmission.test.tsx`, `src/features/control-centre/{SmsOperations.tsx,smsOperations.css}`, `src/features/rehearsal/RehearseLink.tsx`, `tests/release.spec.ts`, `docs/release/screenshots/*`.
- **Modified:** migrations `20261022090000`, `20261022100000`, `20261022110000` (unapplied anywhere); `netlify/backend/{api,sms,journey,database,hold.test,integration.test}.ts` and test harnesses; `netlify/concierge/{channels,service,api}.ts`; `netlify/functions/{api,concierge-dispatch}.ts`; `tools/{butler-shopping.mjs,verify-final-release-migrations.mjs}`; entrance (`useEntrance`, machine, environment, `Entrance`, `Facade`), Lounge, journey provider/API, rehearsal engine/office/sim, Control Centre, Casino desk and member Casino; `.env.example` (`SMS_REHEARSAL_TO`); `playwright{,.rehearsal}.config.ts`; `tests/{butler-service,butlers-office,journey}.spec.ts`; `ARCHITECTURE.md` (ADR-022), `PROJECT.md`, `TASKS.md` (FR01–FR15), `docs/{FINAL_INTEGRATION_RELEASE_HANDOVER,BIRTHDAY_JOURNEY,BIRTHDAY_JOURNEY_INTEGRATION_CONTRACT,CASINO_REWARDS_INTEGRATION,REHEARSAL,CONCIERGE_API_CONTRACT}.md`; removed the superseded `docs/journey/screenshots/01-summons-at-the-doors.jpg`.
- **Checks and results (local, final tree):**
  - `npm run check` PASS: types, ESLint, Prettier, Vitest **709 tests in 55 files** (incl. `smsPolicy.test.ts` 21, `EarlyAdmission.test.tsx` 12), production build.
  - `npm run verify:final-migrations` PASS: 9 baseline + LIVE-like data → 4 release migrations; data unchanged; hold active; SMS mode OFF; teaser unapproved draft; early admission held at 18:00 UTC; 12 tables and 42 functions closed to browser roles.
  - `npm run functions:build` PASS; `api` and `concierge-dispatch` bundles each contain exactly one Twilio URL (the policy's transport). Frontend `dist` contains no credentials or real numbers (only variable names and the rehearsal's fake `+4400000000…` values).
  - Playwright Chromium, production build: main **31/31**, rehearsal **16/16** (incl. release 3/3), screening **4/4**, office **5/5**, correspondence **3/3**, Butler **7/7**, Casino-rewards **2/2**. WebKit (iPhone profile): screening **4/4**; journey + integration + release **7/7**. First full run had 4 failures (stale Lounge admission across launches; the old "summons at the doors" step; the teaser as a sixth draft; guest `/entrance` reads counted before the code) — fixed and the affected suites rerun as above.
- **Known issues:** no hosted migration, deployment or real Twilio send; Twilio Auth Token must be rotated before production sending; no physical iPhone run; birthday film not configured; Codex P1-6 (future content and code in the public bundle) not addressed; rehearsal SMS have no delivery callback; Arron's SMS notifications flow only in LIVE.
- **Remaining work:** FR10–FR15 (Codex re-audit, Twilio rotation and Netlify variables, migrations and deploy, iPhone rehearsal, 21 Oct owner sequence, P1-6 decision).
- **Commit:** the commit adding this entry on `feature/birthday-final-integration` (hash in the delivery report).

## 2026-10-20 23:18 BST (Europe/London) — Claude (Opus 5.5) — Revision 3: Codex P1s and the NFC membership-card admission (ADR-023)

- **Task:** Answer Codex's NO-GO on `e0d3509` (`docs/FINAL_INDEPENDENT_RELEASE_VERIFICATION.md`, `codex/final-release-verification` `f7eff13` in `~/Documents/ChatGPT/30club/independent-p0-audit`, read in full, unchanged): fix P1-A (Casino cancellation vs the admission letter) and P1-B (cross-device membership), and deliver the physical NFC membership-card admission for 21 Oct 19:00 UK; assess the 22–24 Oct storyline. No merge, push, deploy, hosted migration, Netlify/Twilio change, SMS, or production entitlement change.
- **Context ingestion:** Integration worktree verified clean at `e0d3509` (contains all of `origin/main` `54b9cf2`; local `main` `49142ef` desk docs and the primary checkout's uncommitted desk work belong to another agent and were not touched). The four canonical Google Docs could **not** be read (Drive connector requires authentication); repository equivalents were used and `docs/release/GOOGLE_DOCS_SYNC_2026-10-20.md` proposes the exact synchronisation.
- **Summary:**
  - Migration `20261022130000_membership_card_admission.sql` (additive; wraps functions, the four audited migrations unchanged): `ttc_membership_card`; `journey-enter` before the birthday requires a recorded card (`card-required`); `system-journey-card`; `/entrance` returns the 19:00 letter once fired; journey letters containing `[[` refuse to publish; `early-membership` gains a Butler letter with `[[CLUE]]` (action admission/lounge → SMS links to the entrance); `ttc_room_admissions.promises_spins`; Casino invitation locks the member row; `owner-casino-cancel` reimplemented: member→batch lock, idempotent repeat, `spins-promised` when the last batch with spins carries a delivered promise.
  - Server: `POST /api/v1/auth/member/card` (`requireMembershipCard`: live `membership` scope; travel credential, rehearsal realm, forgeries, owner sessions refused; rate-limited); `open-entrance` in the shared contract and PATCH validator; error codes `spins-promised`, `card-required`.
  - Client: final ten seconds need eligibility + card + visibility; server clock also drives the birthday countdown; the Butler's letter (`EarlyLetter`) and the card prompt (riddle suppressed) at the 00:00:10 hold; cross-tab card/ceremony sync; `CredentialArrival` and the printed-number prompt present the card to the club (≤ 4 s); `JourneyProvider` keeps a pending acceptance until recorded (presents the card on 401/403); the entrance consults the journey once carded.
  - Owner: journey tab "Edit wording" with a placeholder warning; card link labelled for Wednesday with a weak-token warning and LIVE-link caution.
  - TEST: sim card route; scenarios "19:00 UK, waiting for the card", "the card is scanned (NFC)", card intents through the real handlers (called directly — a page fetch inside a launch waited on the launch itself, found and fixed), rehearsal wording for `[[…]]` in the TEST office only.
  - Docs: ADR-023, handover revision 3 (§0–0.2 runbook and owner card setup), API/journey/Casino/rehearsal contracts, PROJECT, TASKS NC01–NC13, `docs/release/STORYLINE_DEPENDENCY_MAP.md`.
- **Created:** `supabase/migrations/20261022130000_membership_card_admission.sql`, `netlify/backend/membershipCard.test.ts`, `src/features/journey/client/membershipCard.ts`, `src/features/journey/enterReconciliation.test.tsx`, `src/features/entrance/ui/EarlyLetter.tsx`, `docs/release/{STORYLINE_DEPENDENCY_MAP,GOOGLE_DOCS_SYNC_2026-10-20}.md`, `docs/release/screenshots/{06-the-letter-and-the-clue,07-after-the-card-scan}.jpg`.
- **Modified:** `netlify/backend/{api,database,journey,vault,casino.test,hold.test,integration.test}.ts`, `src/shared/{concierge/types,journey/contract}.ts`, `src/features/entrance/{useEntrance.ts,domain/earlyAdmission.ts,ui/Entrance.tsx,ui/Facade.tsx,ui/EarlyAdmission.test.tsx}`, `src/features/journey/{JourneyProvider.tsx,client/journeyApi.ts}`, `src/features/correspondence/client/correspondenceApi.ts` (optional headers), `src/features/concierge/{ui/CredentialArrival.tsx,ui/EntranceConcierge.tsx,owner/OwnerConsole.tsx,owner/owner.css}`, `src/features/butlers-office/JourneyOffice.tsx`, `src/features/rehearsal/{engine,office,rehearsal.test}.ts`, `src/features/rehearsal/sim/v1.ts`, `tests/release.spec.ts`, `tools/verify-final-release-migrations.mjs`, `ARCHITECTURE.md`, `PROJECT.md`, `TASKS.md`, `docs/{FINAL_INTEGRATION_RELEASE_HANDOVER,CONCIERGE_API_CONTRACT,BIRTHDAY_JOURNEY_INTEGRATION_CONTRACT,CASINO_REWARDS_INTEGRATION,REHEARSAL}.md`.
- **Checks and results (local, final tree):**
  - Before the fix: Codex's exact Casino reproduction (`integration.test.ts` "the exact reproduction") **failed on `e0d3509`** — cancellation returned 200 with the letter promising spins; the three `enterReconciliation.test.tsx` tests **failed against the `e0d3509` JourneyProvider**. Both pass now.
  - `npm run check` PASS (exit 0): types, ESLint, Prettier, Vitest **728 tests in 57 files** (was 709/55), production build (existing chunk-size/eval warnings).
  - Focused: SMS policy + hold + integration + card + early admission + reconciliation **71/71**; `smsPolicy.test.ts` 21/21 unchanged (P0 fix preserved).
  - `npm run verify:final-migrations` PASS: 9 baseline + LIVE-like data → 5 release migrations; data unchanged; hold active; SMS OFF; teaser draft; early admission held with letter awaiting the clue; no card recorded; placeholder letter refused; **13 tables / 46 functions** closed to browser roles.
  - `npm run functions:build` PASS; `api` bundle contains the card route; each bundle still has exactly one Twilio URL.
  - Playwright Chromium, production build: main **31/31**; rehearsal/iPhone profile **18/18** (incl. release 5/5: hold-for-card with the printed number; NFC link in a new tab; reload without a second ceremony; zero `/api/` requests leaving the tab); office **5/5**; correspondence **3/3**; Butler **7/7**; Casino-rewards **2/2**; screening **4/4**. WebKit iPhone 13 profile: release + journey + integration **9/9**.
  - First full main run had 3 failures caused by a change of mine (holding a device-clock opening until the server answered altered the birthday "Enter the club" UX); reverted to the narrower server-offset countdown and rerun green (31/31).
- **Process note:** a `git checkout -- docs` intended to restore regenerated screenshots also reverted this revision's own edits to five docs; detected immediately and re-applied verbatim before commit (those files had no other changes).
- **Known issues:** no hosted migration/deploy; no physical iPhone or NFC hardware run; real card token strength in Netlify unverified; Twilio token rotation pending; birthday film absent; a phone clock already past the birthday still plays the local ceremony (server refuses admission); installed PWA needs the card once (separate iOS storage); Codex P2 spoilers accepted; Google Docs not synchronised.
- **Remaining work:** NC08–NC13 (Codex re-audit of this commit; owner Netlify variables, backup, five migrations, deploy; card programming and physical TEST rehearsal; 21 Oct owner sequence incl. the clue; storyline; Docs sync).
- **Commit:** the commit adding this entry on `feature/birthday-final-integration` (hash in the delivery report).

## 2026-10-21 01:07 BST (Europe/London) — Claude (Opus 5.5) — Revision 4: emergency repair for Codex's NO-GO on `282c4ea`

- **Task:** Fix the release blockers Codex reported on `282c4ea` (owner's summary; no written report exists in the audit worktree): promised Casino spin quantities, the device-clock entrance path and timezone correctness, the date-dependent hold test; prepare the 21 Oct release runbook. No push, merge, deploy, hosted migration, Netlify/Twilio change or message.
- **Summary:**
  - Casino: `ttc_casino_promise_floor` — a delivered promise (Casino admission letter mentioning spins, or a delivered "spins credited" letter via a trigger on the journey event) sets the floor to played + available; cancellation allowed only if played + available − batch ≥ floor; member-row lock serialises concurrent cancels. Replaces the "another batch has spins" rule that the 3-promised/1-replacement counterexample defeated.
  - One entrance: with a server source no clock opens the doors (`neverOpens` in `useEntrance`); `journey-enter` always requires the fired `early-membership` milestone and a recorded card (birthday bypass removed); rehearsal birthday-midnight door scenarios removed; desk button plays the 19:00 card ceremony.
  - Time zones: `ttc_journey_milestones.timezone` (Europe/London for 21–22 Oct items, America/Jamaica otherwise) in owner JSON and the edit control; held `jamaica-arrival` (owner-triggered) and `birthday-dinner` (24 Oct 16:00 Jamaica) letters with placeholders; tests for every seeded instant in its zone, birthday midnight = 00:00 Jamaica, UK DST end on 25 Oct, Jamaica UTC−5, manual trigger never re-fires, device TZ change keeps clock and membership.
  - P2: `hold.test.ts` seeds on the simulated clock (it failed at real 20 Oct 23:33 UTC: Arron's alert got the real `now()`). Production hold unchanged.
  - Runbook `docs/release/RELEASE_RUNBOOK_2026-10-21.md`; ADR-023 amendment; handover revision-4 note; TASKS RV01–RV07; contract wording.
- **Created:** `docs/release/RELEASE_RUNBOOK_2026-10-21.md`.
- **Modified:** `supabase/migrations/20261022130000_membership_card_admission.sql` (unapplied anywhere), `netlify/backend/{hold,integration,membershipCard}.test.ts`, `src/features/entrance/{useEntrance.ts,ui/EarlyAdmission.test.tsx}`, `src/features/butlers-office/JourneyOffice.tsx`, `src/features/control-centre/RehearsalDesk.tsx`, `src/features/rehearsal/{engine,rehearsal.test}.ts`, `src/shared/journey/contract.ts`, `src/shared/concierge/time.test.ts`, `tests/{concierge-helpers,concierge,entrance-poster,lounge,owner,rehearsal}.spec.ts` (helpers file `.ts`), `tools/verify-final-release-migrations.mjs`, `ARCHITECTURE.md`, `TASKS.md`, `docs/{FINAL_INTEGRATION_RELEASE_HANDOVER,CASINO_REWARDS_INTEGRATION,CONCIERGE_API_CONTRACT,REHEARSAL}.md`.
- **Checks and results (local, final tree):**
  - Before the fixes on `282c4ea`: `npm test` 727/728 (the hold test failed at real time 20 Oct 23:33 UTC); the exact Casino counterexample and the partial-replacement test **failed** against the `282c4ea` migration.
  - `npm run check` PASS (exit 0): types, ESLint, Prettier, Vitest **740/740** (57 files), production build (existing chunk-size warning).
  - `npm run verify:final-migrations` PASS: 9 baseline + LIVE-like data → 5 release migrations; data unchanged; hold active; SMS OFF; teaser draft 15:00 UTC Europe/London; early admission held with the clue placeholder; milestone zones; arrival and dinner held; no card or promise recorded; **14 tables / 50 functions** closed to browser roles.
  - `npm run functions:build` PASS; one Twilio URL per bundle; `api` contains the card route.
  - Playwright Chromium production build: main **30/30** (two birthday-entrance specs replaced by one "the card opens nothing by itself on the birthday"; first run 29/31 before that replacement); iPhone profile **18/18**. WebKit iPhone profile (release + journey + integration) **9/9**.
  - Concurrency is exercised through the API in PGlite, which serialises connections; the real guarantee is the member row lock in PostgreSQL.
- **Known issues:** no hosted run, physical iPhone or NFC hardware; real Netlify variables, card token strength and Twilio queue unverified; birthday film absent; the no-server device-clock opening remains in development previews and stage-machine unit tests only; Casino floor conservatively protects all spins available when a promise is delivered.
- **Remaining work:** RV06 (Codex audit of this commit), RV07 (owner runbook).
- **Commit:** the commit adding this entry on `feature/birthday-final-integration` (hash in the delivery report).

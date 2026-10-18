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

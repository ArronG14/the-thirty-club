# Architecture

## Decision status

**Confirmed for this foundation:** React + strict TypeScript + Vite, Tailwind CSS via its Vite plugin, React Router, Zustand for ephemeral application state, npm lockfile, ESLint, Prettier, Vitest/Testing Library, and vite-plugin-pwa using generated Workbox service workers. Browser support starts at Safari/iOS 16.4 (Tailwind 4 baseline); the actual birthday iPhone must be confirmed. No backend is introduced in phase 1.

**Proposed, not implemented:** IndexedDB for versioned non-authoritative local records and selected downloads; a small backend for authentication, entitlements, unlocks, redemptions and notifications; Motion or GSAP after creative direction. Three.js is now confirmed for the entrance only (ADR-007). Netlify is the configured deployment target (not yet deployed); API provider, authentication, notification channel and private asset delivery remain undecided.

## Structure and boundaries

- `src/app/`: application composition and routes.
- `src/features/entrance/`: phase 2 entrance and foyer. `domain/` holds pure countdown, stage machine, device record and butler script modules (no React). `useEntrance.ts` composes clock, record and timers. `ui/` holds presentation and CSS. `scene/` holds the lazily loaded real-time 3D entrance (ADR-007). `preview/` is development-only. The foundation placeholder view was removed when the entrance replaced it.
- `src/features/vault/`: the Private Gift Vault (ADR-015): `client/` (v1 API, held NFC key, announcements), `domain/` (Butler lines), `useGiftVault.ts` (journey), `scene/` (lazy 3D chamber and its pure maths), `ui/` (room, letter, CSS chamber, routes), `audio/`. Server: `netlify/backend/vault.ts` and `ttc_vault_action`. Owner controls: `src/features/butlers-office/VaultOffice.tsx`.
- `src/features/prizes/`: the club-wide prize engine (reward types, ledger, versioned persistence, Gift Vault contract); knows no game. `src/features/casino/`: the Grand Casino (`domain/` pure roulette, slots, state and butler lines; `config/` rewards, rules and the asset registry; `scene/` the lazy 3D room and its pure motion maths; `ui/` panels, reveal and collection; `audio/` Web Audio synthesis; `dev/` development-only tools). See ADR-010.
- `src/shared/state/`: presentation-independent Zustand connectivity store; no membership or reward authority.
- `src/shared/pwa/`: service-worker registration and real offline/update status.
- `src/shared/ui/`: shared semantic layout and the `useReducedMotion` hook.
- `src/styles/`: Tailwind import, provisional tokens, safe-area and reduced-motion foundations.
- `src/test/`: test setup; feature tests live next to implementation.
- `tests/`: production PWA browser checks.
- `public/`: bundled installation assets; never private surprise material.

Routes currently expose only `/` (the entrance, or the foyer once entered) and an honest not-found view. Browser history requires hosts to rewrite application navigation to index.html while preserving asset and API errors. Every future experience should own its UI and domain logic. Shared interfaces belong in a domain folder only when first consumed; avoid speculative abstraction. Components consume stores or hooks rather than own authoritative state.

## State and persistence

Zustand holds connectivity signals in memory. The entrance keeps its stage in a local reducer: it is a single-screen sequence with no cross-feature consumers yet. `navigator.onLine` is a hint, not proof of API reachability. No personal, entitlement or redemption data is stored yet. Later IndexedDB records need schema versions, migrations, error handling, reset policy, storage-quota handling and tests. Request persistent storage only when the download experience justifies it. Browser storage can be evicted; server records are the source of truth for valuable actions.

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
- ADR-006 (2026-10-17): entrance timing and state, recorded below.
- ADR-007 (2026-10-18): real-time 3D entrance with the SVG facade as poster and fallback, recorded below.
- ADR-008 (2026-10-18): Members' Lounge, room registry and membership record, recorded below.
- ADR-010 (2026-10-18): Grand Casino, shared prize engine and Gift Vault contract, recorded below.
- ADR-012 (2026-10-18): the Concierge — pre-birthday journey, Netlify Functions + Blobs backend, Telegram notifications, NFC credentials and the membership-card gate; amends ADR-006 (Jamaica midnight). Recorded below; full design in docs/CONCIERGE.md. (ADR-011 is the PIN owner test mode, recorded below by another agent.)
- ADR-015 (2026-10-18): the Private Gift Vault on PostgreSQL, NFC credentials, membership bridge and owner preview; amends ADR-008 (the vault room opens with the membership). Recorded below; full design in docs/GIFT_VAULT.md.
- ADR-016 (2026-10-19): the Correspondence Desk — owner-scheduled letters published by the existing every-minute round, Butler SMS through the existing outbox. Recorded below; full design in docs/CORRESPONDENCE_DESK.md.
- ADR-018 (2026-10-19): one Owner Control Centre (LIVE / TEST) and the universal rehearsal engine — rehearsal pages answer their own API calls with the real handlers and migrations in the browser; full design in docs/REHEARSAL.md.
- ADR-019 (2026-10-19): the Private Screening Room shows one continuous birthday film in the native player; supersedes ADR-009's message collection. Recorded below; handover in docs/SCREENING_ROOM_IMPLEMENTATION.md.
- ADR-020 (2026-10-19): the birthday journey — server-authoritative room admissions (LOCKED → INVITED → ADMITTED), owner milestones in Jamaica time fired by the existing every-minute round, a durable cross-system event inbox, and the Butler's correspondence as Correspondence Desk letters with ENTER/RETURN buttons. Amends ADR-008/012/015/019 room opening. Recorded below; operations in docs/BIRTHDAY_JOURNEY.md; integration contract in docs/BIRTHDAY_JOURNEY_INTEGRATION_CONTRACT.md.
- ADR-017 (2026-10-19): the Butler's Service — one bell, menu, correspondence overlay and request composer for the locked entrance and the lounge; owner direct SMS and request responses on the existing outbox; Dev Mode rehearsal in owner session storage. Recorded below; full design in docs/BUTLERS_SERVICE.md.

## Open questions

1. Confirm eight-phase names and delivery ownership across collaborating agents.
2. Confirm iPhone model/iOS, reveal time, hosting/domain and HTTPS deployment path.
3. Approve design, butler script/voice, member number and all personalised content.
4. Choose authentication/recovery, backend provider and organiser access.
5. Decide game fairness/repeat rules, prize inventory, offline redemption policy and notifications.
6. Confirm video permissions, download/storage budgets, Jamaica logistics and NFC/QR fallback.

## Reference documentation

[Vite](https://vite.dev/guide/), [Tailwind Vite integration](https://tailwindcss.com/docs/installation/using-vite), [Vite PWA update handling](https://vite-pwa-org.netlify.app/guide/prompt-for-update).

## Netlify deployment preparation (ADR-005, 2026-10-17)

Current project root is `/Users/ag14/Documents/Projects/the-thirty-club`. `netlify.toml` builds with `npm run build`, publishes `dist`, and pins Node 22.13.1/npm 10.9.2. No application environment variables are required. Build tools remain devDependencies and must be installed by the build environment.

There is no blanket `/* /index.html 200` redirect. Netlify splats cannot express a general file-extension exclusion. A small routing-only Edge Function (`netlify/edge-functions/spa.ts`) serves the root HTML for GET/HEAD requests accepting text/html on extensionless non-reserved paths. API, assets, dotted/encoded-dot paths and non-HTML/mutating requests bypass it. Root serving bypasses it too, preventing recursion when fetching the shell. The response retains upstream error status and explicitly revalidates HTML. This is hosting routing, not the proposed member/backend service; it has no storage, secrets or authentication. It requires Netlify Edge Functions, so copying dist alone to another static host does not reproduce these routes.

`/api` and `/api/*` deliberately return a static 404 until a backend is introduced. `/assets/*` returns 404 for missing resources; real files take priority. `public/404.html` is a static error document with no application entry point. Other missing file paths get Netlify's normal error handling because the Edge Function declines them.

HTML, manifest, sw.js and root Workbox scripts revalidate. `build/netlifyHeaders.ts` writes exact immutable paths into `dist/_headers` from fingerprinted files in Vite's emitted bundle. It does not grant immutable caching to a directory wildcard, missing paths, public copies or unhashed resources. The worker precache remains separate from HTTP caching. No dependencies were added.

Workbox uses the same `nonSpaPath` exclusion as the Edge Function to avoid masking API/file failures after installation. Its matching includes pathname plus search, so the expression deliberately ignores dots/slashes inside query values. Existing prompt updates, offline-ready callback and public shell precaching remain in place; 404.html is an additional public precache asset.

Local tests verify routing boundaries, exact asset-header generation and installed-worker offline behavior. Vite preview does not emulate Netlify redirects, Edge Functions or headers. A hosted preview must still verify deep routes/queries, HEAD and conditional requests, API and missing-file 404s, real asset content types/headers, immutable filename rotation, and iPhone installation/offline/update behavior. Do not connect/deploy until authorised.

References: [Netlify redirect limitations](https://docs.netlify.com/manage/routing/redirects/redirect-options/), [Edge request routing](https://docs.netlify.com/build/edge-functions/api/), [Netlify headers](https://docs.netlify.com/manage/routing/headers/).

## The Grand Entrance (ADR-006, 2026-10-17)

**Time source.** The target is `new Date(2026, 9, 24)`: local midnight, recomputed on every tick so a device that changes zone (for example after the flight to Jamaica) targets its new local midnight. All displayed values derive from `target − Date.now()`, never a decremented counter. Ticks are scheduled on the countdown's own second boundaries. `visibilitychange`, `pageshow` and `focus` force an immediate recompute after background tabs, bfcache restores or device sleep. Seconds round up, so 00:00:00 appears only at the target. Values clamp at zero. Days are elapsed 24-hour periods: a DST change between now and the target is absorbed correctly as real elapsed time. There is no hydration risk because this is a client-only SPA, and the first render computes from the clock synchronously, so no wrong-state flash occurs.

**Device clock trust (accepted limitation).** Device-local time is used deliberately, with no backend. Someone who changes the device clock can open the doors early on that device. This is a ceremonial gate, not a security boundary: no secret content sits behind it, consistent with ADR-003.

**Stages.** A pure reducer moves `locked → final-minute → unlocking → opening → foyer`. A late arrival starts at `awaiting-entry` and enters on tap. `replay` reruns the ceremony from the foyer. Timings come from `ceremonyTimeline(reducedMotion)`: 2.6 s + 4.6 s with full motion, 1.2 s + 0.9 s reduced.

**Device record.** A versioned localStorage key, `thirty-club:entrance` (`{version: 1, unlockedAt, ceremonySeenAt}`), records the first unlock and the completed ceremony. A recorded unlock wins over the clock, so a corrected or rolled-back clock never relocks the doors. A completed ceremony returns the member to the foyer. Corrupt, foreign-version or unavailable storage degrades to time-only behaviour. localStorage was chosen over the proposed IndexedDB layer because this is two non-authoritative timestamps; it grants nothing.

**Development preview.** `?preview=locked|final-minute|midnight|arrival|foyer` is resolved only inside an `import.meta.env.DEV` branch. Vite replaces it with `false` in production and the module is eliminated: a production-bundle grep finds no preview code, and a Playwright test confirms production ignores the parameter. Previews use a shifted clock and in-memory storage, so they never write the real record.

**Rendering and motion.** The architecture is inline SVG: shared paint servers in a zero-size `<svg>`, not `display:none`, which breaks WebKit gradient references. One `feTurbulence` grain filter is rasterised once per leaf. Light is a single `--anticipation` custom property expressed through opacity. The doors use CSS 3D `rotateY` with parent perspective and no `preserve-3d`. Reduced motion keeps the narrative beats but removes rotation, drum rolls and the dolly; the global reduced-motion rule also removes transitions. No animation library or WebGL was added.

**Fonts.** `@fontsource-variable` packages for Bodoni Moda, Cormorant Garamond and Jost are runtime dependencies, but only four latin `.woff2` files (~150 KB) are referenced directly via `@font-face`. They are fingerprinted, precached (`woff2` was added to Workbox `globPatterns`) and receive exact immutable headers. Total precache is 21 entries (~471 KiB).

**Open questions added.** Owner approval of the butler script, his name (currently "The Butler"), the "30" medallion and the register wording. Whether the presenter wants the ceremony to auto-play at midnight on a specific device or be triggered in person. Install icons and favicon remain provisional foundation assets.

## Real-time entrance (ADR-007, 2026-10-18)

Approved by the owner after the Phase 2B lookdev (docs/ENTRANCE_ART_DIRECTION.md).

**Layering.** `ui/Facade` lazy-imports `scene/EntranceCanvas` only when `canRender3D()` succeeds. That check is a WebGL2 probe with `failIfMajorPerformanceCaveat`, and it imports no three.js. The existing SVG facade renders immediately as the poster.

- **Facade modes:** `loading` (poster visible) → `fading` (first frame drawn; the canvas dissolves in over 1.4 s) → `scene`. Any failure returns to `poster`.
- **The chunk:** three.js plus the scene is about 167 KB gzip in its own chunk. The main bundle is unchanged (~91 KB gzip).
- **Accessibility:** in scene mode the poster art is hidden, but the `h1` stays visually hidden and the `role="timer"` text remains, so the accessible structure is unchanged.

**Boundaries.** `EntranceScene` is presentation only. Through `update()` it receives the stage, the remaining time, the anticipation and reduced motion from `useEntrance`, and it never decides time or state. It reports four events: `onReady`, `onFallback(reason)`, `onFrame(anchors)` and `onDoorTap`. Pure helpers (lens fit, drum roll, curves, quality tiers) are in `scene/sceneMath.ts` and are unit-tested.

**Scene content.** The doors, time-lock, bell, sconces, fanlight and floor are as described in the art direction.

- Static geometry is merged per material in `mergeStatic`, reducing draw calls about 5× against the lookdev.
- Each scene instance creates its own `<canvas>`. A disposed scene forces context loss to release GPU memory (iOS caps live contexts), and must never kill a context another instance (e.g. under StrictMode) is using.

**HTML overlays.** The scene projects anchor points every frame.

- The bell is a real `<button>` (`.bell--scene`, accessible name "Ring for service") positioned with `position: fixed` over the 3D bell-push through CSS variables. It is at least 44 × 56 px.
- The unit labels (Days, Hours, Mins, Secs) are projected HTML, because engraved 3D legends at phone size would be about 5 px.
- The personal line, "Enter the club" and the butler's words sit over the floor as subtitles. The butler's words now withdraw after a reading-length pause (`speechDuration`, at least 7 s) in both modes.

**Stages.**

- `final-minute`: everything warms continuously through `anticipation`.
- `unlocking`: the seam blazes and the time-lock bolt withdraws.
- `awaiting-entry`: the seam breathes, and the doors or the HTML button enter.
- `opening`: the leaves swing about 100° in 3.4 s; the camera travels through between 2.3 and 4.6 s; the existing CSS flare carries the cut to the HTML foyer (option a).

The CSS facade dolly is disabled in scene mode. Under reduced motion there is no parallax, drift, dust motion or camera travel; drums snap; and the doors are simply open during the brief opening beat.

**Performance controls.**

- DPR is capped at 2.
- Rendering idles at about 30 fps when nothing moves and runs full rate during interaction, the final minute and the ceremony. requestAnimationFrame pauses when hidden.
- Shaders are compiled with `compileAsync` before the first frame.
- Adaptive tiers are judged on wall-clock windows (1 s warm-up, 1.5 s sample, at least 40 fps sustained): tier 1 drops the planar reflection and DPR 1.5; tier 2 drops shadows and DPR 1.2. **Amended (ADR-013, 2026-10-18):** at the lowest tier a scene that merely misses 40 fps keeps playing; only frames slower than 200 ms (under 5 fps) return the poster. Frame gaps over 500 ms, a hidden page and a restored context restart the windows rather than counting as slow frames. Measurement stops once a tier holds.
- WebGL context loss pauses rendering and waits 6 s for the context to return (iOS usually restores it); only then does the poster appear. A thrown frame or failed initialisation falls back at once.
- Every fallback records its cause (`reason`, message, tier, mean frame time, time since first frame, context losses, DPR, viewport, canvas size) on `window.__entranceDiag` and in sessionStorage; `/?entrance-diag` shows it on screen (ADR-013).

**Assets and offline.** Wood, stone and marble are CC0 Poly Haven scans, graded and re-encoded by `tools/prepare-textures.py` (requires Pillow). Only the WebP outputs (~410 KB) are committed, with credits in `scene/assets/CREDITS.md`. Brass, glass, glows and all lettering are generated at load; lettering waits for the self-hosted fonts. `webp` was added to the Workbox globs. The precache is now 30 entries (~1.47 MB), up from ~0.47 MB, so the first online visit takes longer on hotel Wi-Fi. Playwright verifies that the 3D scene loads while offline.

**Testing limits.** Headless Chromium renders WebGL with SwiftShader (software): the first frame takes about 18 s there, so its timings mean nothing for a phone. Fake-clock ceremony tests therefore run against the poster (`tests/entrance-poster.spec.ts`), and the 3D tests use real timers with long timeouts. **No iPhone, Safari or WebKit measurement exists yet.** The tier thresholds are untuned guesses until rehearsal on the actual device (task V03).

## Members' Lounge and club navigation (ADR-008, 2026-10-18)

**Where it sits.** The entrance stage machine is unchanged: its final stage is still called `foyer`, but `Entrance` now renders the `Lounge` there instead of the old holding room (`Foyer.tsx` was removed). The lounge is the club's hub. Feature boundaries:

- `src/features/club/domain/` — pure, no React: `rooms.ts` (registry), `schedule.ts` (Jamaica wall-clock unlocks), `membershipRecord.ts` (persistence), `clubState.ts` (open/locked/enterable, recommendation, unlock latching), `loungeScript.ts` (butler induction, briefings, concierge lines).
- `src/features/club/useClub.ts` — composes the clock and the record; rechecks every 30 s and on visibility/pageshow/focus.
- `src/features/club/ui/RoomGate.tsx` — `/rooms/:roomId`, the only way into a room.
- `src/features/lounge/` — `ui/` (lounge, ceremony, card, directory, sheet) and `scene/` (lazy 3D lounge).

**Room registry.** One list (`ROOMS`) with stable ids (`entrance`, `lounge`, `screening-room`, `casino`, `gift-vault`, `privileges`), display name, unlock rule (`always`, `membership`, or `scheduled` at an instant), recommended `sequence`, a `built` flag, a path, and butler invitation/reminder/announcement lines. The Secret Chamber is deliberately absent. Completion and visits live in the record, not the registry.

**Honest navigation.** A room is _enterable_ only when it is open **and** `built` **and** has a view registered in `RoomGate`. In this build only the entrance and lounge are built, so: the guided panel names the Private Screening Room with the status "Being prepared" and no button; the directory lists every room, but only "Revisit" (the entrance) is a control; tapping the 3D doorway makes the butler say the room is being prepared; direct URLs show an honest notice ("not open yet … opens at 2 pm, Jamaica time" / "not ready yet") with a link back. Flipping `built` and registering a view lights up "Continue your evening", the directory entry and the doorway (covered by `LoungeBuiltRoom.test.tsx`).

**Schedule.** Scheduled unlocks are Jamaica wall-clock times (`America/Jamaica`, converted with `Intl`, so they are correct on a phone still set to London). The hours are PROVISIONAL and live only in `schedule.ts`. The entrance keeps device-local midnight (ADR-006). The screening room opens with the membership, not on a clock.

**Persistence.** `localStorage` key `thirty-club:membership`, `{version: 1, inductedAt, rooms: {[id]: {unlockedAt, announcedAt, visitedAt, completedAt}}}`. Corrupt, foreign-version or unavailable storage degrades to an empty in-session membership (the ceremony may replay; nothing breaks). Unknown room ids and invalid stamps are dropped. A recorded `unlockedAt` latches a room open even if the clock is set back. `announcedAt` stops the butler repeating an introduction. Like the entrance record, it is non-authoritative: it grants nothing (ADR-003). Previews use in-memory storage.

**Butler.** Scripted, no AI. Induction (four beats; the first reuses the entrance's welcome lines) runs while `inductedAt` is null, so an interrupted ceremony restarts rather than being lost, and a completed one never replays. On arrival he gives one briefing: a greeting (none after induction; "Ah, Alise. There you are." after walking through the doors; time-of-day "Welcome back" otherwise), one-line announcements of newly opened rooms, then the invitation (first time) or a short reminder for the recommended room; "later today" or "everything is open" when there is nothing to recommend. Rooms opening while she sits in the lounge are announced once. His words withdraw after `speechDuration`; the guidance panel stays. The bell cycles concierge lines.

**3D lifecycle.** `LoungeCanvas` is a lazy chunk (~12 KB gzip) sharing the three.js chunk with the entrance; `Facade` prefetches it once the doors unlock. When the stage reaches `foyer` the facade unmounts, the entrance scene disposes and forces context loss, then the lounge creates its own canvas: never two live scenes (Playwright checks a single canvas after hand-off). It reuses the entrance's scanned walnut (also cut into a chevron parquet at load) and brass; marble, rug, silk, inlay and lettering are procedural; unused entrance textures are disposed. The CSS lounge is the instant poster and the no-WebGL/failure fallback. Same quality tiers and fallback rules as ADR-007. Lights: fire, one shadowed chandelier spot, a picture light, two lamps and the passage glow; everything else is additive light pools. Rendering idles at ~30 fps (the fire keeps moving). An HDR clamp pass (`postfx.ts`) precedes bloom because near-mirror highlights overflowed half-float buffers into NaN blotches in testing — the same risk exists on iOS.

**Camera.** The default shot is a three-quarter view keeping the fire and the curtained screening-room doorway in frame, so the next destination is always visible. Focus shots: `hearth` during the ceremony, `screening` while he invites her (or the continue button is focused/hovered), `directory` while the directory is open. A first entry dollies in from the doorway with an exposure that settles from the flare. Reduced motion: no dolly, parallax, sway or dust; cuts between shots; calmer firelight; CSS animations removed by the global rule.

**Accessibility.** Semantic buttons for every action (≥44 px; dock items 64 px), dialogs with `aria-modal`, Escape, explicit focus return (Safari does not focus buttons on click) and an `inert` room behind them. Scene labels and 3D tap targets duplicate dock controls and are `aria-hidden`. The butler's region is `aria-live` and receives focus on arrival and after induction.

**Development aids (eliminated in production).** Preview modes `?preview=induction|lounge|evening`; `window.__lounge` and `?lookdev` (disables performance fallback for software-rendered screenshots) exist only behind `import.meta.env.DEV`. An inert `debugShot = null` class field remains in the bundle.

**Open questions.** Card wording and member number; unlock hours and room order; whether the screening room should require completion before the casino is recommended; whether progress should later sync to the backend (B05) — not implemented.

## Private Screening Room fixed cinematic destination (ADR-009, 2026-10-18)

Prompt 05 supersedes the earlier Screening Room scene proposal and the ADR-008 statement that only entrance/lounge are built. Screening is now a lazy, membership-gated room with a generated photographic background, fixed HTML projection surface and native HTML5 player. It does not import Three.js. Portrait and desktop backgrounds are replaceable independently of media controls; the clean development-only end frame uses identical screen geometry.

The existing typed video configuration and same-origin validation remain authoritative; placeholders never reach the player. An optional transcript field complements captions. Premiere acknowledgement, selection, watched IDs, positions and entrance-seen state live in a versioned `thirty-club:screening` local record. Progress is non-authoritative and survives normal refreshes where storage is available. Completion is sent through the existing club record only when every real current message has ended; skipping does not mark watched. Inline controls are now exclusively custom; iOS native fullscreen can provide browser-owned controls (see the premiere refinement below).

Optional future muted inline entrance playback has Skip/error/timeout/reduced-motion/seen fallbacks. No entrance film exists yet. Development preview imports and synthetic-media serving are eliminated from production; media files are excluded from the PWA precache. Both photographic backgrounds are included in the public shell cache. No offline-video support, backend or new dependency was introduced.

See `docs/SCREENING_ROOM_IMPLEMENTATION.md` for content entry, source layout, film integration, exact preview URLs, reference capture commands and limitations. Private media delivery, final content and real iPhone rehearsal remain unresolved release requirements.

### ADR-009 correction — cinema journey, playback destination (2026-10-18)

The owner corrected the final composition: the seated cinema is an **arrival**, not the final cinematic frame. `screening-arrival` preserves that artwork. `screening-endframe` now renders only a viewport-filling illuminated projection surface. Begin/Resume pushes from the architectural screen into that surface and reveals the independent playback layout; reduced motion cuts immediately. An eventual entrance film ends directly at this destination.

Portrait playback uses full-width intrinsic-aspect video with controls/details below. Landscape uses a contained video across most of the viewport and a compact toolbar; cinema artwork is absent. CSS orientation queries never replace the HTMLVideoElement or change its source/time. An orientation listener only restores page scroll to the film. Arrival landscape artwork uses cover, never nonuniform scaling. Playlist, completion, persistence, fullscreen and membership navigation are unchanged.

### ADR-009 refinement — one cinematic playback interface (2026-10-18)

The inline HTML5 video keeps `playsInline`, tap-triggered sound and the existing persistence/navigation contracts, but disables native controls to remove duplication. A single custom strip provides transport, one seek bar and sender identification. Secondary viewing actions and return navigation live in a native modal options dialog. Portrait video and controls fit the application viewport; tall sources scale down only when required to keep controls visible. Landscape video fills the viewport with a tap/keyboard-revealed overlay that fades during playback. Focus, pause, errors, end states and reduced motion preserve control access.

End-of-message UI belongs to the player and replaces its controls. It never changes the selected message until Watch Next, Replay or a collection selection is tapped. The room continues to own playlist/progress and all-message completion. Native iPhone fullscreen remains an optional browser presentation, never a prerequisite for enjoyable viewing. Arrival artwork, final-frame preview and camera push remain unchanged. Routine PWA footer status is deferred until leaving playback so it does not add vertical scroll; service-worker state remains mounted.

## Grand Casino and the prize engine (ADR-010, 2026-10-18)

Built on the owner's explicit request, overriding AGENTS.md's "do not build the casino" for the casino only. The Gift Vault is NOT built; only its contract is.

**Two features, one direction of dependency.** `src/features/prizes/` is the club-wide prize engine and knows no game: games report named counters (`roulette.wins`), a reward declares `eligibility` conditions over counters and over other rewards (`awarded` / `claimed`), and the pure ledger (`ledger.ts`) decides what is awarded. `src/features/casino/` depends on `prizes/`, never the reverse, except that `prizes/clubRewards.ts` aggregates each experience's catalogue (today only `casino/config/casinoRewards.ts`). Winning a game and receiving a unique prize are separate steps: a win bumps counters; only the ledger awards, and `grants` is keyed by reward id, so a one-time reward cannot be awarded twice and a claimed reward cannot be downgraded. Awarded rewards are `unclaimed` until Alise claims them in the reveal (or the collection sheet); the House Favour requires two _claimed_ rewards, so claims can chain awards.

**Persistence.** Two versioned `localStorage` records: `thirty-club:prizes` (`{version, counters, grants}`: the shared ledger a future Gift Vault reads) and `thirty-club:casino` (`{version, chips, spins, visits, soundOn}`: game-local). Both degrade to fresh state on corrupt, missing or foreign-version data, repair field by field, drop unknown reward ids and read "claimed without a timestamp" as unclaimed. `migrate()` upgrades one version at a time and refuses newer versions (they read as empty; the app does not overwrite them until the next save, an accepted single-user limitation). No migration exists yet because the schema has never changed; the mechanism is unit-tested with injected migrations. Writes happen ledger-first. Previews (`?preview=casino-*`) use in-memory stores.

**Outcome before animation.** `playRoulette`/`playSlots` resolve everything (outcome, chips, counters, awards) and the UI saves it BEFORE any animation starts. A refresh mid-spin therefore lands in a finished, consistent state and the unclaimed prize simply re-appears. Scripted outcomes (`config/casinoRules.ts`) are addressed by the persisted number of spins already played, so they can neither replay nor skip. Roulette script: win, lose, win, lose, win, then fair random; a step that cannot be honoured (a slip that covers every number cannot lose) falls back to random. Slots script: pair, miss, miss, triple, miss, miss, then the jackpot on spin 7; after the jackpot has paid it is never offered by chance. Slot outcomes are chosen as a class, converted to reel stops, and re-evaluated from those stops, so the reels cannot disagree with the engine. Both games have a spin limit per device (80) and a chip top-up; no real money exists anywhere.

**Animation is derived, not simulated.** `scene/casinoMath.ts` (pure) plans each spin from the engine's result: the ball's world angle is a decelerating run that ends exactly on the winning pocket for any wheel start angle, then rides the pocket while the wheel coasts; reels use a ramped velocity profile whose travel is an integer count of symbols congruent to the stop. Unit tests assert that for every pocket and every stop the animation ends on the engine's answer.

**3D.** One scene, one WebGL context: the roulette wheel (a 37-pocket head in the correct European order, frets, cone, turret, ball) and the slot machine (three textured reels, lever, lamps) live in the lobby itself and the camera travels to them along Catmull-Rom paths chosen in open floor. The scene is lazy (`CasinoCanvas`, ~15 KB gzip, sharing three.js with the entrance and lounge), disposes everything and forces context loss on unmount, uses the existing quality tiers and the poster/fallback pattern, and the whole room is textured procedurally (no downloaded assets); only the entrance's CC0 walnut scan is reused. If WebGL is unavailable or too slow, both games remain playable in a flat fallback (a wheel that turns to the engine's pocket, reels that stop on its symbols), honestly without the theatre.

**Assets.** Every optional bespoke asset is named in `config/casinoAssets.ts` with suggested size and placement; `src: null` uses the procedural stand-in, and a missing or failing file always falls back. An optional 9:16 entrance film is wired (skip, session-once, reduced-motion skip, failure fallback) but ships disabled.

**Dev-only.** `src/features/casino/dev/` (state seeds and the tools panel: reset, force a roulette number or slot class, award a reward, completed state, inspect JSON) is reachable only through `import.meta.env.DEV` branches and is absent from production builds. Previews are `?preview=casino-lobby|casino-roulette|casino-slots|casino-jackpot|casino-completed`, listed in the dev menu.

**Gift Vault contract.** `prizes/vaultContract.ts` exposes `createPrizeReader(storage, catalog)`: `rewards()`, `claimed(kind?)`, `vaultGrants()` (claimed vault codes only), `isVaultUnlocked(vaultId)`, `matchCode(vaultId, code)`. The vault must use this and not import games.

**Unresolved questions.**

- Unlock codes live in the client bundle, so they are discoverable. This is acceptable for a ceremonial surprise and unacceptable for anything of real value; ADR-003 still requires the deferred backend before valuable redemptions.
- Placeholders awaiting the owner (flagged `placeholder: true`): the Croupier's Clue text, the Vault Key code `TC-0000` and vault id, and the House Favour privilege. Reward names, the chip economy, the scripts and the spin limits are provisional creative choices.
- The Thirty Club emblem on the reels is a stand-in star-in-ring until the real emblem exists.
- Casino opening time is still the provisional 2 pm Jamaica time in `schedule.ts` (D02).
- Real-iPhone performance of the casino scene has not been measured (software-rendered Chromium only).

## Private owner rehearsal (ADR-011, 2026-10-18)

The owner explicitly requested a hardcoded four-digit convenience PIN and production testing without a backend. `features/owner/` owns the hidden five-tap gesture, native modal control panel and session-scoped storage selection. Five completed clicks (including touch taps) within a rolling three-second window activate the panel. The fallback timepiece handles these directly; the 3D entrance projects the clock plate corners into a transparent HTML touch target each frame. There is no additional visible guest control.

The existing five progress stores use one storage adapter: guest documents retain their existing localStorage keys; authenticated owner documents use sessionStorage under `thirty-club:owner:`. The optional casino-film session marker is also isolated. The adapter snapshots authorization at document creation, and authentication/exit/mode changes reload the document so asynchronous owner cleanup cannot switch to guest records. Storage failure never falls through from owner to guest. Standard page-session storage preserves reloads and ends with tab closure; browser session restoration may restore it (see `docs/OWNER_ACCESS.md`). Explicit Exit removes authorization and test records.

Owner environments supply a shifted clock and isolated records to existing entrance/club hooks. Birthday preview starts five seconds before device-local midnight; locked rehearsal starts a day before. Direct access seeds only the owner's entrance/membership records and advances its clock beyond scheduled rooms in every supported time zone. The actual countdown date, guest room rules and serializers are unchanged. Reset clears only owner progress. The room list derives from built registry entries.

Casino test controls are now a lazy chunk available to development builds or authenticated owner documents, with owner styling and accurate test-only labelling. Other development previews, debug globals, synthetic media and look-development controls remain behind their original DEV checks. The reused casino test state helpers are intentionally bundled for owner testing. This supersedes ADR-010's blanket statement that all casino tools are absent from production. Client code and the PIN remain inspectable; this gate adds no server authority or private-asset protection.

## The Concierge: pre-birthday journey and backend (ADR-012, 2026-10-18)

Full plan, data model and operations: `docs/CONCIERGE.md`. This record lists the binding decisions.

**First backend.** This is the first server code, which ADR-003 deferred. It is the smallest maintainable shape: one Netlify Function serves `/api/*` (`netlify/functions/api.ts`), a Scheduled Function runs every minute (`concierge-dispatch.ts`), and Netlify Blobs (store `concierge`, strong consistency) is the only storage. There is one new runtime dependency, `@netlify/blobs`. The service core (`netlify/concierge/`) is framework-free with injected store, channels and clock. The same handlers run in tests, in the Vite dev server and in Playwright (`build/conciergeLocalApi.ts`, in-memory store and fake channels, never part of the build).

**Authority.** The service is authoritative for credentials, privilege release (its clock) and redemptions. Redemptions are written create-if-new, so a privilege can never be redeemed twice. Retries with the same idempotency key return the same record; a different key gets `409` and the standing record. Delivery to Arron is recorded separately (`delivered | pending | failed | unconfigured`). Only a provider-confirmed send is `delivered`; failures retry with backoff (10 attempts), then the owner console can resend. The website never claims Arron was informed unless the service says `delivered`. Offline redemption requests are kept as explicit pending intents with a stable idempotency key, shown as "awaiting a connection" and never as redeemed (the policy ADR-003 asked for).

**Credentials and sessions.** NFC tags carry plain URLs (`/c/<token>`) that iPhones open in Safari: no Web NFC. Manual codes are the fallback. Both are bearer secrets compared in constant time, and failed attempts are rate-limited per IP. A recognised credential yields an HMAC-signed session (`realm`, `scopes`) kept in localStorage, so the physical credential is needed only once per device. The website decodes but cannot verify sessions, so client-side gates remain ceremonial. Secrets exist only in Netlify environment variables; the optional `VITE_MEMBERSHIP_*_SHA256` offline digests are documented as ceremonial.

**Notifications.** Arron: Telegram Bot API (free, no onboarding, reliable iPhone push). Alise: manual by default (Telegram hands Arron the text to forward), or Twilio SMS with the alphanumeric sender `ThirtyClub` when `ALISE_DISPATCH=sms`. WhatsApp automation was rejected for now: business verification and template approval cannot be relied on before 22 October. Scheduled messages are claimed create-if-new before sending, so they go out once.

**Owner isolation.** This is separate from, and complementary to, the PIN owner test mode of ADR-011. That mode is client-only and session-scoped, and rehearses rooms. This one rehearses the server journey. A `rehearsal` realm has separate records and a virtual clock carried in the signed session. On the device, rehearsal keys (`thirty-club:rehearsal:*`) keep the live entrance and membership records untouched. The owner console requires `CONCIERGE_OWNER_KEY` server-side; its bundle holds no secret. Rehearsal notification behavior is amended by ADR-013 below.

**Birthday gate (amends ADR-006 and ADR-008).** The countdown now targets **24 October 00:00 America/Jamaica** whatever the device zone, because a London-time phone would otherwise have opened at 6 pm on Friday in Jamaica. The birthday establishes eligibility; the membership card completes the ceremony. The new stage `awaiting-credential` holds the doors (bolt home, seam breathing) with the butler's riddle and a manual recovery. Presenting the card (its `/c/` link, the printed number, or detection by a paired display) plays the existing ceremony. Scheduled rooms keep their times but now also require the membership (`isOpen`), so a direct link cannot skip the ceremony. In ADR-011's PIN test mode the card counts as presented for the birthday and open previews (absent in its locked preview), and its birthday preview now starts five seconds before Jamaica midnight. The Casino's 2 pm Jamaica unlock is otherwise unchanged.

**Departure Lounge presentation.** 2.5D, with no Three.js: CSS gradients, one rasterised noise tile, inline SVG wax seals and ink stamps. Animation uses transform and opacity only, with reduced-motion cross-fades. It is a lazy chunk (~8 KB gzip JS). Privileges come from a configurable catalogue (`concierge/domain/catalogue.ts`). Release times move through `PRIVILEGE_*_OPENS_AT` or the owner console without a deploy.

**Open questions.** In-flight release time and flight Wi-Fi; which riddle matches the hiding places; Friday wording and time; whether to provision Twilio; the membership number printed on the card. No deploy, real Telegram/Twilio call or physical NFC/iPhone test has happened yet; these are release gates.

## Owner menu and silent concierge rehearsal (ADR-013, 2026-10-18)

The PIN owner's Visit a room list has a direct Departure Lounge entry. It opens the existing server-key console with a one-time `start=departure` intent; after that key is accepted, the console issues a signed rehearsal session at Thursday 22 October 14:01 UK and opens `/departure` without presenting the travel credential. This preserves the NFC and boarding ceremony for preview. The console has its own shortcut from the same menu. The PIN alone does not grant server authority. Ordinary visitors and the live realm keep their date and credential gates.

Rehearsal redemptions now record `simulated` delivery without invoking a channel, and their UI says no notification was sent. Rehearsal activation notes, scheduled/manual sends and direct Telegram channel calls are suppressed. Live delivery remains unchanged. Ending or resetting PIN owner mode ends the device's concierge rehearsal session; the server's rehearsal records can be cleared in the console.

## ADR-013 (2026-10-18): the 3D entrance no longer abandons a playing scene for being slow

**Problem.** On an iPhone-profile WebKit the entrance rendered, then reverted to the poster seconds later. Reproduced against the previous build (`39b07d1`) in Playwright WebKit (iPhone 14 profile, DPR 3, verification skipped, so the overlay is not involved): the scene dissolved in at about 3 s and the poster returned at about 9 s.

**Cause.** The performance governor stepped quality down twice (47 ms then 33.3 ms per frame, i.e. a vsync-quantised 30 fps) and then treated 30 fps at the lowest tier as failure, returning the poster. Any iPhone that delivers about 30 fps (Low Power Mode, a heavy page, a busy GPU) would do the same.

**Decision.** `judgeFrameTime` falls back only when frames are unwatchable (over 200 ms). Context loss gets a recovery window. Both are shared with the lounge and casino scenes through `sceneMath`. Diagnostics and `?entrance-diag` were added. **Limits:** no real iPhone has run this; headless WebKit approximates it.

## ADR-014 (2026-10-18): PostgreSQL authority and Butler's Office

The owner selected Supabase and Netlify Functions for the production backend. Dedicated Supabase project **The Thirty Club**, London (`fzndcjzenodcixmuvfsb`), replaces Blobs as authority for new v1 members, privileges, monetary claims, vouchers and SMS outbox. `/api/v1` is isolated from existing cinematic/rehearsal interfaces. PostgreSQL transactions, unique constraints and row locks enforce idempotency, single-use claims and nonnegative balances. Tables have RLS and no anonymous/authenticated Data API access; only server service-role calls execute the restricted RPCs. No service-role key enters a Vite variable.

Opaque hashed database sessions are revocable: owner password checked with scrypt server-side, member single-use random invitation exchange. Cookies are HttpOnly/Secure/SameSite Strict; mutations require same-origin checks and a custom header. The cinematic verification, owner rehearsal PIN, device clock and legacy signed rehearsal sessions grant no v1 authority. Contract: `docs/CONCIERGE_API_CONTRACT.md`; shared types: `src/shared/concierge/types.ts`.

SMS uses the existing Twilio Messaging Service, approval records, a global disabled-by-default switch and transactional outbox. A valid claim commits before dispatch. Definite failures retry with backoff; ambiguous delivery is held for reconciliation to avoid duplicate sends. Room unlocks do not consume SMS state. Existing Casino visuals remain intact; authoritative plays/outcomes have a documented API integration point.

### ADR-014 implementation and legacy cutover

The dedicated project has six applied migrations, mirrored exactly in `supabase/migrations/`. New v1 data always uses PostgreSQL. Existing cinematic concierge records retain their Blobs adapter until an owner runs the guarded, paginated copy/verification tool and selects `CONCIERGE_LEGACY_STORAGE=postgres`; this prevents loss of pre-existing records during deployment. The legacy API, client rehearsal and room unlocks retain their established interfaces. The scheduled worker exclusively processes the new approved PostgreSQL outbox, so earlier provisional schedules cannot send accidentally.

The owner can explicitly approve future transactional claim notifications to Arron through a persistent policy; the initial policy is disabled. Every scheduled Alise message requires individual approval. Both paths additionally require the global SMS switch. Callback URLs carry both message and attempt identifiers, and signed old-attempt callbacks cannot corrupt a newer retry. Ambiguous external sends remain held for provider reconciliation. Service-only RLS policies and revoked browser-role RPC/table privileges were checked on the dedicated hosted project.

Owner operations use an eight-hour opaque cookie session and Alise uses a single-use high-entropy invitation with a thirty-day session. A local PostgreSQL adapter is available only in the build tooling for browser rehearsals; it cannot contact providers. The existing Casino engine is reused server-side for reward-authoritative play outcomes; wiring those outcomes into the Casino UI is the documented frontend integration task.

## The Private Gift Vault (ADR-015, 2026-10-18)

Full design, API and operations: `docs/GIFT_VAULT.md`.

**Authority.** The vault is built on the PostgreSQL backend of ADR-014, not on Netlify Blobs: a new table `ttc_vaults` and a separate service-role-only RPC `ttc_vault_action` (`supabase/migrations/20261019090000_gift_vault.sql`), leaving `ttc_action` and every privilege, slots, SMS and Shopping path unchanged. The server alone decides availability, credential validity, the birthday time-lock (24 Oct 00:00 America/Jamaica, `ttc_vault_opens_at()`), and whether a clue (READY) or gift location (OPENED) may be returned. States LOCKED → READY → OPENED; OPENED is permanent; opening takes a row lock so concurrent scans open once; repeat scans are idempotent. The physical present's identity is never stored: only a free-text location.

**Credentials and identity.** Each compartment has a 256-bit NFC token (in `/v/<token>`) and a backup code, compared by SHA-256 hash and rotatable; failed guesses are rate-limited per IP. A key is proof of finding the tag, never of identity: opening also requires a v1 member cookie. Because Alise holds no v1 invitation, `POST /api/v1/auth/member/concierge` exchanges her existing live-realm concierge session (ADR-012, HMAC-verified server-side with `CONCIERGE_SESSION_SECRET`) for one; rehearsal-realm sessions are refused.

**Room access (amends ADR-008).** The room's unlock rule is `membership` (open from the birthday induction, all day), replacing the provisional 18:00 Jamaica schedule, which was removed from `schedule.ts`. Compartments keep independent availability (manual, scheduled instant, casino reward). The lounge announces the vault once alongside the induction.

**Navigation.** `/v/<token>` holds the key in `localStorage` (6 h expiry) and the history entry, then replaces itself with `/vault`, a route outside RoomGate so an NFC scan in a fresh Safari context reaches the vault directly; `/rooms/gift-vault` is the lounge's way in. The server commits the opening before the ceremony, so interrupted animations cannot corrupt progression.

**Owner.** Extends the Butler's Office (`/owner`, existing secure session) with a vault tab; no second admin system. Preview (`/owner/vault-preview/:id`) uses one read-only owner GET and makes no member call, so it cannot mutate state, consume credentials, notify or grant anything.

**Presentation.** A lazily loaded Three.js chamber reusing the entrance's helpers, scans, post-processing, quality tiers and fallback rules; the CSS chamber is poster and complete fallback.

**Casino.** Server contract only: a server-recorded slots jackpot releases compartments bound to `casino.vault-key-one`. The casino frontend still plays slots locally and never calls the server play API, so the trigger is not live (see `docs/GIFT_VAULT.md`).

**Open questions.** Applying the migration to the hosted project and deployment (owner approval); real NFC/iPhone rehearsal; owner approval of Butler and letter wording; who connects the casino frontend to the server play API. ADR numbering: an unpublished desk draft in the original checkout also uses ADR-014; this record is ADR-015 to avoid colliding with either.

### Release integration questions (18 October 2026)

The release candidate carries ADR-014 and ADR-015 without changing their storage boundaries. `CONCIERGE_LEGACY_STORAGE` must stay blank while Shopping's redeemed record remains only in Netlify Blobs. The new scheduled worker intentionally omits legacy scheduled messages and retains legacy notification retries. Arron must choose whether each upcoming travel announcement is sent manually from the legacy console or approved through the PostgreSQL outbox before deployment. The global `SMS_SENDING_ENABLED` switch controls only that outbox; the existing Shopping POST and explicit legacy Send now paths retain their own behavior.

The divergent local `main` desk draft defines separate `public.members`, `public.privileges`, and `public.scheduled_messages` tables while the integrated backend uses `ttc_*` tables. No desk migration from that checkout belongs in this candidate without a schema reconciliation. The completed Correspondence feature started at `bccce30` and is being integrated from committed `a3f8a1b` in a separate release worktree. See `docs/RELEASE_CANDIDATE_2026-10-18.md` for the earlier audit and merge order.

## The Correspondence Desk (ADR-016, 2026-10-19)

Full design, API and operations: `docs/CORRESPONDENCE_DESK.md`. Branch `feature/correspondence-desk` from `integration/gift-vault-backend` `bccce30`; integrated only into the isolated local release candidate, not deployed.

**Authority.** PostgreSQL, through a separate service-role-only RPC `ttc_correspondence_action` and new tables `ttc_letters` and `ttc_letter_replies` (migration `20261020090000_correspondence_desk.sql`). `ttc_action` and `ttc_vault_action` are untouched. The only change to an existing object is the widened `ttc_messages.category` CHECK, which adds `correspondence-alise` and `correspondence-arron`. The server alone publishes (its clock), records openings and thanks, and stores messages. Letters are `draft → scheduled → published`, with `opened_at` and `thanked_at` as stamps; SMS state lives only in the outbox, so a failed SMS never affects a letter.

**One scheduler.** Due letters are published by the existing every-minute `concierge-dispatch` round, before its outbox half, using `FOR UPDATE SKIP LOCKED`. They are also published lazily on any correspondence read. The invitation is queued in the same transaction, with a unique reference, so it is queued exactly once. No new scheduled function exists.

**SMS.** Invitations, thank-you replies and notifications to Arron are approved outbox messages, gated by the existing `SMS_SENDING_ENABLED` switch. The existing claim/backoff/uncertain/callback handling is reused unchanged. `recipientFor` maps each category to exactly one phone; an unknown category fails rather than defaulting. Wording is centralised in `src/shared/correspondence/templates.ts`. An SMS to Alise still unsent after six hours is marked failed; owner retry requeues only failed or cancelled messages, never uncertain ones.

**Member identity.** A v1 member cookie, the existing live-concierge bridge, or a one-time owner invitation link (`/correspondence#invitation=`, the fragment consumption anticipated by the API contract). No membership-card entry is offered, because presenting the card before 24 October would complete the birthday card ceremony early. `/correspondence` is outside RoomGate and writes no club record, so it opens before the birthday and unlocks nothing.

**Presentation.** CSS and SVG only (no Three.js, no new dependency), transform and opacity motion, reduced-motion cross-fades. Lazy route chunks; the arrival notice is lazy too.

**Open questions.** Owner approval of the six-hour expiry, the reply rate limits, the default salutation and the Butler's on-screen lines. An authorised real SMS exchange and an iPhone rehearsal remain release gates.

### Local consolidation decision (19 October 2026)

The completed Correspondence commit `a3f8a1b` is merged only into `codex/release-candidate-correspondence-2026-10-19` from the prior candidate `9bea495`. The reviewed migration order is the six already-hosted backend migrations, then Gift Vault `20261019090000`, then Correspondence `20261020090000`, before deploying the combined code. The old Shopping path remains Blobs-backed while `CONCIERGE_LEGACY_STORAGE` is blank. The divergent local `main` desk schema is excluded. Disposable upgrade/role checks and release gates are recorded in `docs/RELEASE_CANDIDATE_2026-10-19.md`; hosted changes remain owner actions.

## The Butler's Service (ADR-017, 2026-10-19)

Full design, API, rehearsal and preview: `docs/BUTLERS_SERVICE.md`. Branch `feature/butlers-service-2026-10-19` from the consolidated candidate `877fbb8`; not merged, pushed or deployed.

**Three interfaces.** The member experience delivers, the Owner Console (`/owner`) operates, Dev Mode rehearses. They share presentation components only; Dev Mode never reaches owner APIs.

**One service, two rooms.** `src/features/butler-service/` owns the Butler's menu, the translucent correspondence overlay, the request composer and the envelope at the doors. The locked entrance and the Members' Lounge host it through their existing bells and the Butler's existing voice (the bell's speech area; the lounge's `say`). He greets once per newest unread letter per tab, and only when the host allows (locked stage and a settled render; inducted lounge with no sheet), so ceremonies are never interrupted. The overlays are a lazy chunk rendered in a portal that makes the rest of the page inert. The letter is the existing `LetterPresentation`; `/correspondence` routes are unchanged. The previous arrival notice is removed.

**Authority.** A separate service-role RPC, `ttc_service_action` (migration `20261021090000_butlers_service.sql`). Requests from the bell reuse `ttc_letter_replies` with a null `letter_id` (the only change to an existing table, plus a nullable `resolved_at`), sharing the Desk's idempotency and limits. `ttc_request_responses` links SMS or Desk letters to a request; `ttc_direct_messages` lists Arron's direct Butler SMS. Every SMS is an approved message in an existing category (`correspondence-alise`/`-arron`), so the existing dispatcher, expiry, retry rules and `SMS_SENDING_ENABLED` apply without change. Resolution is only ever Arron's action.

**Dev Mode.** While the PIN rehearsal is active, `activeDesk` is `rehearsalDesk`: letters and requests in session storage under `thirty-club:owner:`, no network calls. The Dev disc moved to the top-left so it never covers the lounge heading.

**Navigation.** The registry gains `departure-lounge` (always open, built, path `/departure`, never recommended): the directory lists it after the birthday, and the locked doors offer it through the Butler's invitation. The Departure Lounge keeps its own schedule and credential. A panoramic, camera-swivelling lounge is recorded as a future enhancement only.

**Open questions.** Owner approval of the Butler's lines and the request notification text; the 60-day scheduling window; a physical iPhone rehearsal; an authorised real SMS exchange; applying the migration after `20261020090000` on the hosted project.

## Owner Control Centre and the rehearsal engine (ADR-018, 2026-10-19)

Full design: `docs/REHEARSAL.md`. Branch `feature/owner-control-centre` from production `1a3be93`.

**One dashboard, two worlds.** `/concierge/owner` is the canonical Owner Control Centre. LIVE (`/concierge/owner`) holds the existing Butler's Office (all its tabs) and the existing Concierge console, unchanged, with their existing server authentication. `/owner` redirects there (`?tab=` preserved); `/owner/vault-preview/:id` still works. TEST (`/concierge/owner/test`) holds the same two consoles plus the rehearsal engine, answered by a simulated office in the browser.

**Supersedes ADR-011's shifted clock and ADR-017's `rehearsalDesk`.** The PIN Dev Mode is now a rehearsal launcher. A page's world (LIVE or rehearsal) is fixed when it loads; LIVE owner paths are never simulated, even in a Dev Mode tab, and crossing worlds reloads the page. On rehearsal pages `fetch` is wrapped before render: same-origin `/api/` calls go to the simulation (fail closed), provider hosts are refused. The simulation runs the real `netlify/backend` and `netlify/concierge` handlers with the real migrations in PGlite (IndexedDB), a rewritten `now()` that follows one rehearsal clock, auto-signed simulated owner/member sessions in tab storage, fake providers and the existing test credentials. `deviceStorage()` maps `localStorage` users (concierge session and record, vault key and announcements, concierge owner key in TEST) to tab session storage on rehearsal pages. Nothing in the browser holds a real secret; the Shopping ceiling is replaced by a stub in the browser bundle.

**Why not route guards.** Launches move the rehearsal clock to the room's real opening and create its prerequisites (card, induction, compartments, concierge session), so the actual gates, schedules and server logic are exercised.

**Costs and limits.** PGlite (~17 MB raw, ~5 MB compressed) is downloaded only by owner rehearsal pages and excluded from the PWA precache (`rehearsal-*` chunks). Main bundle +5 KB gzip. Not yet run on a physical iPhone. Owner sign-in in TEST is simulated; LIVE is the real password.

**Open questions.** Whether the old `/concierge/owner` default section should be the concierge console rather than the Butler's Office (currently Butler's Office; `?section=concierge` deep-links the console). Physical iPhone memory headroom for PGlite alongside the 3D vault.

## The birthday screening (ADR-019, 2026-10-19)

Supersedes ADR-009's multi-message collection and custom player. The owner assembles one continuous film in CapCut (AI introduction, guests' messages, AI ending); the room is its cinematic wrapper. Handover, CapCut settings and device steps: `docs/SCREENING_ROOM_IMPLEMENTATION.md`.

**One configuration point.** `src/features/screening/config/screeningFilm.ts`: `BIRTHDAY_FILM` (`null` until supplied) and `TEST_FILM` (a real five-second H.264/AAC MP4 in `public/media/screening/`, generated by `tools/create-screening-test-film.swift`). `resolveFilm(rehearsal)` returns a valid birthday film everywhere; otherwise the test film only on rehearsal pages (`simulationActive`, ADR-018) and the local dev server (`MODE === 'development'`), and `null` for LIVE guests and unit tests. A film must be same-origin or `https://` and `kind: 'birthday'` to reach LIVE. With `null`, LIVE shows the poster and "Your screening is being prepared." with no control and no `<video>`, so the test film can never be presented to Alise as her screening.

**Playback.** A normal `<video controls preload="metadata">`, deliberately not `playsinline`: on iPhone, `play()` inside the tap opens the native fullscreen player. Elsewhere `video.requestFullscreen()` follows `play()` in the same synchronous handler; a refusal or missing API leaves the film filling the viewport (theatre layout) with native controls. The push-in is CSS that follows the tap; no animation or promise precedes the play/fullscreen requests. No Three.js video texture, no custom controls, no forced orientation, no JavaScript-embedded media, no precaching or runtime caching of video.

**Lifecycle.** `ended` → exit fullscreen where permitted, restore the seat, the Butler's closing line (first natural end) or encore line, count the completion once per playback and stamp the club record (idempotent `stampRoom`). `webkitendfullscreen`, `fullscreenchange` leaving fullscreen, Escape or "Leave the screening" before the end → pause, keep the place, no completion; within 0.25 s of the end it is treated as the natural end (iOS can close its player before `ended`). Errors and refused `play()` return to the seat with an honest notice. A per-playback `settled` flag makes every path idempotent.

**State.** `thirty-club:screening` version 2 (`enteredAt`, `introducedAt`, `plays`, `completedAt`, `completions`, `resume {filmId, seconds}`), through the existing `progressStorage` (guest `localStorage`; owner tab session storage in Dev Mode). Writes are applied synchronously through a ref and saved on every action so a frozen or refreshed page keeps the place. Version 1 records read as fresh. Local and non-authoritative (ADR-003).

**Escort.** The Lounge's entry to the Screening Room (guide, Directory, 3D doorway) no longer cuts: the Butler speaks, the 3D camera eases to a new `escort` shot near the doorway, a black veil fades in, the room chunk is prefetched (`club/ui/roomViews.ts`, `preloadRoom`), and navigation follows at 2.3 s (0.4 s reduced motion); the room fades in from black. `RoomGate` is otherwise unchanged; its screening fallback is dark so no white page flashes between.

**Rehearsal.** New launch `screening-journey` (Lounge, first visit: clears the rehearsal screening record and the room's visit/completion stamps). `resetRoom('screening-room')` now also clears those stamps. Existing gates, the midnight unlock and LIVE/TEST isolation are unchanged.

**Open questions.** Owner approval of the poster wording and the Butler's lines (PROVISIONAL); where the final film is hosted (committing a private film needs an explicit decision; GitHub rejects files over 100 MB); a physical iPhone rehearsal of native fullscreen, auto-close at the end, audio with the ringer switch and rotation.

## The birthday journey (ADR-020, 2026-10-19)

Branch `feature/birthday-journey` from production `origin/main` `54b9cf2`; worktree `../the-thirty-club-journey`. Not merged or deployed. Operations: `docs/BIRTHDAY_JOURNEY.md`. Contract with the Casino/rewards work (Codex): `docs/BIRTHDAY_JOURNEY_INTEGRATION_CONTRACT.md`.

**One lifecycle for every exclusive room.** `lounge`, `screening-room`, `casino`, `gift-vault` and `privileges` are LOCKED (no row) → INVITED → ADMITTED in `ttc_room_admissions`, decided only by the server (`ttc_journey_action`, migration `20261022090000_birthday_journey.sql`). ADMITTED is permanent: there is no revoke, and withdrawing is possible only while INVITED. Acceptance takes a row lock, so repeats and concurrent taps admit once (`duplicate: true`). The Grand Entrance and the Departure Lounge keep their own gates.

**Amends ADR-008/012/015/019 (room opening).** Inside the application, `roomViews(now, record, rooms, access)` ignores the schedule and the device's `unlockedAt` latch for admission rooms: open = admitted, and hidden until then. `schedule.ts` hours remain only as the fallback for components rendered without the journey provider (unit tests). The Gift Vault's NFC path (`/v/<token>` or a held key) still goes straight in, because the physical key is the proof and the server decides each compartment. A keyless `/vault` needs the admission.

**Enforced in routing.** `JourneyProvider` (app root, not on owner pages) reads `GET /api/v1/journey`, refreshing on focus, visibility, `online` and every 60 s. `AdmissionGate` wraps `RoomGate` and the keyless `/vault`: ADMITTED renders, INVITED redirects to `/lounge?admission=<room>`, LOCKED shows a notice that names nothing, and loading shows "One moment…". A small device cache (`thirty-club:journey` via `deviceStorage`) remembers only server-confirmed admissions and waiting letters, so admitted rooms stay open on a dropped hotel network. Acceptance is never offline. Client gating is ceremonial, as everywhere in this SPA (ADR-003); the server guard `ttc_room_admitted()` is what other systems' server actions must check.

**The Lounge before the doors.** `/lounge` renders the existing Lounge outside the entrance stage machine when the Lounge is admitted, when a Letter of Admission waits, or once inducted. This supports the founding membership (20 October) and the Casino ceremony (23 October), both before the birthday doors. The doors' midnight ceremony is unchanged. The Lounge's `model` prop narrowed to the four fields it uses.

**Butler delivery reuses the Correspondence Desk.** Every journey letter is a `ttc_letters` row published at once through `ttc_letter_publish`, so unread/opened state, the envelope at the doors and in the Lounge, My Correspondence, the invitation SMS through the approved outbox (sent only while `SMS_SENDING_ENABLED`), and owner SMS retry all apply unchanged. New nullable columns `journey_ref` (unique idempotency reference), `action_kind`, `action_room` and `action_label` give the letter its button. `ttc_letter_member_json`/`ttc_letter_owner_json` were redefined to add `action` (additive). Accepting an admission marks its summons letter opened and cancels its unsent SMS.

**Milestones.** `ttc_journey_milestones` (`pending | held | fired | failed`, effects `invite-room | letter | hook`). Fired by the existing every-minute `concierge-dispatch` round (now: journey first, then letter publication, outbox and legacy retries; each isolated) and lazily on any journey call, with `FOR UPDATE SKIP LOCKED` and a state guard, so each fires exactly once. Each fire runs its effects in one sub-transaction: an error rolls them back and marks the milestone failed, and retry reuses the same idempotency keys. No client timer is a source of truth. Defaults are seeded with `on conflict do nothing`: room invitations armed, wording-dependent letters and the Casino-spins hook held.

**Event inbox.** `ttc_journey_events` with unique `(source, idempotency_key)`. Other systems call `ttc_journey_publish()` inside their own transaction (transactional outbox) or `publishJourneyEvent()`. Reactions depend only on current admission state, so out-of-order delivery is safe: spins for a room not yet admitted are `deferred` (the room stays secret) and are delivered after acceptance. Unknown types are recorded. A failed event is visible to the owner and retried on request. Milestones call other systems only through `public.ttc_journey_hook(name, params, key)`, which Codex implements. A missing hook fails only that milestone.

**Owner.** Butler's Office → journey (LIVE and TEST): timeline in Jamaica time, trigger, hold, resume, retry, change time, room introduce/withdraw, letters with SMS state and retry, events with retry, and history (`ttc_activity_events` `journey.*`).

**Rehearsal.** TEST runs the same migration in PGlite. Launches and scenarios admit rooms through the real invite/accept actions (`rehearseAdmissions`). New: *Early membership*, *Casino opening (admission ceremony)*, *The Members' Lounge before the birthday*, *The Grand Casino admission ceremony*; the Screening Room journey starts with its Letter of Admission. Pending milestones appear on the TEST timeline.

**Risks and open questions.** Deploying the code without the migration closes every exclusive room (the gate fails closed). Alise needs a v1 member session before 20 October (the Correspondence introduction link). The milestone times and all Butler wording are provisional. No physical iPhone has run this, and no SMS has been sent. Codex's spin hook and event publication are not yet present.

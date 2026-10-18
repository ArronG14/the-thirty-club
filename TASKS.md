# Implementation backlog

Statuses: **NOT STARTED**, **IN PROGRESS**, **BLOCKED**, **IMPLEMENTED**, **VERIFIED**.
Priority P0 is deadline/critical-path; P1 supports the experience; P2 is optional. Phase names/dates are proposed, not an externally confirmed agreement. VERIFIED applies only to each task's recorded checks.

| Phase / ID | Priority | Status      | Task / acceptance                                                                                                    | Dependencies                | Critical path |
| ---------- | -------- | ----------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------- |
| 1 / F01    | P0       | VERIFIED    | Product, architecture, agent instructions, backlog and journal                                                       | Brief                       | Yes           |
| 1 / F02    | P0       | VERIFIED    | Strict React shell, routes, Tailwind, Zustand, lint and tests                                                        | F01                         | Yes           |
| 1 / F03    | P0       | VERIFIED    | Manifest, icons, worker, readiness/update UI; offline browser check                                                  | F02                         | Yes           |
| 1 / F04    | P0       | VERIFIED    | All foundation checks and handoff                                                                                    | F03                         | Yes           |
| 2 / D01    | P0       | IN PROGRESS | Approve creative direction and iPhone interaction prototype                                                          | F04, owner input            | Yes           |
| 2 / D02    | P0       | NOT STARTED | Confirm butler script, media inventory, prizes, member number, phone/iOS                                             | Owner input                 | Yes           |
| 2 / E01    | P0       | VERIFIED    | Grand Entrance: locked doors, timepiece, butler, final minute, midnight, foyer                                       | F04                         | Yes           |
| 2 / D03    | P1       | NOT STARTED | Define motion/accessibility/performance budgets                                                                      | D01                         | No            |
| 3 / I01    | P0       | NOT STARTED | Invitation and scripted butler initiation                                                                            | D01, D02                    | Yes           |
| 3 / I02    | P0       | IN PROGRESS | iPhone install guidance and membership card (card done; install guidance not)                                        | I01                         | Yes           |
| 4 / L01    | P0       | IMPLEMENTED | Members' Lounge navigation and butler event integration                                                              | I02, D01                    | Yes           |
| 4 / L02    | P1       | NOT STARTED | Cross-feature transition and accessible navigation checks                                                            | L01                         | No            |
| 5 / C01    | P0       | NOT STARTED | Define game/reward contracts and server validation model                                                             | D02, backend design         | Yes           |
| 5 / C02    | P1       | NOT STARTED | Implement selected casino games with deterministic rule tests                                                        | L01, C01                    | No            |
| 6 / B01    | P0       | NOT STARTED | Choose backend/auth/hosting; threat model and recovery design                                                        | D02, owner decisions        | Yes           |
| 6 / B02    | P0       | NOT STARTED | Authoritative entitlements/unlocks/idempotent redemption + integration tests                                         | B01, C01                    | Yes           |
| 6 / B03    | P0       | NOT STARTED | Vault and privileges UI with pending/offline handling                                                                | L01, B02                    | Yes           |
| 6 / B04    | P1       | NOT STARTED | Notification delivery, fallback, organiser tracking                                                                  | B02                         | No            |
| 6 / B05    | P0       | NOT STARTED | Versioned IndexedDB and tested reconciliation/storage failures                                                       | B02, agreed offline policy  | Yes           |
| 7 / S01    | P0       | IMPLEMENTED | Fixed cinema, functional player, collection, persistence and gate integration; real content/device rehearsal pending | L01, D02                    | Yes           |
| 8 / X01    | P2       | VERIFIED    | Temporary developer-only navigation menu (`src/dev/`); removable; absent from production builds                      | E01, L01, S01               | No            |
| 7 / S02    | P0       | NOT STARTED | Secret clues/NFC/QR and physical surprise rehearsal                                                                  | B02, D02, holiday logistics | Yes           |
| 8 / R01    | P0       | NOT STARTED | Real iPhone Safari + standalone online/offline/update/accessibility rehearsal                                        | All selected experiences    | Yes           |
| 8 / R02    | P0       | NOT STARTED | HTTPS deploy, backup/recovery and Jamaica contingency rehearsal                                                      | R01, B01                    | Yes           |
| 8 / R03    | P0       | NOT STARTED | Final content/security checks and reveal before 24 October presentation                                              | R02, confirmed reveal time  | Yes           |

Next recommended task after foundation: D01 creative direction, alongside D02 content/device confirmation. Start B01 design early because authoritative rewards depend on it; no backend implementation is needed for phase 1. Optional games/3D are first candidates for scope reduction.

## Handover and migration gate (before phase 2)

| ID  | Priority | Status      | Task / acceptance                                                                                                                             | Dependencies            |
| --- | -------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| H01 | P0       | VERIFIED    | Audit existing foundation; provide migration/GitHub/Netlify instructions; rerun six application tests and one production offline browser test | F04                     |
| H02 | P0       | NOT STARTED | Copy to ~/Developer/the-thirty-club; verify content parity, Git metadata and checks                                                           | H01, user execution     |
| H03 | P0       | NOT STARTED | Review files, create first commit and connect empty private GitHub repository the-thirty-club                                                 | H02, user authorisation |
| H04 | P0       | IMPLEMENTED | Netlify local routing/headers/build configured; hosted preview and deployment still pending                                                   | H03, user authorisation |

Phase 2 has since started (see the Grand Entrance section below). Complete relocation and repository setup before resuming creative-direction development. Netlify deployment remains pending; H04 preparation does not imply a deployment occurred. See MIGRATION_HANDOVER.md.

## Netlify preparation verification

- **H04 configuration — IMPLEMENTED:** netlify.toml, routing-only Edge Function, explicit API/static error boundary, HTML/manifest/worker revalidation and exact fingerprinted-asset immutable headers. No deploy or account configuration performed.
- **H04 local verification — VERIFIED:** npm run check passed (28 tests, strict types, lint, formatting and production build); npm run test:pwa passed (one Chromium offline test covering navigation, query values, API and missing static resources). TOML and emitted immutable paths were also inspected.
- **H04 hosted verification/deployment — NOT STARTED:** authorised Netlify preview; verify CDN headers/404s, Edge runtime, query/HEAD/conditional requests, cache rotation and iPhone standalone offline/update behavior before production.

The current working repository is `/Users/ag14/Documents/Projects/the-thirty-club`; migration rows above preserve the earlier handover plan, not a fresh copy-parity/remote audit. Existing main commit/origin were observed; this task does not verify remote access or migrate files.

## Phase 2 — The Grand Entrance

- **E01 entrance implementation — VERIFIED** against these checks: `npm run check` (strict types, ESLint, Prettier, 94 Vitest tests, production build) and `npm run test:pwa` (5 Chromium tests: offline precache including fonts, Jamaica local-midnight unlock and ceremony with persistence, London same-instant comparison, production ignoring preview parameters, reduced-motion ceremony). Also visually reviewed in Chromium at 390×844, 375×667 and 1280×800. VERIFIED does not mean approved, and it is not a real-iPhone check.
- **D01 creative direction — IN PROGRESS:** the entrance embodies a concrete direction (palette, typography, motion language). It still needs owner approval on a real iPhone.
- **D02 content — NOT STARTED:** butler script and name, "30" medallion, register wording and member number all need owner approval. No member number is shown.
- **E02 real-device rehearsal — NOT STARTED:** iPhone Safari and standalone, safe areas, reduced motion, final-minute and midnight on device (use the dev preview on a LAN dev server, or set the device clock), performance on an older iPhone.
- **E03 butler and bell sound — NOT STARTED (optional):** a soft bell chime with a silent default. Never essential.
- **Lounge, casino, vault, privileges, screening room — NOT STARTED.** The foyer contains no navigation to them.

## Phase 2B — Cinematic environment redesign

- **V01 art direction and lookdev — VERIFIED:** approved by the owner on 2026-10-18. The prototype page was retired into production code; its frames remain in `docs/lookdev/`.
- **V02 production 3D entrance — IMPLEMENTED:** `src/features/entrance/scene/`, CC0 scanned textures, the poster/fallback layering, overlays, adaptive quality and the ceremony. Checks passed:
  - `npm run check` (106 Vitest tests);
  - `npm run test:pwa` (7 Chromium tests: the 3D scene dissolving in with a working bell, the 3D scene loading offline from the precache, poster-only without WebGL with no chunk request, the reduced-motion poster, Jamaica and London midnight, and no production preview bypass);
  - a visual pass at 390×844 across locked, final minute, bell, midnight, opening, late arrival and foyer.

  Not VERIFIED, because its acceptance includes real-iPhone performance, which has not been measured.

- **V03 iPhone rehearsal and tier tuning — NOT STARTED:** requires the rehearsal device. Covers frame rate and tier behaviour, first-load time on throttled Wi-Fi (1.47 MB precache), WebKit rendering parity, Home Screen standalone mode, the bell hit target and reduced motion.
- **V04 polish candidates — NOT STARTED (optional):** a modelled foyer glimpse instead of the painted interior plane; volumetric light shaft; bell glint on first visit; KTX2 textures; a light-path shader for the seam.

## Phase 4 — The Members' Lounge

- **L01 lounge, membership ceremony and navigation foundation — IMPLEMENTED:** `src/features/club/` (room registry, Jamaica schedule, membership record, unlock rules, butler briefings, room gate) and `src/features/lounge/` (3D lounge, CSS poster, ceremony, card, directory, guidance, dock). Checks passed:
  - `npm run typecheck`, `npm run lint`, Prettier (all files except `EXPERIENCE_BLUEPRINT.md`, see below), 151 Vitest tests and `npm run build`;
  - `npm run test:pwa`: 11 Chromium tests, including the doors handing over to the 3D lounge with a single live canvas, a returning member, the lounge loading offline from the precache, the midnight → ceremony → reload → directory flow on the poster, and reduced motion in the lounge;
  - a visual pass at 390×844 (`docs/lounge/`).

  Not VERIFIED: its acceptance includes iPhone performance and Safari rendering, which have not been measured. `npm run check` as a single command currently stops at `format:check` because Codex's in-progress `EXPERIENCE_BLUEPRINT.md` is not Prettier-formatted; that file was deliberately not touched.

- **L02 iPhone lounge rehearsal — NOT STARTED:** frame rate and tiers, the entrance → lounge hand-off on device, label projection with safe areas, Safari `inert`/focus behaviour, VoiceOver through the ceremony and directory.
- **L03 owner approval — NOT STARTED:** butler lounge copy, card wording ("Founding member · Lifetime", "No. 1 of 1"), the provisional unlock hours (privileges 10:00, casino 14:00, gift vault 18:00 Jamaica time, in `club/domain/schedule.ts`) and room order.
- **S01 Private Screening Room — IMPLEMENTED (superseded by Prompt 05 below):** The guided destination is registered and built. The directory and butler offer it automatically; all-message completion stamps the club record. See Prompt 05 below.
- **Lounge polish candidates — NOT STARTED (optional):** modelled side walls/paintings for the directory and screening shots, baked lighting, an in-scene butler presence, ambient sound with a silent default.

## Prompt 05 — Private Screening Room

- **S01 destination — IMPLEMENTED:** image-based cinema, separate HTML projection surface, premiere/welcome, actual native video player, transport/seek/replay/fullscreen/enlargement, collection browser, watched/resume persistence, error/empty recovery, membership gate and lounge integration.
- **S01 local verification — VERIFIED:** `npm run check` (175 tests), dedicated Chromium playback tests with synthetic H.264 films, clean 390×844 / 1170×2532 / 1440×900 captures reviewed. `npm run test:pwa` passed all 13 production Chromium tests; dedicated playback checks passed both tests.
- **S01 content and release — NOT STARTED:** approved messages, captions/transcripts, hosting decision and physical iPhone Safari + standalone rehearsal. Current production collection is honestly empty. No offline video support is claimed.
- **S01 entrance film — NOT STARTED:** optional integration point implemented; film generation follows composition approval.

- **S01 corrected viewing destination — IMPLEMENTED:** separate architectural arrival and screen-filling final reference, push-in transition, independent responsive playback layout and rotation without remounting media. Portrait/landscape iPhone-sized layout and same-video continuity checks added; see the latest BUILD_LOG entry for final results.
- **S01 corrected-view local checks — VERIFIED:** 175 unit/component tests, 5 dedicated Chromium playback/orientation tests, 13 production PWA tests; refreshed and reviewed separate arrival/final-frame and portrait/landscape playback captures. Real iPhone rehearsal remains NOT STARTED.

- **S01 cinematic playback refinement — IMPLEMENTED:** one custom transport/scrub system, restrained sender line, secondary options dialog, viewport-fitting portrait playback and fading landscape overlay. Dedicated end-of-message/closing overlays wait for explicit actions. Captures and final verification are recorded in the latest BUILD_LOG entry; real iPhone/Safari testing remains pending.
- **S01 premiere refinement local checks — VERIFIED:** `npm run check` (176 tests), 7 actual-media Chromium playback/layout tests and 13 production PWA tests in a serial rerun. Portrait/landscape/end-message screenshots reviewed. Default parallel PWA run encountered existing software-rendered lounge timing failures; no lounge assertions/timeouts were changed. Physical iPhone/Safari rehearsal remains NOT STARTED.

# Implementation backlog

Statuses: **NOT STARTED**, **IN PROGRESS**, **BLOCKED**, **IMPLEMENTED**, **VERIFIED**.
Priority P0 is deadline/critical-path; P1 supports the experience; P2 is optional. Phase names/dates are proposed, not an externally confirmed agreement. VERIFIED applies only to each task's recorded checks.

| Phase / ID | Priority | Status      | Task / acceptance                                                                                                                      | Dependencies                | Critical path |
| ---------- | -------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------- |
| 1 / F01    | P0       | VERIFIED    | Product, architecture, agent instructions, backlog and journal                                                                         | Brief                       | Yes           |
| 1 / F02    | P0       | VERIFIED    | Strict React shell, routes, Tailwind, Zustand, lint and tests                                                                          | F01                         | Yes           |
| 1 / F03    | P0       | VERIFIED    | Manifest, icons, worker, readiness/update UI; offline browser check                                                                    | F02                         | Yes           |
| 1 / F04    | P0       | VERIFIED    | All foundation checks and handoff                                                                                                      | F03                         | Yes           |
| 2 / D01    | P0       | IN PROGRESS | Approve creative direction and iPhone interaction prototype                                                                            | F04, owner input            | Yes           |
| 2 / D02    | P0       | NOT STARTED | Confirm butler script, media inventory, prizes, member number, phone/iOS                                                               | Owner input                 | Yes           |
| 2 / E01    | P0       | VERIFIED    | Grand Entrance: locked doors, timepiece, butler, final minute, midnight, foyer                                                         | F04                         | Yes           |
| 2 / D03    | P1       | NOT STARTED | Define motion/accessibility/performance budgets                                                                                        | D01                         | No            |
| 3 / I01    | P0       | NOT STARTED | Invitation and scripted butler initiation                                                                                              | D01, D02                    | Yes           |
| 3 / I02    | P0       | IN PROGRESS | iPhone install guidance and membership card (card done; install guidance not)                                                          | I01                         | Yes           |
| 4 / L01    | P0       | IMPLEMENTED | Members' Lounge navigation and butler event integration                                                                                | I02, D01                    | Yes           |
| 4 / L02    | P1       | NOT STARTED | Cross-feature transition and accessible navigation checks                                                                              | L01                         | No            |
| 5 / C01    | P0       | NOT STARTED | Define game/reward contracts and server validation model                                                                               | D02, backend design         | Yes           |
| 5 / C02    | P1       | IMPLEMENTED | Grand Casino: lobby, roulette, slots, butler, reveal, sound, dev tools; 3D verified only in software-rendered Chromium (ADR-010)       | L01, C01                    | No            |
| 5 / C03    | P0       | VERIFIED    | Prize engine (`src/features/prizes/`): catalogue validation, ledger, versioned persistence/migration, Gift Vault contract; unit-tested | C01 (contracts only)        | Yes           |
| 5 / C04    | P0       | NOT STARTED | Owner supplies real casino content: clue text, Vault Key code and vault id, House Favour privilege, emblem (all flagged `placeholder`) | D02, owner input            | Yes           |
| 5 / C05    | P1       | NOT STARTED | Bespoke casino artwork per `config/casinoAssets.ts` (wall art, marquee, ceiling, reward cards, optional 9:16 entrance film)            | D01                         | No            |
| 5 / C06    | P0       | NOT STARTED | Real iPhone Safari/standalone rehearsal of the casino: frame rate, WebGL context, safe areas, audio, reveal                            | C02                         | Yes           |
| 6 / B01    | P0       | NOT STARTED | Choose backend/auth/hosting; threat model and recovery design                                                                          | D02, owner decisions        | Yes           |
| 6 / B02    | P0       | NOT STARTED | Authoritative entitlements/unlocks/idempotent redemption + integration tests                                                           | B01, C01                    | Yes           |
| 6 / B03    | P0       | NOT STARTED | Vault and privileges UI with pending/offline handling                                                                                  | L01, B02                    | Yes           |
| 6 / B04    | P1       | NOT STARTED | Notification delivery, fallback, organiser tracking                                                                                    | B02                         | No            |
| 6 / B05    | P0       | NOT STARTED | Versioned IndexedDB and tested reconciliation/storage failures                                                                         | B02, agreed offline policy  | Yes           |
| 7 / S01    | P0       | IMPLEMENTED | Fixed cinema, functional player, collection, persistence and gate integration; real content/device rehearsal pending                   | L01, D02                    | Yes           |
| 8 / X01    | P2       | VERIFIED    | Temporary developer-only navigation menu (`src/dev/`); removable; absent from production builds                                        | E01, L01, S01               | No            |
| 7 / S02    | P0       | NOT STARTED | Secret clues/NFC/QR and physical surprise rehearsal                                                                                    | B02, D02, holiday logistics | Yes           |
| 8 / R01    | P0       | NOT STARTED | Real iPhone Safari + standalone online/offline/update/accessibility rehearsal                                                          | All selected experiences    | Yes           |
| 8 / R02    | P0       | NOT STARTED | HTTPS deploy, backup/recovery and Jamaica contingency rehearsal                                                                        | R01, B01                    | Yes           |
| 8 / R03    | P0       | NOT STARTED | Final content/security checks and reveal before 24 October presentation                                                                | R02, confirmed reveal time  | Yes           |

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
- **L03 owner approval — NOT STARTED:** butler lounge copy, card wording ("Founding member · Lifetime", "No. 1 of 1"), the provisional unlock hours (privileges 10:00, casino 14:00 Jamaica time; the gift vault now opens with the membership, ADR-015, in `club/domain/schedule.ts`) and room order.
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

## Secret owner access

- **O01 — IMPLEMENTED:** hidden five-tap entrance clock activation, PIN 1414, mobile private-office panel, direct implemented-room navigation, birthday and locked rehearsals, isolated session progress, casino test controls, reset and exit. See `docs/OWNER_ACCESS.md` and ADR-011.
- **O02 — VERIFIED:** default code gates (314 tests), all 21 serial production Chromium tests and four WebKit owner tests. Includes touch activation on the fallback and projected 3D clock, PIN rejection/acceptance, room navigation, birthday/locked rehearsal, isolated rewards, reset, exit and fresh-tab expiry. Commit/push status is recorded in BUILD_LOG.md.
- **O03 — NOT STARTED:** physical iPhone Safari/Home Screen rehearsal; real screening messages and casino placeholders remain the existing content dependencies.
- **O04 — VERIFIED:** PIN menu Departure Lounge and Concierge Owner Console shortcuts. Departure navigation starts a server-key-authorized silent rehearsal at 22 October 14:01 UK; NFC activation, boarding and redemption remain available. All 31 production Chromium tests passed, including the full owner-to-NFC preview and ordinary visitor lock. Hosted Netlify and physical NFC/iPhone verification remain outstanding.

## Concierge — pre-birthday journey (ADR-012)

| ID  | Priority | Status      | Task / acceptance                                                                                                                                                                                       |
| --- | -------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K01 | P0       | VERIFIED    | Design plan (docs/CONCIERGE.md, ADR-012): journey, visual direction, data model, notification architecture, security model                                                                              |
| K02 | P0       | VERIFIED    | Concierge service core: credentials, signed sessions, rate limits, idempotent redemptions, Telegram/Twilio channels, retries, scheduled dispatch, owner API, rehearsal realm — 41 unit tests with fakes |
| K03 | P0       | IMPLEMENTED | Netlify wiring: `api` function at `/api/*`, `concierge-dispatch` scheduled function, Blobs adapter. Not yet deployed or run on Netlify                                                                  |
| K04 | P0       | VERIFIED    | Departure Lounge (`/departure`): board, credential request and riddle, boarding ceremony, wallet, privilege lifecycle, offline pending intents — component and Playwright tests                         |
| K05 | P0       | VERIFIED    | NFC credential arrival (`/c/:token`) and manual-code fallback, both credentials                                                                                                                         |
| K06 | P0       | VERIFIED    | Entrance: Phase One letter on the step; Jamaica-midnight eligibility; `awaiting-credential` until the membership card; scheduled rooms require membership                                               |
| K07 | P1       | VERIFIED    | Owner console (`/concierge/owner`): configuration health, NFC links/codes, activity and delivery status, resend, release times, message send/mark/copy, rehearsal, display pairing, live reset          |
| K08 | P0       | NOT STARTED | Owner: create Telegram bot and set all environment variables in Netlify; deploy; console test notification arrives on Arron's phone                                                                     |
| K09 | P0       | NOT STARTED | Owner: write and test NFC tags (rehearsal realm), print manual codes, choose riddles to match hiding places                                                                                             |
| K10 | P0       | NOT STARTED | Full rehearsal on the real iPhone (Safari) and hosted site: Thursday, in-flight, Friday, birthday card ceremony; then clear rehearsal/live test records                                                 |
| K11 | P1       | NOT STARTED | Optional: Twilio account, alphanumeric sender test to Alise's number, `ALISE_DISPATCH=sms`                                                                                                              |
| K12 | P1       | NOT STARTED | Owner approval of concierge copy, in-flight time (PROVISIONAL 18:30 UK), Friday time (09:00 Jamaica) and membership riddle (PROVISIONAL)                                                                |
| K13 | P1       | IMPLEMENTED | Live engraved countdown in the opened Departure Lounge letter (unit tests pass; not yet reviewed on an iPhone)                                                                                          |
| K14 | P0       | IMPLEMENTED | 3D entrance stability on iPhone Safari: no poster for a slow-but-playing scene, context-loss recovery, `?entrance-diag` (simulated WebKit only; real iPhone check pending)                              |

VERIFIED here means the recorded local checks passed (see BUILD_LOG); it does not cover Netlify hosting, real providers, NFC hardware or an iPhone.

## Backend foundation and Butler's Office (ADR-014)

- **BF01 — VERIFIED:** Dedicated Supabase project provisioned in London; API contract/shared types committed separately as `1486f9a`. Six migrations applied and hosted database security/rehearsal queries passed.
- **BF02 — VERIFIED:** PostgreSQL migrations, revocable sessions, atomic beauty/voucher redemption, mobile owner dashboard and approved Twilio outbox. Local checks: 473 unit/integration tests, 32 existing browser regressions, 2 office browser tests and Netlify Function bundles. Hosted application/provider verification remains BF03.
- **BF03 — BLOCKED:** Hosted Netlify deployment awaits owner-configured credentials. No hosted browser redemption or real SMS claimed; sending remains disabled. Exact setup/release steps are in docs/BACKEND_OPERATIONS.md.

- **BF04 — IMPLEMENTED:** Casino API awards exactly ten vouchers on the first actual server play, validates subsequent grants and deducts claims atomically. Casino frontend integration is documented for its owner; visuals were preserved.
- **BF05 — IMPLEMENTED:** Guarded legacy Blobs-to-PostgreSQL copy and verification tool. Actual source data cutover awaits Netlify access and a brief write freeze.

| S01 | P0 | IMPLEMENTED | Shopping Privilege (`/?concierge=shopping`, `/api/concierge/shopping`, `npm run butler:shopping`). Checks passed locally; not deployed, no real Twilio/iPhone run |

- **BF06 — VERIFIED:** Permanent backend compatibility with published Shopping (`7a1f815`): additive conflicts resolved on the backend branch; Shopping implementation unchanged; combined check passes 490 tests, Functions bundles and two owner browser rehearsals.
- **BF07 — IN PROGRESS:** Guided Netlify access/configuration and permanent backend deployment. Owner password/hash generated privately using the existing script; SMS remains disabled; hosted verification awaits configuration and deployment.
- **BF07 configuration checkpoint — IN PROGRESS:** Netlify access authorized; production Functions URL/site URL, secret owner hash and SMS-off flag configured. Owner's next action is to add the dedicated Supabase service-role key privately; merge/deploy/hosted checks follow.

## The Private Gift Vault (ADR-015, docs/GIFT_VAULT.md)

| ID   | Priority | Status      | Task / acceptance                                                                                                                                                                                                                                                                                                      |
| ---- | -------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GV01 | P0       | VERIFIED    | PostgreSQL vault (`ttc_vaults`, `ttc_vault_action`): LOCKED → READY → OPENED, atomic idempotent opening, NFC tokens and backup codes, rate limits, birthday time-lock, location secrecy (27 backend tests)                                                                                                             |
| GV02 | P0       | VERIFIED    | Membership bridge `POST /api/v1/auth/member/concierge`: live concierge session → v1 member cookie; rehearsal and forged sessions refused                                                                                                                                                                               |
| GV03 | P0       | VERIFIED    | Butler's Office vault tab: create/edit, clue and location, triggers, ready/lock/unlock, NFC URL, QR, backup code, rotation, non-destructive preview and tag test (Playwright)                                                                                                                                          |
| GV04 | P0       | IMPLEMENTED | 3D chamber, ceremony, letter, CSS fallback, reduced motion, sound. Reviewed in software-rendered Chromium only; real iPhone frame rate and tier tuning not measured                                                                                                                                                    |
| GV05 | P0       | VERIFIED    | NFC deep link `/v/<token>` → `/vault`: key held across reloads and the membership prompt, re-scan idempotent, interrupted ceremony recovers, revisit (Playwright, phone-sized Chromium)                                                                                                                                |
| GV06 | P0       | IMPLEMENTED | Gift Vault room opens with the birthday membership (replaces provisional 18:00 Jamaica); compartments keep independent availability                                                                                                                                                                                    |
| GV07 | P1       | BLOCKED     | Casino-triggered availability end to end: server release exists and is tested; the casino frontend must adopt `POST /api/v1/casino/slots/play` (casino/desk owners; vouchers side effect)                                                                                                                              |
| GV08 | P0       | NOT STARTED | Owner: approve and apply migration `20261019090000_gift_vault.sql` to the hosted project, deploy the merged branch, program real NTAG tags, rehearse on the actual iPhone in Safari                                                                                                                                    |
| GV09 | P1       | NOT STARTED | Owner approval of Butler and letter wording in `vault/domain/vaultScript.ts` and `VaultLetter.tsx`                                                                                                                                                                                                                     |
| GV10 | P0       | VERIFIED    | Integration branch `integration/gift-vault-backend`: `origin/main` (277eaa7, live Shopping) + `codex/backend-butlers-office` + `feature/gift-vault`, conflict-free; Shopping byte-identical to production; 537 tests, 5 office/vault and 32 production browser tests, Netlify Functions bundle. Not merged or deployed |
| GV11 | P0       | NOT STARTED | Owner decisions and release: approve the new dispatcher behaviour (legacy Blobs dispatch replaced by approved PostgreSQL outbox), add the service-role key, apply the vault migration, merge to `main`, smoke-test (docs/BACKEND_OPERATIONS.md)                                                                        |
| GV12 | P0       | VERIFIED    | Scheduler audit fix: every-minute round = approved PostgreSQL SMS outbox + legacy redemption-notification retries only (no legacy scheduled messages, so no duplicates); `/concierge/owner` no longer implies automatic sending; vault ceremony on wall-clock time with a letter watchdog                              |

## The Correspondence Desk (ADR-016, docs/CORRESPONDENCE_DESK.md)

| ID   | Priority | Status      | Task / acceptance                                                                                                                                                                                                                                                                                         |
| ---- | -------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CD01 | P0       | VERIFIED    | PostgreSQL letters and replies, `ttc_correspondence_action`, publication in the existing round (SKIP LOCKED, lazy safety net), idempotent invitation/thanks/notification SMS through the existing outbox, six-hour expiry, owner retry, rate limits (28 backend tests on PGlite with the real migrations) |
| CD02 | P0       | VERIFIED    | Owner Console tab: compose, edit, delete draft, preview, schedule (London/Jamaica, UTC storage), Send now, cancel, delivery history, SMS states, inbox of Alise's messages (Playwright, phone-sized Chromium)                                                                                             |
| CD03 | P0       | VERIFIED    | Member collection, envelope and wax-seal opening, letter, Thank the Butler (once), Butler A Word, arrival notice at the locked entrance (singular/plural), introduction link (Playwright + 8 component/unit tests)                                                                                        |
| CD04 | P0       | NOT STARTED | Owner: apply migration `20261020090000_correspondence_desk.sql` to the hosted project after the Gift Vault migration, merge after the backend release, deploy                                                                                                                                             |
| CD05 | P0       | NOT STARTED | Authorised controlled SMS exchange (invitation, thanks reply, notification to Arron) with `SMS_SENDING_ENABLED=true`; no real SMS has been sent                                                                                                                                                           |
| CD06 | P0       | NOT STARTED | iPhone Safari and installed-PWA rehearsal of the envelope, letter and keyboard; send Alise the one-time introduction link before the first letter                                                                                                                                                         |
| CD07 | P1       | NOT STARTED | Owner approval of the six-hour invitation expiry, reply limits, default salutation and on-screen Butler lines                                                                                                                                                                                             |

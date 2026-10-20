# Owner Control Centre and the universal rehearsal engine (ADR-018)

Branch `feature/owner-control-centre`, from production `1a3be938`. No database migration. No new production authentication. `SMS_SENDING_ENABLED` and `CONCIERGE_LEGACY_STORAGE` untouched.

## What exists

| Concern                                                                                  | Where                                                                                                                                                           |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which world a page belongs to (LIVE or rehearsal)                                        | `src/features/rehearsal/mode.ts`                                                                                                                                |
| The rehearsal clock                                                                      | `src/features/rehearsal/clock.ts` (`appClock`, `rehearsalNow`)                                                                                                  |
| Timeline, scenarios, room launcher, resets, triggers                                     | `src/features/rehearsal/engine.ts`                                                                                                                              |
| The owner's hand on the simulated office (seed vaults, deliver letters, force schedules) | `src/features/rehearsal/office.ts`                                                                                                                              |
| Simulated `/api/v1` (real handlers + real migrations in PGlite)                          | `src/features/rehearsal/sim/v1.ts`                                                                                                                              |
| Simulated `/api/concierge`, `/api/owner` (real handlers, session store, fake channels)   | `src/features/rehearsal/sim/legacy.ts`                                                                                                                          |
| Routing a rehearsal page's API calls to the simulation                                   | `src/features/rehearsal/sim/interceptor.ts` (installed from `src/main.tsx`)                                                                                     |
| Rehearsal stand-ins for `node:crypto`, `node:util`, Shopping                             | `src/features/rehearsal/sim/{nodeCrypto,nodeUtil,shoppingStub}.ts`, aliased by `build/rehearsalShims.ts`                                                        |
| Rehearsal-aware `localStorage`                                                           | `src/features/rehearsal/storage.ts` (`deviceStorage`)                                                                                                           |
| Owner Control Centre (LIVE / TEST)                                                       | `src/features/control-centre/ControlCentre.tsx`, `RehearsalDesk.tsx`                                                                                            |
| The secret Dev Menu (rehearsal launcher)                                                 | `src/features/owner/OwnerAccess.tsx`                                                                                                                            |
| Entrance letter lifecycle                                                                | `src/features/concierge/client/stepLetters.ts`, `EntranceConcierge.tsx`, `ButlerOverlays.tsx`                                                                   |
| Room-aware letter invitations                                                            | `src/features/correspondence/ui/RoomInvitations.tsx`, `domain/roomMentions.ts`                                                                                  |
| Set your own Owner Console password                                                      | `tools/set-owner-password.mjs` (`npm run owner:set-password`)                                                                                                   |
| Tests                                                                                    | `src/features/rehearsal/rehearsal.test.ts`, `tests/rehearsal.spec.ts` (`playwright.rehearsal.config.ts`), `tests/owner.spec.ts`, `tests/butler-service.spec.ts` |

## The two worlds

A page is either **LIVE** or **rehearsal**, decided when the page loads and never changed afterwards:

- `/concierge/owner` (and the old `/owner`, which redirects there) is LIVE, always — even inside a Dev Mode tab. It talks to the real server, signs in with the real owner password (server-checked scrypt hash, HttpOnly session) and the real concierge owner key.
- `/concierge/owner/test` is the TEST Control Centre. Every other page in a tab where Dev Mode (the PIN) is active is a rehearsal page.
- On a rehearsal page, `fetch` is wrapped before the app renders. Same-origin `/api/…` requests are answered by the simulated office in the tab; if it cannot start, they fail — they never fall through to the real server. Requests to Twilio, Telegram and Supabase hosts are refused outright.
- Moving between LIVE and TEST is always a full page load. A Control Centre page that finds itself in the wrong world reloads before rendering anything, and the interceptor refuses all API calls if a rehearsal page has somehow reached a LIVE path.

The PIN is still only a convenience gate (ADR-011). It grants nothing on the server: everything it unlocks runs in the browser against fake data.

## The simulated office

- **v1 (`/api/v1`)**: `netlify/backend/api.ts`, `correspondence.ts`, `service.ts`, `vault.ts`, `sms.ts` run unchanged in the browser, over PostgreSQL compiled to WebAssembly (PGlite, ~5 MB compressed, downloaded only by owner rehearsal pages and never precached). The nine real migrations are applied in order with every `now()` rewritten to `public.ttc_sim_now()`, which follows the rehearsal clock. The database is the IndexedDB database `/pglite/thirty-club-rehearsal`; Reset deletes it.
- **Sign-in**: the simulated owner (TEST) and simulated member (every rehearsal room) are signed in automatically through the real session actions; their tokens live in tab session storage, never as cookies. No password exists or is checked in the simulation.
- **Every-minute round**: the real `publishDueLetters` and the real outbox worker run on page actions and every 20 seconds while TEST is open, with a fake provider function that never calls the network. Messages move `approved → accepted → delivered` exactly as the real state machine does.
- **Concierge (`/api/concierge`, `/api/owner`)**: the real handlers with a session-storage store, the rehearsal clock and the existing fake channels. Credentials are the existing test values. Departure Lounge launches start a rehearsal-realm session, so redemptions say "Rehearsal recorded. No notification was sent."
- **Shopping Privilege**: the browser bundle gets `shoppingStub.ts`, identical except that it has **no ceiling**, so the real hidden ceiling never reaches a public file (verified by grepping the build).

## The rehearsal clock

`appClock.now()` is the rehearsal clock on rehearsal pages and `Date.now()` everywhere else. It drives the entrance countdown and ceremony, room unlocks (`useClub`), the concierge letter countdown, the desks' "now", the simulated database's `now()` and the simulated concierge's clock. Set, advance, jump and reset from TEST → Rehearsal or the Dev Menu. Time keeps running from the chosen instant, so events happen by themselves.

## Scenarios and launches

Scenarios: before departure; Departure Lounge opening (13:59:30 UK Thursday); birthday eve; one minute before midnight; birthday midnight (−5 s); midnight without the card; immediately after entering (induction); Casino opening (13:59:30 JM); Casino jackpot (next spin); Gift Vault unlock; all rooms open.

**The Screening Room journey (first visit)** opens the Members' Lounge with this rehearsal's screening progress and the room's completion cleared, so the Butler's escort, introduction, the five-second test film, the closing words and encores can be rehearsed end to end, as often as wanted (ADR-019). **The Private Screening Room** goes straight to the seat and keeps progress (returning visitor).

Launches never bypass a gate. They move the rehearsal clock forward to when the room really opens (if earlier), mark the card presented and the membership inducted as Alise's device would record them, and create what the room checks for (e.g. three rehearsal compartments in the simulated vault, a rehearsal-realm concierge session for the Departure Lounge). Rooms: Grand Entrance, Departure Lounge (with or without the credential), Members' Lounge, Screening Room, Grand Casino, Gift Vault, My Correspondence, Shopping Privilege. The Privileges Collection is not built (registry `built: false`) and is listed honestly as "Being prepared".

## Production fixes in this release

- **Gift Vault, empty dark grid.** Cause: Dev Mode opened the real vault against the production server with no member session and (on that phone) no compartments; the chamber rendered with zero compartments. Rehearsal now runs the vault against the simulated office with seeded compartments; "Simulate finding the key" uses the compartment's simulated NFC token. In production the vault is unchanged: it shows "No compartments have been assigned yet." until compartments are created in LIVE → Butler's Office → vault.
- **Letter stays at the entrance.** The concierge's step letter is now a read-tracked letter: unread on the step, gone once opened, kept in My Correspondence ("From the concierge"), and the Thursday "Departure Lounge is ready" letter arrives unread. Desk letters already behaved this way; both are covered by tests.
- **Casino invitation while locked.** A letter that names the Grand Casino, Screening Room, Gift Vault or Departure Lounge now shows the way in only if the room is enterable for Alise now; otherwise "The Grand Casino is not open yet. It opens at 2 pm, Jamaica time, on Saturday 24 October." In rehearsal it also offers "Rehearsal: launch The Grand Casino unlocked".
- **Mobile.** Control Centre built for 390 px (sticky notices, 44 px targets, 16 px inputs so Safari does not zoom); Dev disc no longer covers the vault or Departure Lounge back links; Casino test controls moved off the station cards; rehearsal indicator is a hazard rule on the top edge plus the amber disc, never over a heading.
- **Shopping history.** LIVE → Concierge & privileges shows the Shopping Privilege state read-only (new field in the existing owner overview; no write path changed).

## Known limits

- No physical iPhone has run this build. Verified in Playwright Chromium and WebKit with the iPhone 13 profile (390×664/844, DPR 2), 3D replaced by the poster in most journeys.
- First TEST load downloads PGlite (~5 MB compressed) and builds the database (2–5 s on a laptop; slower on a phone). If IndexedDB is unavailable (private browsing) the simulation runs for the open page only.
- The simulated office is per browser. Two devices never share a rehearsal.
- Owner sign-in inside TEST is simulated (no password). The LIVE password is the real one.
- The Casino still plays slots locally; in rehearsal, "Simulate a Casino jackpot" records the jackpot in the rehearsal prize ledger and releases the casino-bound compartment in the simulated vault, as the server would after a recorded jackpot.

## The birthday journey (ADR-020)

The journey's tables and RPC run in the simulated office like everything else. Its milestones follow the rehearsal clock, so moving the clock past 09:00 Jamaica on Friday introduces the Casino, and they appear on the TEST timeline as "Journey: …". Launches and scenarios declare the admissions their moment includes. The page a launch opens applies them through the real invite/accept actions before its first journey read, so they never depend on the simulated database flushing to IndexedDB before navigation. Ceremony launches (_The Members' Lounge before the birthday_, _Admission ceremony: the Grand Casino_, _The Screening Room journey_) invite without accepting, so the Letter of Admission can be rehearsed. A rehearsal may restart a ceremony; the real office never can. Owner controls: TEST → Office → journey. Browser test: `tests/journey.spec.ts` (in `playwright.rehearsal.config.ts`).

Observed while testing: under a frozen Playwright clock (`page.clock.setFixedTime`) the simulated database's IndexedDB flush does not complete before the next page, so that page rebuilds a fresh simulated office. This is why launches apply admissions on arrival. Other simulated state written just before a navigation (seeded vault compartments, delivered letters) is subject to the same effect in such tests. Normal browsers with a running clock were not observed to lose data.

## Casino/rewards branch update (2026-10-19)

The new production Casino now uses the persisted `/api/v1/casino` spin API. The older local roulette/slots and jackpot controls above describe the previous build and remain development previews only. The TEST Control Centre gains a Casino & rewards section for prize catalogue, immediate and scheduled batches, vouchers and gift fulfilment. The same API handlers and Casino migration run in TEST PGlite, but the isolated Casino branch does not contain Opus's Journey migration. Issue/spin correctly returns `not-configured` until the two branches are integrated. Follow `docs/CASINO_REWARDS_INTEGRATION.md` for the combined TEST and iPhone rehearsal; do not use a local jackpot as proof of an authoritative prize.

## Final integration (ADR-021)

- The simulated office applies all three release migrations and then **releases the communication hold** (LIVE stays held until the owner releases it). TEST → Control Centre top panel can hold it again to rehearse the hold and the release; release follows the rehearsal clock (refused before 21 Oct 00:00 Jamaica).
- Launch intents (applied by the destination page) can now also trigger milestones (`fire`) and issue a Casino batch through the real owner action (`spins`: three spins with one "Rehearsal voucher · two cocktails"). The Casino launches, the Casino ceremony launch, _Casino jackpot_ and _All rooms open_ use it.
- The _Early membership (the first invitation)_ scenario is 21 Oct, 10:00 Jamaica (a rehearsal time): it triggers the held Lounge introduction as the owner will after release.
- Browser test: `tests/integration.spec.ts` (voucher round trip; the hold enforced by the simulated server).

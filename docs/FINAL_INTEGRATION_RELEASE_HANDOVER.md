# Final integration and release handover — 20 October 2026

**Release owner:** Claude (Opus 5.5). **Integration branch:** `feature/birthday-final-integration`. **Worktree:** `/Users/ag14/Documents/Projects/the-thirty-club-final`. **Head:** see `git log -1` on the branch (the commit that adds this file; recorded in the delivery report). Not merged to `main`, not pushed, not deployed. No hosted migration applied, no SMS enabled, nothing sent to Alise.

## 1. What was integrated

| Source                    | Branch / commit                                                                | Kept unchanged                                                             |
| ------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Birthday journey (Claude) | `feature/birthday-journey` `c48224e`                                           | yes (worktree `../the-thirty-club-journey`)                                |
| Casino & rewards (Codex)  | `feature/casino-rewards-vault` `382e05e` (implementation `5dc1540`)            | yes (worktree `/Users/ag14/Documents/ChatGPT/30club/casino-rewards-vault`) |
| Contract                  | `docs/BIRTHDAY_JOURNEY_INTEGRATION_CONTRACT.md` from `586191b`, amended 20 Oct | —                                                                          |

Integration commits on top of `c48224e`: merge `2d7910a`; communication hold `2021b7c`; contract fixes `e45237f`; owner/rehearsal `182ee9d`; tests, documentation and this handover in the final commit.

### Conflicts resolved (deliberately, both sides kept)

- `netlify/backend/database.ts` — RPC routing for both `ttc_casino_action` and `ttc_journey_action` (and later `ttc_hold_action`).
- `src/features/lounge/ui/Lounge.tsx` — the Letter of Admission and the voucher wallet sheet; the wallet button is now shown only once the Casino is admitted (it names the Casino).
- `src/shared/journey/{contract,templates}.ts` — Codex held byte-identical copies of `586191b`; the Journey's later versions were kept, then extended for issues A and B and the hold.
- `tests/casino.spec.ts` — Codex's authoritative-reel spec, plus a mocked journey admission.
- Documentation (`ARCHITECTURE.md`, `BUILD_LOG.md`, `PROJECT.md`, `TASKS.md`, `docs/REHEARSAL.md`) — both sections kept.
- Semantic: `casino.test.ts` now uses the real journey functions and admission rows (its stand-in collided with the real migration); the journey's missing-hook test became a real-hook test; specs that expected the retired local Casino (`.casino`, "Casino test controls") now rehearse the authoritative Casino.

## 2. How the two systems work together

```
Owner / schedule ─► Journey milestone ─► hook casino.spins.issue ─► Casino batch (server positions)
                                     └► invite-room ─► Butler summons ─► Lounge ─► Letter of Admission ─► Casino
Casino spin (server) ─► entitlement ─► ttc_journey_publish(event) ─► Butler letter (RETURN TO …) or Vault introduction
Voucher request ─► Owner Control Centre ─► fulfil ─► member wallet "Fulfilled" + Butler letter
Communication hold ─► every letter publication and every SMS to Alise refused in the database until released
```

- The Journey is authoritative for admission, Butler communication, milestones, correspondence delivery, navigation/access and journey events. The Casino engine is authoritative for spin batches, server-side results, the prize catalogue, voucher entitlements and redemption, and Casino-linked Vault readiness.
- Casino play requires `ttc_room_admitted(member,'casino')`; issuing spins does not (the Butler defers the letter until admission).
- The API processes journey events immediately after any Casino mutation (best effort; the every-minute round is the backstop).

### Contract issues fixed

- **A — milestone key.** `MilestoneInput` now includes `key` (`MILESTONE_KEY_PATTERN`, shared `isMilestoneKey`); `MilestoneUpdate` excludes it. Creation is idempotent on the key (200 duplicate; 409 if the same key carries other details). New milestones start held. Codex's scheduler form uses the typed client, reads its time in **Jamaica** (it used the browser's zone), and arms the milestone it creates (it previously stayed held and would never have fired).
- **B — Vault gift.** `vault.gift.unlocked` is published after the gift entitlement is committed and its compartment readied. Admitted to the Gift Vault → Butler letter with RETURN TO THE GIFT VAULT. Not admitted → the Gift Vault is invited (summons → Lounge → Letter of Admission → escort to the Vault), with no second letter. Retries never duplicate the gift (one entitlement per spin) or the admission (one row per room).
- Also: owner-facing Casino and voucher times now display in Jamaica time.

### Casino milestone hook

`casino-opening` (23 Oct 09:00 Jamaica) invites the Casino; it is **armed**. `casino-opening-spins` (same time) calls `ttc_journey_hook('casino.spins.issue', params, 'milestone:casino-opening-spins:0')` → `ttc_casino_issue`, which persists one batch, publishes `casino.spins.issued` in the same transaction, and returns the existing batch on any retry (tested: fail → correct → retry → fire again → round = exactly one batch). It is **held** with a placeholder of 5 spins and no prizes: **the owner sets quantity and prize IDs and resumes it**. The spin count and prizes were not invented.

## 3. Database migrations

Order (all additive; filenames sort in this order):

1. `20261022090000_birthday_journey.sql` — admissions, milestones, event inbox, letter actions, `ttc_journey_action`. Edited before any application: the early-membership seed is held on 21 Oct; `invited_via` allows `event`; vault-gift reaction; idempotent milestone creation.
2. `20261022100000_casino_rewards.sql` (Codex) — catalogue, batches, allocations, spins, entitlements, voucher requests, `ttc_casino_action`, `ttc_journey_hook`.
3. `20261022110000_communication_hold.sql` — the hold (§5).

Pre-requisite on the hosted project: the nine earlier migrations, including `20261019090000` (vault), `20261020090000` (correspondence) and `20261021090000` (Butler's service). **Confirm these are applied before anything else** (`select version from supabase_migrations.schema_migrations order by version;`).

Verified locally: `npm run verify:final-migrations` applies the nine, seeds LIVE-like data (a fulfilled £100 redemption, a published letter, outbox rows, a vault), applies the three in order and asserts that nothing existing changed, the unsent SMS to Alise was held, the hold is active until 21 Oct 00:00 Jamaica, early membership is held on 21 Oct, only `birthday-screening`, `birthday-vault` and `casino-opening` are armed, and all 10 new tables and 34 functions are closed to `anon`/`authenticated`. The £100 Shopping Privilege itself lives in Netlify Blobs (legacy concierge) and no migration or code path here touches it.

**Rollback considerations.** Code first, data never: the migrations only add objects and the hold only cancels _unsent_ SMS to Alise (each resendable). If the release must be withdrawn, redeploy the previous Netlify deploy; the new tables can stay (unused). Do not drop tables holding admissions, spins or entitlements once Alise has used them. To stop all contact at any time: Control Centre → "Hold all communications again".

**Hosted verification queries** (read-only, after applying):

```sql
select active, release_not_before, released_at from public.ttc_communication_hold;          -- active = true
select key, state, fire_at at time zone 'America/Jamaica' as jamaica from public.ttc_journey_milestones order by fire_at;
select count(*) from public.ttc_letters where state = 'published' and published_at > now() - interval '1 day'; -- 0 today
select state, count(*) from public.ttc_messages where category in ('scheduled-alise','correspondence-alise') group by 1;
select to_regprocedure('public.ttc_hold_action(uuid,text,text,jsonb)') is not null as hold_rpc;
select tgname from pg_trigger where tgname in ('ttc_hold_letters','ttc_hold_messages');
```

## 4. LIVE / TEST isolation

- TEST and every Dev Mode page run the same handlers and migrations in PGlite inside the browser (ADR-018); every rehearsal browser test asserts zero `/api/` requests reached the server, including the new integration tests (voucher round trip and hold).
- The TEST office starts with communications released so rooms can be rehearsed; holding/releasing there never touches LIVE.
- Launches create their state in the simulated office only (admissions, triggered milestones, a rehearsal batch of 3 spins with one "Rehearsal voucher").
- No test seeds, rewards or events were written to any hosted database.

## 5. Communication hold (status: implemented and verified locally; active on application)

Enforced in PostgreSQL, so it cannot be bypassed by a route, a retry, the per-minute scheduler, a deployment or a future code path:

| Path                                                                                  | While held                                                   |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Any letter publication (journey, Desk schedule, send-now, Butler responses)           | trigger raises `on-hold`; schedulers wait instead            |
| Any SMS to Alise becoming approved or sending (new, retry, direct Butler SMS, thanks) | trigger raises `on-hold`                                     |
| Approved SMS to Alise already queued when the hold starts                             | cancelled with the reason; resend individually after release |
| Journey milestones, journey events, due Desk letters                                  | wait (schedulers return 0)                                   |
| Owner: trigger/retry milestone, introduce room, retry event, create invitation link   | `409 on-hold`, nothing changed                               |
| Her own pages (existing letters, rooms, existing links)                               | unchanged; nothing new appears                               |
| Casino/reward state                                                                   | still commits; only the Butler's reaction waits              |

Release: Control Centre (top panel) → "Release communications…" → type `RELEASE` → refused before **21 Oct 2026 00:00 Jamaica (06:00 UK)**. Release sends nothing: due letters go to draft, due milestones to held, waiting events to failed-for-retry; each needs the owner again. "Hold all communications again" is always available.

What I could not check: whether anything reached Alise before this work (I have no access to the hosted database or Twilio). `SMS_SENDING_ENABLED` was `false` at the last recorded production check (19 Oct). Run the verification queries above; nothing already sent can be recalled.

## 6. Test results

Final run on the integration branch (local, production build):

| Gate                                                                | Result                       |
| ------------------------------------------------------------------- | ---------------------------- |
| `npm run check` (types, lint, format, Vitest, build)                | PASS — 673 tests in 53 files |
| `npm run verify:final-migrations`                                   | PASS                         |
| `npm run functions:build`                                           | PASS                         |
| Playwright main (Chromium)                                          | 31/31                        |
| Rehearsal incl. journey and integration specs (Chromium, iPhone 13) | 13/13                        |
| Screening Room (Chromium / WebKit iPhone 13)                        | 4/4 / 4/4                    |
| Journey + integration specs (WebKit iPhone 13)                      | 4/4                          |
| Butler / office (incl. NFC Vault) / correspondence / Casino-rewards | 7/7, 5/5, 3/3, 2/2           |

All browser tests run against the local preview; rehearsal tests run the real handlers and migrations in the browser and assert that no request reached the server. None of this is a hosted or physical-device result.

Required integration tests and where they live:

| #          | Requirement                                                                                                            | Test                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1–2        | Migrations together; LIVE data preserved                                                                               | `tools/verify-final-release-migrations.mjs`; `hold.test.ts` (first test) |
| 3–5, 23–24 | Lounge invitation held on 20 Oct; scheduler and retries respect the hold; owner approval to release; nothing delivered | `hold.test.ts` (8 tests); `tests/integration.spec.ts` (hold, TEST)       |
| 6          | TEST never contacts LIVE                                                                                               | every rehearsal spec (`calls` = [])                                      |
| 7–10       | Admission before play; owner and milestone spins persist; no duplicate batches                                         | `integration.test.ts`, `journey.test.ts`, `casino.test.ts`               |
| 11–13      | Casino events reach the journey; admitted → Casino directly; unadmitted → Lounge                                       | `integration.test.ts`                                                    |
| 14–16      | Server-authoritative spins; retry consumes nothing; one entitlement per win                                            | `integration.test.ts`, `casino.test.ts`                                  |
| 17–18      | Redemption reaches owner; fulfilment visible to her                                                                    | `integration.test.ts`; `tests/integration.spec.ts` (browser, TEST)       |
| 19–20      | Vault gift entitlement; Butler journey both ways                                                                       | `integration.test.ts`, `casino.test.ts`                                  |
| 21         | NFC vault access                                                                                                       | `tests/gift-vault.spec.ts` (office config), `vault.test.ts`              |
| 22         | Screening Room playback and return                                                                                     | `tests/screening-film.spec.ts` (Chromium + WebKit)                       |

## 7. Production release steps (owner approval required at each ★)

1. ★ Approve this branch for release. Merge `feature/birthday-final-integration` into `main` (fast-forward after review), or ask me to.
2. ★ Supabase (project `fzndcjzenodcixmuvfsb`): confirm the nine earlier migrations, then apply in order `20261022090000`, `20261022100000`, `20261022110000`. Run the §3 verification queries. The hold is active from this moment.
3. Netlify: confirm `SMS_SENDING_ENABLED=false` (leave it off). No new environment variable is needed.
4. ★ Deploy `main`. The per-minute dispatch now runs journey milestones first; while held it delivers nothing.
5. Smoke (read-only): `/concierge/owner` → sign in → the top panel says **ON HOLD**, earliest release 21 Oct 00:00 Jamaica; journey tab shows the timeline; Concierge → overview still shows Shopping "awaiting settlement, £100.00"; Casino & rewards loads. As a guest, `/rooms/casino` says "Not this way, Madam." without naming the room.
6. ★ Configure (any time while held): Casino & rewards → create the prize catalogue; journey tab → set `casino-opening-spins` quantity and prizes (or issue batches manually on the day), confirm or change times, review the held travel-day and breakfast letters' wording.

## 8. 21 October — the first invitation (exact procedure)

1. After 00:00 Jamaica (06:00 UK), open `/concierge/owner` on your iPhone and sign in.
2. Journey tab → "Early membership — the Members’ Lounge (21 October)" → **Change time** → the approved Jamaica time (it is a 00:00 placeholder). Do **not** resume yet.
3. Top panel → **Release communications…** → type `RELEASE` → note (e.g. "First invitation approved by Arron") → Release. Read the summary; anything returned to draft or held stays unsent until you act on it.
4. Journey tab → early membership → **Resume** (it fires at the chosen time; if the time has passed it fires immediately — the dialog says so). Alternatively **Trigger now**. Her Butler letter "The Members’ Lounge is open to you" is published; its SMS stays unsent while `SMS_SENDING_ENABLED=false`.
5. Butler's Office → membership → **Create invitation** → **Copy correspondence link** (single use, expires as shown). Send it to Alise yourself (your own message). Opening it on her iPhone signs her in and shows her letter; **ENTER THE MEMBERS’ LOUNGE** admits the Lounge and the founding-membership induction follows.
6. Check: journey tab shows the Lounge **Admitted**; her Directory lists no birthday rooms.

If anything looks wrong at any point: top panel → **Hold all communications again**.

## 9. Physical iPhone rehearsal checklist (owner, Safari and Home Screen)

TEST first (Dev Mode; nothing reaches Alise), then a LIVE read-only look:

1. Dev Menu → scenario **Early membership (the first invitation)**: letter at the doors → open → ENTER THE MEMBERS’ LOUNGE → induction → Directory lists only the Lounge, Entrance and Departure Lounge; the doorway reads "Private".
2. Launch **Admission ceremony: the Grand Casino**: summons → Lounge → Letter of Admission (legible, buttons ≥ 44 px, no horizontal scroll) → ENTER THE GRAND CASINO → escort → 3 spins → spin all three (one rehearsal voucher) → reload mid-spin once: the committed result returns, no extra spin used.
3. Lounge → Your Casino vouchers → Ask the Butler to redeem → TEST Control Centre → Casino & rewards → Mark fulfilled → wallet shows Fulfilled.
4. TEST → Casino & rewards: create a Vault prize linked to a casino compartment, issue a batch with it, win it → Gift Vault invitation (or direct letter if admitted) → Vault → compartment ready.
5. Launch **The Screening Room journey (first visit)**: Letter of Admission → escort → poster → Watch Movie → native fullscreen → end → return → closing words (test film).
6. TEST → hold panel: Hold again → journey "Trigger now" disabled; release refused before 21 Oct.
7. LIVE (read-only): `/concierge/owner` shows ON HOLD; guest `/rooms/casino` names nothing.
8. Exit Dev Mode.

## 10. Status by category

**Implemented and verified (locally: unit, PGlite with the real migrations, Playwright Chromium; WebKit iPhone profile where stated):** admission lifecycle and routing gates; Letter of Admission and escort; Butler letters with ENTER/RETURN; milestones (exactly-once, hold/resume/retry, restart-safe, Jamaica time); event inbox and reactions incl. vault gift; Casino batches, server spins, vouchers, redemption and fulfilment, Vault readiness; the Casino milestone hook; the communication hold and release; Owner Control Centre (hold panel, journey, Casino & rewards); rehearsal launches and scenarios; LIVE/TEST isolation; Screening Room unchanged.

**Implemented but awaiting hosted deployment:** all of the above in LIVE; the three migrations; the per-minute journey round on Netlify.

**Awaiting owner configuration / decision:** first-invitation time on 21 Oct and the release; the prize catalogue; `casino-opening-spins` quantity and prizes (held); afternoon batches and the evening mystery reward; travel-day milestones (UGG, airport privileges, AirPods hint — held, wording provisional) and breakfast; all Butler wording (PROVISIONAL); whether to ever enable SMS; the birthday film (deferred, SR08).

**Not implemented / not verified:** any hosted run; a physical iPhone run of the integrated build; real SMS; physical delivery of gifts (only recorded when the owner marks it); the old 3D roulette/slots consuming server spins (preview only); a separate notification to Arron when a voucher is requested (it appears in the Control Centre).

## 11. Owner decisions required

1. Approve merge to `main`, migration application and deployment (§7).
2. The first-invitation time on 21 Oct, and the release itself (§8).
3. Prizes and spin quantities for the opening, afternoon and evening batches.
4. Travel-day and breakfast letters: wording, times, resume or delete.
5. Whether `SMS_SENDING_ENABLED` stays off for the whole trip (recommended unless a controlled test is authorised).

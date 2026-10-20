# Final integration and release handover — 20 October 2026 (evening)

**Release owner:** Claude (Opus 5.5). **Branch:** `feature/birthday-final-integration`. **Worktree:** `/Users/ag14/Documents/Projects/the-thirty-club-final`. **Head:** the commit that adds this revision (recorded in `BUILD_LOG.md` and the delivery report). Not merged, pushed or deployed. No hosted migration applied, no Netlify setting changed, no SMS sent, nothing sent to Alise.

This revision answers Codex's NO-GO on `c869d67` (`docs/FINAL_INDEPENDENT_RELEASE_VERIFICATION.md` on `codex/final-release-verification` `b03d065`, not modified). It also adds SMS operations, the 21 October teaser and the 19:00 UK early admission.

## 1. What the branch contains

| Commit    | Content                                                                                                                      |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `2d7910a` | Merge of Journey (`c48224e`) and Casino/rewards (`382e05e`), conflicts resolved deliberately                                 |
| `2021b7c` | Communication hold (ADR-021)                                                                                                 |
| `e45237f` | Contract issues A (milestone key) and B (Vault gift journey)                                                                 |
| `182ee9d` | Hold panel, hold-aware journey tab, rehearsal spins                                                                          |
| `c869d67` | Integration tests, release check, first handover                                                                             |
| `15566f8` | **P0 fix: one SMS policy at every send boundary**; SMS migration; invitation links; early admission server side; Casino copy |
| `9ef9dfb` | SMS operations UI, `/rehearse`, 19:00 entrance, Casino consistency                                                           |
| final     | Browser release spec, documentation, this handover                                                                           |

## 2. P0 — the legacy SMS bypass is closed

Every outbound SMS path (traced by searching for `api.twilio.com` and `channels.sms`):

| Path                                                                                                | Before                                           | Now                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Legacy owner `POST /api/owner/message` (send, LIVE)                                                 | `dispatchMessage(force)` → Twilio, no hold check | Refused `409 on-hold` while held (read from PostgreSQL; a failed read counts as held). Its SMS goes through the policy boundary                                                                            |
| Legacy SMS (`netlify/concierge/channels.ts`): Alise messages, Shopping notice to Arron              | Own Twilio call                                  | No Twilio code left; `createChannels` requires the server's boundary (`netlify/backend/legacySms.ts` → `deliverSms`)                                                                                       |
| PostgreSQL outbox (`processMessages`): scheduled, Desk, journey, Butler SMS, notifications, retries | Environment switch only                          | Claims through `ttc_sms_claim` (mode LIVE; Alise only when released and approved after LIVE began); `deliverSms` re-checks the policy just before Twilio; a change in between unclaims (never marked sent) |
| Owner rehearsal copies                                                                              | —                                                | `deliverSms(audience 'owner-test')`: REHEARSAL mode and `SMS_REHEARSAL_TO` only                                                                                                                            |
| `tools/butler-shopping.mjs` (local CLI, direct Twilio to Alise)                                     | Could send                                       | Retired: refuses to send (`--dry-run` only)                                                                                                                                                                |
| Telegram to Arron (not SMS)                                                                         | Unchanged                                        | Unchanged; internal, never reaches Alise. The legacy "please forward" Telegram is only reached after release, because the LIVE send is refused while held                                                  |

`netlify/backend/smsPolicy.ts` `deliverSms` is now the only server code that contacts Twilio. Decision (`decideSms`):

- The transport (`SMS_SENDING_ENABLED=true` plus credentials) is necessary but never sufficient.
- Mode OFF → nothing. REHEARSAL → the owner test number only. LIVE → Arron's notifications, and Alise only while the hold is released.
- An unreadable policy is treated as OFF and held.

**Proof** (`netlify/backend/smsPolicy.test.ts`, real migration chain, fake provider recording every would-be Twilio call): Codex's exact call — `POST /api/owner/message {realm:"live",messageId:"invitation",action:"send"}` with the owner key, hold active at 20 Oct 18:00:01 UTC, `ALISE_DISPATCH=sms`, `SMS_SENDING_ENABLED=true`, Twilio configured — returns **409 on-hold in OFF, REHEARSAL and LIVE**, and the fake provider records **nothing**. An unreadable hold also refuses. `hold.test.ts` re-runs Codex's other reproduction (the 20 October milestone re-armed at 13:00 Jamaica, scheduler and member read at 18:00:01 UTC): `{fired:0, processed:0}`, nothing published, no early opening shown.

## 3. SMS operations — OFF / REHEARSAL / LIVE

Owner Control Centre → **SMS operations** (`/concierge/owner?section=sms`, LIVE and TEST; existing owner session). Migration `20261022120000_sms_operations.sql`, RPC `ttc_sms_action`.

- **Mode** is stored on the server (`ttc_sms_operations`). Default **OFF**; unreadable or missing means OFF. Owner-only. LIVE requires typing `LIVE`. Every change is audited (`ttc_activity_events` `sms.mode`: from, to, actor, time).
- **OFF:** nothing leaves — manual, legacy, scheduled, journey, Desk, notifications, retries. Queued rows stay `approved` (shown "Paused") and are never marked sent.
- **REHEARSAL:** nothing real leaves. "Rehearse to my phone" sends a copy to `SMS_REHEARSAL_TO` only (configured on the server, must differ from `ALISE_PHONE`, never accepted from the browser).
- **LIVE:** the outbox sends. For Alise, also required: hold released; approved **after** LIVE began (an older approval shows "Awaiting your approval", so switching to LIVE never flushes a backlog); due time reached; valid recipient; one claim per message (row lock, `SKIP LOCKED`, idempotent). A journey letter's SMS is approved when its milestone fires — **arming a milestone is the approval**.
- The page shows transport readiness (no numbers), the hold separately, and every message (draft, queued, awaiting approval, paused, held, sending, sent, delivered, failed, uncertain, cancelled) with errors. It also lists journey letters whose SMS can be rehearsed, notifications to the owner, and the rehearsal log.
- A send Twilio has accepted cannot be recalled. An ambiguous one is held as "uncertain" for reconciliation and never resent blindly.

### The real-SMS rehearsal flow

1. LIVE Control Centre → SMS operations → **REHEARSAL**.
2. On a message to Alise (for example "Butler · early-access teaser") → **Rehearse to my phone**.
   - The server takes the stored LIVE text (for a journey milestone, the same SQL renderer the journey uses, `ttc_journey_letter_sms`) and prefixes `[REHEARSAL — This message will be sent to Alise]`.
   - It replaces each club link with `https://30.ag14.co/rehearse?path=…&scenario|launch=…`.
   - It stores the copy in `ttc_sms_rehearsals` (never the LIVE outbox) and sends it to `SMS_REHEARSAL_TO`. A repeated tap is the same rehearsal (idempotency key).
3. On your phone, tap the link → `/rehearse` → "Enter the private access code" → the matching TEST rehearsal launches in that tab (the teaser opens the locked doors at 16:01 UK with the early countdown). No LIVE admission, prize, letter or entitlement can change: `/rehearse` acts only inside a rehearsal.
4. Limit: REHEARSAL copies are recorded as accepted or failed from Twilio's immediate answer; no delivery callback is tracked for them.

## 4. Every Butler invitation carries a link

Journey letter SMS use the Desk's invitation templates, with the link set by `ttc_journey_invitations`:

- return invitations → the room (`/rooms/casino`, `/rooms/gift-vault`, `/rooms/screening-room`, `/lounge`, `/rooms/privileges`);
- the admission summons → the entrance (`https://30.ag14.co`);
- other letters → `/correspondence`.

Publication refuses a template without the club link. Paths are the router's (`src/app/App.tsx`). Tests check that every template has an HTTPS club link and verify the Casino return, correspondence and entrance destinations in the actual SMS bodies. Owner-written SMS are free text: the page shows the body, and you add the link yourself.

## 5. Wednesday 21 October

### 16:00 UK — the Butler's teaser

Prepared as an **unapproved draft** (`scheduled-alise`, seed `butler-teaser-2026-10-21`, 16:00 Europe/London = 15:00 UTC) with your exact text and `https://30.ag14.co`.

- It sends only if, before 16:00, the hold is released, SMS mode is LIVE, and you approve it (Butler's Office → messages → Approve).
- Approval is refused while held and refused after 16:00 (`invalid`). An approved message more than 30 minutes late is marked failed, not sent.
- Rehearse it first (§3).

### 19:00 UK — the cinematic early admission

Milestone `early-membership` (effect `open-entrance`), **held**, at 2026-10-21 18:00 UTC = 19:00 UK = 13:00 Jamaica.

- **Resume** it (after releasing the hold) to authorise the schedule. From then on, the public `GET /api/v1/entrance` returns the opening time and the server clock. The entrance counts down to 19:00 by the server's clock (changing the phone's clock changes nothing) and says "Alise, your admission has been brought forward." Resume it when you want her to be able to see this, for example right after the teaser.
- The clock holds at **00:00:10**. At 19:00 the server fires the milestone (by the scheduler, or lazily on the next read) and reports `eligible`.
- If she is watching, the final ten seconds begin at once; otherwise they begin when she next opens the app. Looking away restarts them; a reload during them continues.
- At zero the existing ceremony plays (time-lock, doors, camera through), followed by the Butler's membership induction (the membership card is her "documentation"), then the Lounge. Reduced motion and the SVG fallback are the existing ones.
- Her membership is recorded on the server (`POST /journey/enter`, refused before the doors may open) when she has a member session; another device then skips the doors and the induction. Without a session it is per device.
- Only the Lounge, the Entrance and the Departure Lounge appear. The Casino, Gift Vault and Screening Room keep their own milestones and stay unnamed.

### "I shall forward your formal documentation this evening"

Her journey letters and the 23 October Casino admission need a **member session**. After 19:00: Butler's Office → membership → **Create invitation** → **Copy correspondence link**, and send it to her (personally, or as a Butler SMS in Butler's Office → Butler SMS, which follows the SMS policy). Opening it signs her in.

## 6. Casino consistency

- `casino-opening-spins` (sort 49) fires before `casino-opening` (50) when both are armed at 09:00 Jamaica on 23 October. The Letter of Admission mentions complimentary spins **only if an issued batch still has spins** (`letterWithoutSpins` otherwise).
- The journey tab warns while the Casino is armed and its spins are held. Set quantity and prize IDs (Casino & rewards → prizes; journey tab → edit), then resume. Issuance is idempotent on the milestone key.
- The open Casino refreshes its spins on focus, on visibility and every 30 s. Cancelling a batch asks first, withdraws an undelivered announcement and reports one already delivered.
- Rehearsals use the TEST office only; no LIVE spin, prize or entitlement is touched.

## 7. Migrations

Hosted (per Codex's read-only check): the nine baseline migrations. Required, in order (all unapplied anywhere; verified together locally):

1. `20261022090000_birthday_journey.sql`
2. `20261022100000_casino_rewards.sql`
3. `20261022110000_communication_hold.sql` — the hold is active the moment this is applied
4. `20261022120000_sms_operations.sql` — SMS mode OFF; the teaser draft

`npm run verify:final-migrations` applies the nine baseline migrations plus LIVE-like data (a fulfilled £100 redemption, a published letter, outbox rows, the vault), then the four. It checks:

- existing rows are unchanged and unsent Alise SMS are held;
- the hold is active until 21 Oct 00:00 Jamaica, early admission is held at 19:00 UK, SMS mode is OFF, and the teaser is an unapproved draft;
- only `birthday-screening`, `birthday-vault` and `casino-opening` are armed;
- 12 tables and 42 functions are closed to browser roles.

The real £100 Shopping Privilege lives in **Netlify Blobs** (legacy concierge). No migration touches it. Leave `CONCIERGE_LEGACY_STORAGE` unset.

**Backup and rollback.** Take a Supabase backup or PITR point before applying. The migrations only add objects, plus three data changes: they cancel unsent approved Alise SMS (each can be re-sent), insert one draft message, and seed milestones (`on conflict do nothing`). You can disable everything at any time without a deploy: set SMS mode to **OFF** and press **Hold all communications again** in the Control Centre. Code rollback: redeploy the previous Netlify deploy and leave the new tables in place.

**Verification queries (read-only):**

```sql
select version from supabase_migrations.schema_migrations order by version;
select active, release_not_before from public.ttc_communication_hold;              -- true
select mode from public.ttc_sms_operations;                                       -- off
select key, state, fire_at from public.ttc_journey_milestones order by fire_at;
select state, count(*) from public.ttc_messages where category in ('scheduled-alise','correspondence-alise') group by 1;
select count(*) from public.ttc_letters where state = 'published';
select count(*) from public.ttc_sessions where role = 'member' and expires_at > now();
```

## 8. Netlify configuration (owner; not changed by me)

| Variable                                                                | Value                                                                               |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `TWILIO_AUTH_TOKEN`                                                     | **Rotate first** (a token was previously exposed), then set the new one             |
| `TWILIO_ACCOUNT_SID`, `TWILIO_MESSAGING_SERVICE_SID` (or `TWILIO_FROM`) | Existing                                                                            |
| `ALISE_PHONE`, `ARRON_PHONE`                                            | Existing                                                                            |
| `SMS_REHEARSAL_TO`                                                      | **New**: your own verified number, E.164, not Alise's                               |
| `SMS_SENDING_ENABLED`                                                   | `true` only when you want the transport available (it authorises nothing by itself) |
| `CONCIERGE_SITE_URL`                                                    | `https://30.ag14.co`                                                                |
| `ALISE_DISPATCH`                                                        | Leave as is (`manual` recommended); legacy SMS obey the policy anyway               |
| `CONCIERGE_LEGACY_STORAGE`                                              | Leave unset                                                                         |

## 9. Controlled deployment sequence

1. Local fixes complete.
2. Automated tests pass (§10).
3. **Codex re-audits this exact commit.**
4. Owner approval.
5. Back up, then apply the four migrations in order.
6. Verify the hold is active and SMS mode is OFF (§7 queries).
7. Rotate the Twilio token; set the Netlify variables (§8); deploy.
8. Control Centre: SMS operations shows OFF; the hold panel shows ON HOLD.
9. Concierge overview: the £100 Shopping Privilege still shows its recorded redeemed/fulfilled state.
10. Switch to REHEARSAL and send the teaser rehearsal to your phone (rehearsals work while held; they never reach Alise). Tap its link and check the TEST doors.
11. Physical iPhone rehearsal (§11).
12. On 21 October after 06:00 UK: release the hold, switch to LIVE, approve the teaser before 16:00, resume `early-membership` (§5).

## 10. Tests (local)

Final numbers are in `BUILD_LOG.md` (20 October evening entry). New in this revision:

- `smsPolicy.test.ts` (21): the exploit in every mode; fail-closed; the OFF/REHEARSAL/LIVE matrix; backlog approval; future schedule; concurrency; retry after a mode change; change while in flight; owner-only audited mode; teaser draft, approval window and single send; rehearsal banner, recipient, idempotency and refusal of Alise's number; the milestone SMS renderer; links.
- `EarlyAdmission.test.tsx` (12): countdown, hold, final ten seconds, automatic doors, late arrival, reload, looking away, phone clock, offline.
- `hold.test.ts`: Codex's re-armed milestone; early admission after release.
- `integration.test.ts`: Casino copy and cancellation.
- `tests/release.spec.ts` (TEST, Chromium): 19:00 doors to the Lounge and reload; SMS operations rehearsal; the `/rehearse` link.

Not testable locally: real Twilio delivery, hosted Supabase/Netlify, the real Blobs Shopping record, physical iPhone Safari/PWA, NFC hardware, the birthday film.

## 11. Physical iPhone rehearsal checklist (TEST)

1. Dev Menu → **Early admission: after the 16:00 teaser** — doors locked, countdown to 19:00 UK, "admission has been brought forward".
2. **Early admission: 19:00 UK, watching** — holds at 00:00:10; final ten seconds; the doors open by themselves; induction; Accept your membership; the Directory shows no birthday rooms. Lock the phone once during the final ten seconds: they restart on return.
3. **Early admission: arriving after 19:00 UK** — the final ten seconds run on opening.
4. Reload in the Lounge: no second ceremony.
5. **Admission ceremony: the Grand Casino** (the launch issues three spins): letter, escort, spin, voucher → Lounge wallet → owner fulfils (TEST Casino & rewards).
6. **The Screening Room journey (first visit)** — test film, native fullscreen, return, closing words.
7. LIVE Control Centre (after deployment): SMS operations OFF, hold ON HOLD; REHEARSAL → rehearse the teaser to your phone → tap the link → code → TEST doors.

## 12. Remaining issues

**P0 (release gates for the owner / hosted environment):**

- Apply the migrations and deploy (none done).
- Rotate the Twilio Auth Token.
- Verify the Netlify variables, and that Twilio has no pending or accepted messages to Alise.
- Read-only check of the legacy Blobs dispatch records.
- Codex re-audit of this commit.
- Physical iPhone rehearsal.
- She needs a member session (invitation link) before 23 October for journey letters and the Casino admission.

**P1:**

- The birthday film is not configured (deferred by the owner).
- Future room names, Butler copy and the access code are in the public bundle (Codex P1-6, not addressed: accept, or defer sharing the site).
- The 22 October and breakfast letters remain held with provisional wording.
- Early admission must be armed by the owner (by design).
- A second device without a member session goes through the doors once more.

**P2:** rehearsal SMS have no delivery callback; owner-written SMS are not checked for a link.

## 13. Owner decisions

1. Approve this commit for Codex re-audit, then for deployment.
2. When to release the hold on 21 October (after 06:00 UK) and switch SMS to LIVE.
3. Approve the teaser before 16:00; when to resume early admission.
4. Casino opening quantity and prizes; the 22 October and breakfast letters.
5. Whether Arron's own SMS notifications should flow only in LIVE (current design: yes; Telegram is unaffected).

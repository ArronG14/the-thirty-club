# Birthday Journey — integration contract

**Status (20 October, integrated on `feature/birthday-final-integration`):** both sides implemented; amendments marked _(Amended 20 Oct)_. Binding interface between the birthday journey (owner: Claude, branch `feature/birthday-journey`) and the Casino / prizes / vouchers / Gift Vault work (owner: Codex). Additive changes only; anything not listed here is not part of the contract. Types: `src/shared/journey/contract.ts`. Schema: `supabase/migrations/20261022090000_birthday_journey.sql`.

```
OWNER ACTION / SCHEDULE → JOURNEY ENGINE → DURABLE EVENT → BUTLER DELIVERY → MEMBER ACTION → DESTINATION
```

## 1. Ownership

| Concern                                                                                          | Owner   |
| ------------------------------------------------------------------------------------------------ | ------- |
| Room admissions (LOCKED → INVITED → ADMITTED), Letters of Admission, Directory visibility, gates | Journey |
| Milestones (schedule, hold, resume, fire, retry) and their history                               | Journey |
| The event inbox `ttc_journey_events` and the reactions (Butler letters)                          | Journey |
| Butler letters (`ttc_letters` rows with `journey_ref`) and their SMS invitations                 | Journey |
| Spin batches, quantities, guaranteed prizes, prize positions, prize catalogue                    | Codex   |
| Voucher entitlements, redemption requests, fulfilment, Gift Vault reward release                 | Codex   |
| Casino / voucher UI inside `/rooms/casino` (and any voucher room)                                | Codex   |

Journey tables: `ttc_room_admissions`, `ttc_journey_milestones`, `ttc_journey_events`; RPC `ttc_journey_action` (actions prefixed `journey-`, `owner-journey-`, `system-journey-`). Journey adds nullable columns `journey_ref`, `action_kind`, `action_room`, `action_label` to `ttc_letters` and redefines `ttc_letter_member_json`/`ttc_letter_owner_json` to include `action` (additive). Codex must not write to journey tables except through `ttc_journey_publish` below. Journey never writes Casino/voucher tables and never issues spins, prizes or vouchers.

## 2. Publishing an event (Codex → Journey)

**Preferred — inside your own transaction (SQL):**

```sql
-- returns the event id (the existing one on a retry)
select public.ttc_journey_publish(
  p_type   => 'casino.spins.issued',
  p_source => 'casino',                       -- your system name, [a-z0-9-]{2,30}
  p_key    => 'spins-batch-' || batch.id,     -- stable idempotency key, [A-Za-z0-9:_.-]{8,120}
  p_payload => jsonb_build_object('batchId', batch.id, 'quantity', 5)
);
```

Call it in the same transaction that commits the spins/prize/voucher, so the event exists if and only if your state exists (transactional outbox). Then, from TypeScript, after your RPC returns, optionally call `processJourneyEvents(db)` (`netlify/backend/journey.ts`) so the Butler reacts at once; otherwise the every-minute round processes it within ~60 s.

**Alternative — from TypeScript (separate transaction):** `publishJourneyEvent(db, { type, source, key, payload })` in `netlify/backend/journey.ts` (action `system-journey-event`, then processes immediately). Use only when you have no SQL transaction to join.

**Idempotency.** `(source, key)` is unique. Re-publishing the same key with the same type and payload returns the same event and does nothing else. The same key with a different type or payload raises `idempotency-conflict` (a bug in the publisher). Each event produces at most one Butler letter (`ttc_letters.journey_ref = 'event:<event id>'`, unique).

## 3. Event names and payloads

| Type                                   | Payload (JSON)                                                                         | Journey reaction                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `casino.spins.issued`                  | `batchId`, `quantity` (int ≥ 1), `announce?` (default true), `letter?` `{title, body}` | Casino ADMITTED → Butler letter "… {quantity} additional spins …" with **RETURN TO THE GRAND CASINO** (`/rooms/casino`). Casino LOCKED or INVITED → `deferred` until admitted (no secret leaked, no second ceremony). `announce:false` → `recorded`, no letter.                                                                                                            |
| `casino.spins.available`               | `available`                                                                            | Recorded only.                                                                                                                                                                                                                                                                                                                                                             |
| `casino.prize.awarded`                 | `prizeId`, `title`, `announce?` (default **false**), `letter?`                         | Recorded; with `announce:true` a letter with RETURN TO THE GRAND CASINO (deferred until admitted).                                                                                                                                                                                                                                                                         |
| `reward.voucher.issued`                | `voucherId`, `title`, `roomId?`, `announce?` (default true), `letter?`                 | Letter "{title}"; RETURN TO `roomId` if given (deferred until that room is admitted), else no button.                                                                                                                                                                                                                                                                      |
| `reward.voucher.redemption_requested`  | `voucherId`, `redemptionId`, `title`                                                   | Recorded only (Arron's notification is the publisher's job).                                                                                                                                                                                                                                                                                                               |
| `reward.voucher.fulfilled`             | `voucherId`, `redemptionId`, `title`, `announce?` (default true), `letter?`            | Letter "{title} has been arranged".                                                                                                                                                                                                                                                                                                                                        |
| `vault.gift.unlocked`                  | `vaultId`, `title?`, `announce?` (default true), `letter?`                             | Published after the gift entitlement is committed and its compartment is ready. Gift Vault ADMITTED → letter "Something has been placed in the Vault" with **RETURN TO THE GIFT VAULT**. Not admitted → the Gift Vault is invited (summons → Lounge → Letter of Admission → escort into the Vault); no second letter. Repeats change nothing. _(Amended 20 Oct, issue B.)_ |
| `room.admission.invited` / `.accepted` | `roomId`                                                                               | Emitted by the journey itself (source `journey`). Codex may read them; never publish them.                                                                                                                                                                                                                                                                                 |

Unknown types are stored as `recorded` (forward compatible) — tell the journey owner before relying on a reaction. `letter` overrides the Butler's default wording (max 120-char title, 4000-char body). Default wording: `src/shared/journey/templates.ts`.

## 4. Room admission API

Rooms needing admission: `lounge`, `screening-room`, `casino`, `gift-vault`, `privileges`. No row = LOCKED.

- **SQL guard for your server actions:** `public.ttc_room_admitted(p_member uuid, p_room text) returns boolean`. The Casino play/spin RPCs **should** refuse with `perform public.ttc_fail('not-open')` when `not ttc_room_admitted(member,'casino')`. Issuing spins does **not** require admission (the owner may credit spins before the opening; the Butler defers the letter).
- **Member HTTP:** `GET /api/v1/journey` → `MemberJourney` (invited/admitted rooms only); `POST /api/v1/journey/admissions/:roomId/accept` `{}` → `AcceptAdmissionResult` (201 first time, 200 `duplicate:true` after).
- **Owner HTTP:** `GET /api/v1/owner/journey`; `POST /owner/journey/rooms/:roomId/invite`; `POST /owner/journey/rooms/:roomId/withdraw` (INVITED only; an ADMITTED room can never be revoked); milestone routes in §6.
- **Client:** every room view stays behind `RoomGate` (`/rooms/:roomId`). The gate asks the journey: ADMITTED → render; INVITED → escort to `/lounge?admission=<room>` where the letter is presented; LOCKED → back to the club with no room name shown. The Casino UI needs no admission code of its own. A return link is simply `/rooms/casino`.

## 5. Milestone hooks (Journey → Codex)

A milestone effect `{ "type": "hook", "name": "casino.spins.issue", "params": { "quantity": 5, "announce": false } }` calls, in the milestone's transaction:

```sql
public.ttc_journey_hook(p_name text, p_params jsonb, p_idempotency_key text) returns jsonb
```

**Codex implements this function** (in a Codex migration, `create or replace`), dispatching on `p_name`. `p_idempotency_key` is `milestone:<key>:<effect index>` and is stable across retries — use it as the batch key so a retried milestone never issues twice. Raise (`ttc_fail(...)`) to fail the milestone; it is then shown as failed with the error and can be retried by the owner. Until the function exists, a hook effect fails with `hook-unavailable` (other milestones are unaffected). Hook names the journey seeds: `casino.spins.issue` (`quantity`, `announce`). Codex's hook should publish `casino.spins.issued` with the same `announce` value.

The seeded Casino milestones are split so a missing hook can never stop the admission: `casino-opening` (invite the Casino) and `casino-opening-spins` (hook). _(Amended 20 Oct)_ Codex's `ttc_journey_hook` is implemented in `20261022100000_casino_rewards.sql` (`casino.spins.issue` → `ttc_casino_issue` with params `{quantity, prizeIds?, announce?}`, batch idempotency key = the milestone effect key). `casino-opening-spins` stays **held** until the owner sets its quantity and prizes and resumes it.

## 6. Milestones (owner)

`ttc_journey_milestones`: `key`, `title`, `description`, `fire_at` (UTC, displayed in `America/Jamaica`), `state` `pending | held | fired | failed`, `effects` (§`MilestoneEffect`), `fired_at`, `fired_via` `schedule | owner`, `attempts`, `last_error`.

Owner routes: `GET /owner/journey`; `POST /owner/journey/milestones` (create — body is `MilestoneInput` **including `key`** (`MILESTONE_KEY_PATTERN`), which is the creation's idempotency key: same input → `200 {duplicate:true}`, same key with other details → `409 idempotency-conflict`; new milestones start **held**, resume to arm. _(Amended 20 Oct, issue A.)_); `PATCH /owner/journey/milestones/:key` (edit time/title/effects; not once fired); `POST /owner/journey/milestones/:key/fire | hold | resume | retry`; `POST /owner/journey/events/:id/retry`.

Firing is exactly-once: the round selects due `pending` rows `FOR UPDATE SKIP LOCKED`; `fire` locks the row and does nothing if it is not `pending`/`held`/`failed`. Each fire runs every effect inside one sub-transaction; on error everything rolls back, the milestone becomes `failed` with `last_error`, and `retry` re-runs it with the same idempotency keys. Held milestones never fire. Due milestones are fired by the existing every-minute `concierge-dispatch` round (before letters are published, so a letter it creates goes out in the same round) and lazily on any journey read. No client timer is ever the source of truth.

## 7. Butler delivery

Every reaction is a **Correspondence Desk letter** (`ttc_letters`, published immediately) with `journey_ref` (unique: `milestone:<key>:<i>`, `admission:<room>:summons`, `event:<id>`) and an optional `action`. Publication reuses `ttc_letter_publish`, which queues the existing approved SMS invitation in `ttc_messages`; it is only sent while `SMS_SENDING_ENABLED=true` (currently **false** in LIVE — no SMS goes to Alise). In-app delivery (envelope at the doors and in the Lounge, My Correspondence, unread state) works regardless. Records: issued (`ttc_journey_events` / milestone `fired_at`), delivered (letter `published_at`; SMS state in the outbox), opened (`opened_at`), accepted (`ttc_room_admissions.admitted_at`).

## 8. LIVE / TEST boundaries

- LIVE: Netlify Functions → hosted Supabase. TEST and every Dev Mode page: the same handlers and the same migrations in PGlite inside the owner's browser (ADR-018); `/api/` calls never leave the tab; providers are faked. Codex's migrations and functions automatically run in TEST if they live in `supabase/migrations/` and are called through `netlify/backend` handlers.
- Never seed, test or publish events against LIVE. Tests use PGlite (`netlify/backend/*.test.ts`).
- No journey action deletes or rewrites a redemption, privilege, voucher, spin or prize. Withdrawing an invitation is the only "undo" and is impossible once admitted.

## 9. Errors and retries

API errors use the existing `{ error, message, requestId }` envelope (`ApiErrorCode`). `not-open` = room not admitted; `conflict` = state does not allow the action; `idempotency-conflict` = same key, different event. Event processing failures leave the event `failed` with `last_error`; the round retries `pending`/`deferred` events every minute and `failed` ones only on owner retry (`POST /owner/journey/events/:id/retry`). Out-of-order events are safe: reactions depend only on the current admission state, and deferred events are re-evaluated whenever a room is admitted.

## 10. The communication hold _(added 20 Oct, ADR-021)_

Migration `20261022110000_communication_hold.sql`. While the hold is active (it is from the moment the migration is applied, and cannot be released before **21 Oct 2026 00:00 Jamaica**):

- No letter can be published and no SMS to Alise can be approved or sent — enforced by database triggers on `ttc_letters` and `ttc_messages`, whatever the caller.
- The schedulers wait: `ttc_journey_fire_due`, `ttc_journey_process_events` and `ttc_correspondence_publish_due` return 0. Events published by other systems are stored (`pending`) and **Casino/reward state still commits** (spins, prizes, vouchers, Vault readiness); only the Butler's reaction waits.
- Owner actions that would reach her (milestone fire/retry, room invite, event retry, member invitation link) fail `409 on-hold` before changing anything.
- Release: `POST /owner/communications/release {confirm:"RELEASE", note?}` (owner). It returns due Desk letters to draft, due milestones to held and pending events to failed (retry each to deliver) — nothing is sent by the release itself. `POST /owner/communications/hold` re-applies it and cancels unsent SMS to Alise. `GET /owner/communications` shows the state.
- TEST: the rehearsal office starts released; it can be held and released to rehearse the procedure.

## 11. What Codex needs to do

1. Publish `casino.spins.issued` (and the other events you own) via `ttc_journey_publish` in the transaction that commits the state.
2. Implement `public.ttc_journey_hook` for `casino.spins.issue` if milestone-driven opening spins are wanted; tell the owner to resume `casino-opening-spins` once it is deployed.
3. Guard Casino play with `ttc_room_admitted(member,'casino')`.
4. Name your migrations after `20261022090000` so the journey's tables and functions exist first.

## 12. SMS policy, links and early admission _(added 20 Oct evening, ADR-022)_

- **SMS:** every SMS goes through `deliverSms` (`netlify/backend/smsPolicy.ts`); nothing else may call Twilio. A journey letter's SMS is sent only in LIVE mode, with the hold released, after its milestone fires (arming is the approval).
- **Links:** each invitation template must contain the club link; `ttc_journey_invitations` points it at the room (return), the entrance (admission summons) or `/correspondence`. Paths: `JOURNEY_LINKS` in `src/shared/journey/templates.ts`.
- **Effect `open-entrance`:** fires early admission (`early-membership`, 21 Oct 18:00 UTC); records `journey.entrance.opened`. Public `GET /entrance`; member `POST /journey/enter`. Now part of the shared `MilestoneEffect` type and the owner PATCH validator. _(Amended 20 Oct, ADR-023:)_ `early-membership` also carries a `letter` effect (`action: admission/lounge`) whose `[[CLUE]]` the owner replaces; `journey-enter` before the birthday additionally requires a recorded membership card (`card-required`); any journey letter containing `[[` refuses to publish (the milestone fails, retryable).
- **Casino promise (ADR-023):** `ttc_room_admissions.promises_spins` (set when the Casino letter promised spins); `owner-casino-cancel` refuses `spins-promised` rather than break a delivered promise; the Casino invitation and cancellation lock the member row first.
- **Casino copy:** the Letter of Admission uses `letterWithoutSpins` unless an active batch has spins left; `casino-opening-spins` fires first. `owner-casino-cancel` withdraws an undelivered `spins-batch-<id>` announcement and returns `announcementDelivered`.

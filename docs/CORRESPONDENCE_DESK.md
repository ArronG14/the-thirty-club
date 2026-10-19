# The Correspondence Desk (ADR-016)

Arron writes a letter, gives it a title and chooses when it arrives. The Butler handles everything else: publication at the chosen instant, the invitation SMS, the thank-you reply, and passing Alise's messages to Arron.

Branch `feature/correspondence-desk`, based on `integration/gift-vault-backend` `bccce30`. Not merged, not deployed, migration not applied to the hosted project.

## Where things live

| Concern                    | File                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Schema, state machine, RPC | `supabase/migrations/20261020090000_correspondence_desk.sql` (`ttc_correspondence_action`)                                      |
| HTTP routes, validation    | `netlify/backend/correspondence.ts` (wired into `netlify/backend/api.ts`)                                                       |
| Publication in the round   | `netlify/backend/scheduledRound.ts`, `netlify/functions/concierge-dispatch.ts`                                                  |
| SMS recipient per category | `recipientFor` in `netlify/backend/sms.ts`                                                                                      |
| Butler SMS wording         | `src/shared/correspondence/templates.ts` (the one place to edit them)                                                           |
| Shared types               | `src/shared/concierge/types.ts` (Letter…, OwnerCorrespondence)                                                                  |
| Owner UI                   | `src/features/butlers-office/CorrespondenceDesk.tsx` (`/owner`, tab _correspondence_)                                           |
| Member UI                  | `src/features/correspondence/` (`/correspondence`, `/correspondence/:id`, arrival notice)                                       |
| Tests                      | `netlify/backend/correspondence.test.ts`, `src/features/correspondence/correspondence.test.tsx`, `tests/correspondence.spec.ts` |

## Data model

`ttc_letters` holds one row per letter, with its own UUID and lifecycle:

- `state`: `draft → scheduled → published`. `scheduled → draft` is "cancel delivery". Only drafts can be deleted. Only drafts and scheduled letters can be edited.
- `opened_at` and `thanked_at` are stamps on a published letter. The reported `status` is `thanked`, `opened` or the state.
- `deliver_at` is a `timestamptz` (UTC instant). `timezone` is `Europe/London` or `America/Jamaica` (a CHECK constraint). The editor converts the wall time in the chosen zone with the existing `wallTimeToInstant`, which refuses DST gaps and ambiguous times.
- `invitation_message_id` and `thanks_message_id` are unique references into the existing outbox `ttc_messages`. A CHECK makes every published letter carry an invitation; another ties `thanked_at` to its reply message.

`ttc_letter_replies` holds Alise's "Butler, A Word" messages: 1–1000 characters, a unique `(member_id, idempotency_key)`, and a unique `notification_message_id` into the outbox.

Both tables have RLS, a service-only policy and no grants to `anon` or `authenticated`. Every function is `execute`-granted to `service_role` only. Activity events record ids, never her words.

**SMS state is never stored on the letter.** It is read from `ttc_messages`, so an SMS failure can never hide, unpublish or roll back a letter.

## Publication, idempotency and concurrency

`ttc_correspondence_publish_due(templates)` selects `scheduled` letters with `deliver_at <= now()` using `FOR UPDATE SKIP LOCKED`. For each one, in a single transaction, it inserts the invitation into `ttc_messages` (category `correspondence-alise`, state `approved`) and marks the letter published.

- Concurrent runs skip each other's rows. A re-run finds no `scheduled` row. The unique message reference plus the CHECK make a second invitation impossible.
- It runs from the existing every-minute `concierge-dispatch` round, before the outbox half. No new scheduler was added. A publication failure is caught and never stops the outbox or the legacy retries.
- As a safety net, it also runs lazily at the start of every correspondence call. A letter is therefore visible at its time even if a round is missed.
- **Send now** sets `deliver_at = now()` and publishes in the same locked transaction. A repeat Send now is a no-op.

## The Butler's SMS

Two outbox categories are new to `ttc_messages` (its CHECK constraint is widened; the existing two are unchanged), carrying three kinds of message:

| Message               | Category               | Recipient     | Created when                                |
| --------------------- | ---------------------- | ------------- | ------------------------------------------- |
| Invitation            | `correspondence-alise` | `ALISE_PHONE` | the letter is published                     |
| Thank-you reply       | `correspondence-alise` | `ALISE_PHONE` | she first thanks the Butler for that letter |
| Notification to Arron | `correspondence-arron` | `ARRON_PHONE` | she sends a message                         |

They are created already `approved`: scheduling a letter is Arron's approval of its invitation, and the brief asks for the reply and notification to be automatic. **The existing global `SMS_SENDING_ENABLED` switch still gates every send**: with it off, `processMessages` sends nothing and the Desk shows "Queued, not sent — SMS sending is switched off". The existing claim, backoff, five-attempt limit, `uncertain` hold and Twilio status callbacks apply unchanged. `owner-message-update` refuses these categories, so they cannot be edited from the Messages tab. The Messages tab labels them "Correspondence · To Alise/Arron".

**Template choice.** The invitation is chosen by the delivery hour in the letter's own zone: morning 05:00–11:59, afternoon 12:00–16:59, evening 17:00–21:59, night 22:00–04:59. `ttc_letter_slot` (SQL) and `invitationSlot` (TypeScript) implement the same rule; a test compares them for all 24 hours in both zones. The texts, and the canonical link `https://30.ag14.co`, live in `templates.ts`. The server passes them on every call, so editing that file changes every future SMS without a migration.

**Truthfulness rules.**

- An invitation or reply to Alise that is still unsent six hours after it was queued becomes `failed` ("Not sent within six hours…"), so a late "Good morning" never arrives at night days later.
- If Alise opens a letter before its invitation has been claimed, the invitation is `cancelled` ("Not needed: Madam opened the letter…").
- **Retry** (`POST /owner/correspondence/messages/:id/retry`) is allowed only from `failed` or `cancelled`. It requeues the same message with `send_at = now()` and fresh attempts. An `uncertain` send may already have reached the phone, so it stays held until reconciled in Twilio, exactly as in the existing outbox.
- Arron's notification has no expiry, and the message itself is always in the Desk inbox whatever happens to the SMS.

## Alise's side

- **Identity.** A v1 member cookie. If the device has none, the existing bridge exchanges a live concierge session (travel pass or membership) silently. Failing that, Arron's one-time **introduction link**, `/correspondence#invitation=<token>`, is copied from Membership → Create invitation → _Copy correspondence link_. The fragment never reaches a server log and is removed from the address bar at once. **The page deliberately offers no membership-card entry**: presenting the card before the birthday would record the membership on the server and complete the midnight card ceremony early.
- **Arrival.** Superseded by the Butler's Service (ADR-017, `docs/BUTLERS_SERVICE.md`): the newest unread letter waits as an envelope at the locked doors (or in the lounge), the Butler greets once through his existing voice, and letters open in a translucent overlay. He appears only for a recognised member who is online.
- **Collection** (`/correspondence`): unread letters first, then previously opened ones, with titles, dates in the letter's zone, and Unread / Opened / Thanked. This route sits outside RoomGate and writes no club or membership record: it opens before 24 October and unlocks no room.
- **The letter.** A cream envelope and an oxblood wax seal (the existing `WaxSeal`, which splits). Tapping the seal breaks it, lifts the flap and raises the sheet; then the letter appears on laid paper with the emblem, the date, the title, the salutation and the body (blank lines make paragraphs; text only, no HTML), with a drop cap. Motion uses transform and opacity only. With reduced motion it cross-fades straight to the page. An opened letter goes straight to the page on return.
- **Thank You, Butler** records the thanks once (row lock plus `thanked_at`) and shows one of his scripted acknowledgements on screen (the SMS reply keeps `THANKS_RESPONSE`). A second press shows "You have already been far too kind…", and no second SMS is ever queued.
- **A Word, Butler** opens "Certainly, Madam. You have my undivided attention. What might I assist you with?" and a text field (1000 characters). Submission requires the member cookie, strips control characters and keeps one idempotency key per composed message. On success he gives one of his scripted acknowledgements, which claim nothing about SMS or fulfilment. Server limits: an identical message to the same letter within 10 minutes counts as one; five messages per 10 minutes and 40 per 24 hours (`429`).

## Arron's side

`/owner` → _correspondence_. From top to bottom: an SMS-switch banner, then compose. The editor has Title, Salutation (default "Dearest Alise,"), Letter, a London/Jamaica choice and a date-time. Its live arrival line reads, for example, "Arrives Tue 20 Oct, 09:00 Jamaica time (15:00 UK). The Butler will send his morning invitation." The invitation text itself is shown under a disclosure. Buttons: Schedule delivery, Save draft, Preview.

Below the editor are the Scheduled, Drafts and Delivered lists. Each card shows the arrival or delivery time, the template and invitation SMS status, opened and thanked times, the reply SMS status and the message count. Card actions are Preview, Edit, Schedule, Send now (with an inline confirmation), Cancel delivery, Delete draft (inline confirmation) and Resend. The **Messages from Alise** inbox shows the newest first: her exact words, the letter title and the SMS-to-Arron status. **Preview** renders the real member presentation in a dialog, with every action inert and labelled "records nothing and sends nothing".

## API

All routes are under `/api/v1`. Mutations carry the existing JSON and `X-Concierge-Request: 1` same-origin rules and the 16 KiB limit (the letter body is capped at 8000 characters to fit).

| Method | Path                                       | Role   | Body                       | Result                                 |
| ------ | ------------------------------------------ | ------ | -------------------------- | -------------------------------------- |
| GET    | `/correspondence/summary`                  | member | —                          | `{ unread, total }`                    |
| GET    | `/correspondence`                          | member | —                          | `{ letters: MemberLetter[] }`          |
| POST   | `/correspondence/:id/open`                 | member | `{}`                       | `{ letter }`                           |
| POST   | `/correspondence/:id/thank`                | member | `{}`                       | `201`/`200 { letter, duplicate }`      |
| POST   | `/correspondence/:id/reply`                | member | `{ body, idempotencyKey }` | `201`/`200 { reply, duplicate }`       |
| GET    | `/owner/correspondence`                    | owner  | —                          | `OwnerCorrespondence` (+ `smsEnabled`) |
| POST   | `/owner/correspondence`                    | owner  | `LetterInput`              | `201 { letter }` (draft)               |
| PATCH  | `/owner/correspondence/:id`                | owner  | `LetterInput`              | `{ letter }`                           |
| POST   | `/owner/correspondence/:id/schedule`       | owner  | `{}`                       | `{ letter }`                           |
| POST   | `/owner/correspondence/:id/send-now`       | owner  | `{}`                       | `{ letter }`                           |
| POST   | `/owner/correspondence/:id/cancel`         | owner  | `{}`                       | `{ letter }`                           |
| POST   | `/owner/correspondence/:id/delete`         | owner  | `{}`                       | `{ deleted }`                          |
| POST   | `/owner/correspondence/messages/:id/retry` | owner  | `{}`                       | `{ sms }`                              |

`LetterInput` is `{ title (1–120), salutation (1–80), body (≤ 8000), timezone, deliverAt: ISO instant | null }`. Errors use the existing codes:

- `400` invalid input; scheduling a past or empty letter.
- `401` no session.
- `403` wrong role.
- `404` unknown, draft or scheduled letter for the member.
- `409` an invalid transition (deleting a scheduled letter, editing a published one, retrying a queued SMS), or an idempotency conflict.
- `429` rate-limited.

Member responses never include SMS state.

## Local rehearsal

```bash
npm run test:correspondence
```

This runs its own preview server on port 4181, with the embedded PostgreSQL and SMS disabled. `POST /api/v1/__local/correspondence-due` exists **only** in `build/butlersOfficeLocalApi.ts`: it brings scheduled letters forward and runs the round's publication step. It is not part of any migration or Netlify function.

## Known limits and open questions

- No real SMS has been sent. Twilio behaviour is covered only by the existing fake-provider tests and the new ones. Delivery, iPhone rendering of the SMS, and the alphanumeric sender on Alise's carrier remain to be verified with an authorised test.
- No physical iPhone, Safari or installed-PWA run. Chromium was used at 390×844.
- The six-hour expiry, the rate limits and the default salutation are proposals for owner approval.
- If the round and SMS are both healthy, the invitation goes out within about a minute of the delivery time (the round runs every minute and sends one SMS per run).
- A letter's publication time is the server's; the date Alise sees is formatted in the letter's zone.

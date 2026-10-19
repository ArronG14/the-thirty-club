# The Butler's Service (ADR-017)

Alise opens the locked Grand Entrance, finds a letter waiting, reads it, thanks the Butler, rings for assistance and sends a request. Arron receives the request in the Butler's Office, replies by SMS or letter, and the Butler delivers his response.

Branch `feature/butlers-service-2026-10-19`, from the consolidated release candidate `877fbb8`. Not merged, not pushed, not deployed; the new migration is not applied to the hosted project.

Three interfaces stay separate: **the member experience** delivers, **the Owner Console** (`/owner`) operates, **Dev Mode** (the PIN rehearsal panel) rehearses. Dev Mode never calls the Owner Console's APIs.

## Where things live

| Concern                                    | File                                                                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Schema and RPC                             | `supabase/migrations/20261021090000_butlers_service.sql` (`ttc_service_action`)                                         |
| HTTP routes and validation                 | `netlify/backend/service.ts` (wired into `netlify/backend/api.ts`; RPC routing in `database.ts`)                        |
| SMS wording (Arron's request notification) | `src/shared/correspondence/templates.ts` (`ARRON_REQUEST_NOTIFICATION`)                                                 |
| Shared types                               | `src/shared/concierge/types.ts` (Butler's Service section)                                                              |
| The Butler's lines (six moments × six)     | `src/features/butler-service/domain/dialogue.ts`                                                                        |
| Live and rehearsal data                    | `src/features/butler-service/client/desk.ts`                                                                            |
| One service for entrance and lounge        | `src/features/butler-service/useButlerService.tsx`                                                                      |
| Menu, collection, letter, composer         | `src/features/butler-service/ui/ButlerOverlays.tsx` (lazy chunk), `RequestComposer.tsx`                                 |
| Envelope at the doors                      | `src/features/butler-service/ui/ArrivedEnvelope.tsx`                                                                    |
| Owner: Write to Alise                      | `src/features/butlers-office/ButlerSmsDesk.tsx` (Messages tab)                                                          |
| Owner: Member Requests                     | `src/features/butlers-office/RequestsDesk.tsx` (Requests tab)                                                           |
| Dev Mode controls                          | `src/features/owner/OwnerAccess.tsx`                                                                                    |
| Tests                                      | `netlify/backend/service.test.ts`, `src/features/butler-service/butlerService.test.tsx`, `tests/butler-service.spec.ts` |

## Member experience

- **At the locked doors.** For a recognised member with unread correspondence, the newest unread letter appears on the step as the same sealed envelope as the concierge's letter, larger and lit ("2 letters have arrived · _title_"). Once the entrance has settled (never during the 3D fade-in, final minute or ceremony), the Butler greets her once per newest letter in this tab through the bell's existing speech area. Touching the envelope opens the letter in a translucent overlay with the existing envelope, wax seal and unfolding animation (`LetterPresentation`, unchanged).
- **Thank You, Butler** records thanks with the existing one-time mechanism (`/correspondence/:id/thank`; one reply SMS ever, still gated). The overlay fades away and the Butler answers at the doors with one of six acknowledgements. Thanking again says "You have already been far too kind…" and records nothing.
- **A Word, Butler** opens the shared composer at the foot of the letter, so the letter stays in view; it posts the existing letter reply.
- **The bell.** The locked entrance's existing bell and the lounge's existing Ring for service both open the same Butler menu: _My Correspondence_ and _A Word with the Butler_ (at the locked doors also _The Departure Lounge_). The bell's own scripted lines still play.
- **My Correspondence**: a dark translucent veil over the doors or the lounge; newest first, unread marked with a lit seal and "Unread"; opened and thanked letters remain for rereading. Safe-area padding, internal scrolling, Escape and focus return, reduced-motion cross-fades. `/correspondence` and `/correspondence/:id` are unchanged and still work as direct links.
- **A Word with the Butler** (from the bell) posts `/service/requests`. Its confirmation is truthful: the request is recorded and Arron will see it; one of six acknowledgements says so and never claims anything is done.
- **The Departure Lounge.** A quiet _Your Departure Lounge_ link on the locked step, and the menu option, bring the Butler's invitation ("Shall I escort you?"). _Please escort me_ opens `/departure`, which keeps its own server schedule and travel credential; its back link returns to the still-locked doors. No membership card is asked for and nothing about the doors changes.
- **Members' Directory.** After the birthday the directory lists _The Departure Lounge_ (registry entry `departure-lounge`, always open, never recommended, so the evening's order is unchanged). The Privileges Collection still reads "Being prepared".

The old arrival notice (`CorrespondenceNotice`) is replaced by the envelope and greeting.

## Owner Console

- **Messages → Write to Alise.** Send now or schedule for later in London or Jamaica time; preview of the exact SMS text and parts; inline confirmation. History shows Scheduled, Queued, Sending, Sent (accepted by Twilio), Delivered, Failed, Uncertain and Cancelled from the outbox alone. Cancel is offered only before the worker has claimed a message; Send again only after a definite failure or a cancellation (the Desk's existing retry); an uncertain send stays held. The banner states when SMS sending is off. Scheduled announcements remain below, unchanged.
- **Requests.** Every word Alise has had with the Butler, from the bell or a letter, newest first, open before resolved. Each shows her exact words, the SMS-to-Arron status (with resend), and his responses beside them. _Reply with a Butler SMS_ queues one approved SMS to Alise. _Write a letter in response_ creates an ordinary Desk letter, links it, and either delivers it now (the Desk's Send now, with its invitation SMS) or leaves it as a draft on the Desk. _Mark resolved_ / _Reopen_ is Arron's statement only.
- The Correspondence Desk, Gift Vault, Shopping Privilege, privileges, redemptions and scheduled announcements are unchanged.

## Data, authority and SMS

- Requests from the bell are rows in the existing `ttc_letter_replies` with `letter_id` null; the same idempotency keys, 10-minute duplicate rule and limits (5 per 10 minutes, 40 per day, counted across letter replies and requests) apply, and each queues one approved `correspondence-arron` SMS in the same transaction. Activity records ids, never her words.
- `ttc_request_responses` links a request to an SMS (`message_id`) or a Desk letter (`letter_id`, set null if a draft is later deleted). Each response has a unique idempotency key; one letter can answer only one request.
- Direct Butler SMS are approved `correspondence-alise` outbox messages listed through `ttc_direct_messages` (unique idempotency key). A scheduled time must be in the future (one minute's grace) and within 60 days. Cancellation takes the row lock and succeeds only from `approved`.
- No new category, scheduler or provider path: the existing dispatcher, claim/backoff, five-attempt limit, uncertain hold, Twilio callbacks, six-hour expiry for unsent SMS to Alise and the global `SMS_SENDING_ENABLED` switch apply unchanged. `ttc_action`, `ttc_vault_action` and `ttc_correspondence_action` are untouched.
- New objects have RLS, a service-only policy and no `anon`/`authenticated` grants; every function is executable by `service_role` only.

### API (`/api/v1`, existing session, same-origin and `X-Concierge-Request` rules)

| Method | Path                           | Role   | Body                                                 | Result                             |
| ------ | ------------------------------ | ------ | ---------------------------------------------------- | ---------------------------------- |
| GET    | `/service/requests`            | member | —                                                    | `{ requests }` (her bell requests) |
| POST   | `/service/requests`            | member | `{ body, idempotencyKey }`                           | `201`/`200 { request, duplicate }` |
| GET    | `/owner/requests`              | owner  | —                                                    | `OwnerRequests` (+ `smsEnabled`)   |
| POST   | `/owner/requests/:id/sms`      | owner  | `{ body, idempotencyKey }`                           | `201`/`200 { request, duplicate }` |
| POST   | `/owner/requests/:id/letter`   | owner  | `{ letterId, idempotencyKey }`                       | `201`/`200 { request, duplicate }` |
| POST   | `/owner/requests/:id/resolve`  | owner  | `{ resolved }`                                       | `{ request }`                      |
| GET    | `/owner/butler-sms`            | owner  | —                                                    | `OwnerDirectSms` (+ `smsEnabled`)  |
| POST   | `/owner/butler-sms`            | owner  | `{ body, timezone, sendAt \| null, idempotencyKey }` | `201`/`200 { message, duplicate }` |
| POST   | `/owner/butler-sms/:id/cancel` | owner  | `{}`                                                 | `{ message }`                      |

Retry uses the existing `POST /owner/correspondence/messages/:id/retry`. Errors use the existing codes (`400`, `401`, `403`, `404`, `409` conflict or idempotency conflict, `429`).

## Dev Mode (rehearsal)

Five taps on the timepiece and the PIN open Dev Mode (the small **Dev** disc, top-left, clear of every heading). Its panel adds _The Butler's service_: simulate one or three unread letters, clear them, see the letter at the locked doors, open the correspondence page, and read every line the Butler can say. Locked entrance, Enter Club, birthday preview, rooms and the Departure Lounge remain as before.

While Dev Mode is active every member-side letter, thanks, word and request goes to `rehearsalDesk`: session storage under the owner prefix (cleared by Reset and Exit). It makes no network call, so it cannot send an SMS, change correspondence, consume the ceremony, redeem a prize or touch Alise's progress. The letter and composer say "Dev Mode rehearsal" on screen. Production authentication is untouched.

## Preview locally

```bash
cd /Users/ag14/Documents/ChatGPT/30club/butlers-service-2026-10-19
npm ci
npm run test:butler
```

That builds, runs the seven iPhone journeys against the in-memory database with SMS off, and writes JPEG screenshots to `docs/butlers-service/screenshots/`. To click through yourself:

```bash
BUTLERS_OFFICE_LOCAL_API=1 CONCIERGE_LOCAL_API=1 npm run dev -- --port 5190
```

- Owner Console: `http://127.0.0.1:5190/owner`, password `thirty-club-local-rehearsal-only` (local only). Compose and _Send now_ a letter; Membership → Create invitation → _Copy correspondence link_.
- As Alise: open that link in a private window (or another browser), then go to `/` to see the envelope, greeting, bell and requests. The requests appear in the Owner Console's Requests tab.
- Dev Mode: on `/`, tap the timepiece five times, PIN `1414`, then the Dev disc → _Simulate three unread letters_ → _See the letter at the locked doors_.
- From a phone on the same Wi-Fi, start the dev server with `--host 0.0.0.0` and open `http://<this Mac's IP>:5190/`. The local API uses `Secure` cookies, which iPhone Safari accepts only over HTTPS or localhost, so sign-in flows need the hosted preview; Dev Mode works over plain HTTP.

## Known limits

- Not run on a physical iPhone, Safari or the installed PWA; Chromium with an iPhone profile only (390×844 and 390×664), 3D via software rendering.
- No real SMS. Twilio is mocked in backend tests; every browser journey runs with `SMS_SENDING_ENABLED` off.
- The Departure Lounge itself still opens on Thursday 22 October at 14:00 UK and asks for the travel credential (ADR-012). Before then, the escort shows its honest "will be ready on Thursday" letter.
- The Butler's lines, the request notification wording and the 60-day scheduling window await owner approval.
- Future enhancement (not built): a panoramic Members' Lounge whose camera swivels between room entrances.

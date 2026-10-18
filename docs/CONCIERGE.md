# The Concierge: pre-birthday journey, privileges and notifications

Status: **design plan (ADR-012) followed by implementation**. Sections marked
**PROPOSAL** or **PROVISIONAL** still need the owner's confirmation. Operational
set-up (accounts, environment variables, NFC tags, rehearsal) is in the second
half of this document.

---

## Part 1 — Design plan

### 1. Experience architecture

The club gains a fictional **Concierge**, which looks after Alise before the
doors open. It has four parts.

| Part                  | Where                                      | What it does                                                                            |
| --------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------- |
| Correspondence        | Grand Entrance (`/`), a letter on the step | Phase One invitation; later links to the Departure Lounge                               |
| Departure Lounge      | `/departure` (new lazy route, 2.5D)        | Travel credential, privileges, Friday correspondence                                    |
| Credential arrival    | `/c/:token` (new route)                    | Target of every NFC tag; verifies the credential with the server and sends Alise on     |
| Membership credential | Grand Entrance, new `awaiting-credential`  | On the birthday the doors wait for the membership card, then the ceremony plays         |
| Concierge service     | `/api/*` Netlify Function + Netlify Blobs  | Credentials, sessions, redemptions, notifications to Arron, scheduled messages to Alise |
| Owner console         | `/concierge/owner` (owner key on server)   | Status, delivery log, resend, release times, manual-send texts, NFC links, rehearsal    |

The existing rooms are not rebuilt. The Members' Lounge, Screening Room and
Casino keep their own gates; the Casino keeps 2 pm Jamaica time.

### 2. The journey

| When (explicit zone)                                        | Alise                                                                                                                                                             | Arron                                                  |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 18–21 Oct                                                   | Receives the invitation link (manual send). The Grand Entrance shows the countdown and a sealed letter: membership approved, Departure Lounge on Thursday at two. | Sends the invitation text from the owner console.      |
| **Thu 22 Oct 14:00 Europe/London**                          | Gets "Your Departure Lounge is now ready…". The lounge asks for her misplaced travel credentials and gives a riddle.                                              | Telegram: message sent (or "send this now" if manual). |
|                                                             | Finds the NFC tag and scans it → `/c/<token>` → recognised → boarding pass is issued → lounge opens. Manual code fallback.                                        | Telegram: "credential presented".                      |
|                                                             | Breaks the seal on **The Departure Privilege**, names a boutique (optional) and redeems.                                                                          | Telegram: **CONCIERGE REQUEST**, with her note.        |
| **Thu 22 Oct, in flight (PROVISIONAL 18:30 Europe/London)** | Gets "We trust you've settled comfortably aboard…". Chooses Champagne / Cocktail / Wine / Soft drink / Something else, plus an optional preference.               | Telegram: selection and preference.                    |
| **Fri 23 Oct 09:00 America/Jamaica**                        | Gets a welcome-to-Jamaica text. A sealed **Arrival Correspondence** in the lounge, with a hint for tomorrow. No redemption, by design.                            | Telegram: message sent.                                |
| **Sat 24 Oct 00:00 America/Jamaica**                        | Birthday eligibility. The doors light up but stay closed: the butler asks for her membership card and gives a riddle. Optional iPad shows the same screen.        | Hides the card; sends the ceremony text when ready.    |
|                                                             | Finds and scans the card → `/c/<token>` → ceremony → Members' Lounge. Manual code (printed on the card) as recovery.                                              | Telegram: "membership presented".                      |
| Sat 24 Oct 14:00 America/Jamaica                            | Casino opens, unchanged.                                                                                                                                          |                                                        |

### 3. Visual direction

Not another heavy WebGL room. The Departure Lounge is **2.5D: layered CSS,
inline SVG and compositor-only animation**, which loads instantly on an iPhone,
stays sharp at 3×, and leaves the GPU budget to Saturday's 3D rooms.

- **Materials.** Oxblood leather (gradients and one rasterised noise tile),
  champagne saddle stitching, brushed brass rails and corners, ivory laid paper,
  oxblood wax seals with an embossed "30". Same tokens and fonts as the entrance:
  Bodoni Moda (display), Cormorant Garamond (voice), Jost (engraved capitals).
- **Composition (portrait).** A brass split-flap **departures board** with one
  line (`TC 030 · JAMAICA · OPENS THU 14:00`, then `NOW BOARDING`), beneath it a
  leather **travel wallet** that holds the boarding pass and the privilege
  envelopes. One focal object at a time. No grids of cards and no dashboard.
- **Credential.** A concierge letter, then a riddle on a hanging luggage tag.
  When the tag is scanned, a **boarding pass** slides out of its envelope and a
  brass stamp marks it `CLEARED`.
- **Privilege lifecycle** (each one is an envelope in the wallet):
  1. _Locked_: dark seal, engraved "Released in flight", not a control.
  2. _Reveal_: the seal glows; tapping breaks it (two halves part), the flap
     lifts and the privilege card rises into a full-height sheet.
  3. _Active_: concierge letter, choices or an optional note, and one redeem
     control.
  4. _Redemption_: "Inform Arron" → the concierge works (a pulsing seal), and
     nothing is claimed until the server answers.
  5. _Confirmation_: a brass stamp presses `GRANTED · 22 OCT MMXXVI` into the
     card in oxblood ink.
  6. _Redeemed_: the envelope rests open and stamped, with the selection and
     the delivery state written in the club's voice.
  7. _Persistent_: the server record decides; a local copy renders offline.
- **Motion.** 300–900 ms eases, one thing moving at a time. Reduced motion
  replaces travel with cross-fades and stamps without impact.
- **The entrance letter.** An ivory envelope with an oxblood seal rests on the
  step below the personal line. Tapping it opens the correspondence sheet. It
  is the only addition to the entrance before the birthday.

### 4. Data model

**Shared catalogue** (`src/features/concierge/domain/`, imported by both the
client and the server):

- `PrivilegeDefinition`: `id`, `kind` (`request` | `correspondence`), copy
  (eyebrow, title, subtitle, letter paragraphs, locked hint), `opensAt` (wall
  clock **with an explicit zone**), optional `choices`, optional note field, and
  the Telegram template. New privileges are new entries; nothing is hard-coded
  in the UI.
- `ConciergeMessage`: `id`, SMS text, link path, and `sendAt` (a wall clock, a
  privilege's opening, or `manual`).

**Server records** (Netlify Blobs store `concierge`, strong consistency; every key
is prefixed by realm `live/` or `rehearsal/`):

| Key                                | Value                                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `{realm}/activations/{credential}` | `{ credential, at, via: 'link' \| 'code' }`, written once                                                                                   |
| `{realm}/redemptions/{privilege}`  | `{ privilegeId, redeemedAt, idempotencyKey, choice?, note?, notification: { status, attempts, lastAttemptAt?, deliveredAt?, lastError? } }` |
| `{realm}/dispatch/{message}`       | `{ messageId, status: 'sending' \| 'sent' \| 'manual' \| 'failed', channel, attempts, at, error? }`                                         |
| `{realm}/overrides`                | owner changes: privilege opening times, message send times or disabled                                                                      |
| `ratelimit/{bucket}/{ip}/{window}` | failure counters                                                                                                                            |

Redemptions are created with `onlyIfNew` (a conditional write), so a second
redemption of the same privilege can never succeed. Later updates use
`onlyIfMatch` with the ETag.

**Sessions.** On a valid credential, the server returns an HMAC-SHA256 signed
token (`CONCIERGE_SESSION_SECRET`): `{ v, realm, scopes: ['departure' |
'membership' | 'display'], iat, offsetMs? }`. The client keeps it in localStorage
(`thirty-club:concierge-session`) so later visits need no credential. The server
verifies the signature on every call. The client only decodes the payload, so
the entrance's membership gate stays ceremonial (as ADR-006 already is).

**Client records.** `thirty-club:concierge` (versioned): the last server state
for offline rendering, broken seals, and at most one **pending intent** per
privilege (`{ idempotencyKey, choice, note, createdAt }`). A pending intent is
shown as "awaiting a connection", never as redeemed, and is submitted
automatically when the device reconnects. This covers a flight without Wi-Fi.

### 5. Notification architecture

**To Arron: Telegram Bot API.** It is free and needs no onboarding beyond
@BotFather. It delivers a reliable push notification on iPhone. It is one HTTPS call from
the function with no SDK. Alternatives were considered: Pushover costs money and
needs an app; ntfy public topics are guessable; web push on iOS requires the
installed PWA and permission, and is fragile. Arron's own email is too slow to
notice.

- The redemption is committed first. Delivery is then attempted in the same
  request, with a 6 s timeout.
- Outcomes are `delivered`, `pending` (it failed; it will be retried) or
  `unconfigured` (no bot token or chat id). Only a Telegram `ok: true` response
  sets `delivered`.
- The scheduled function retries `pending` deliveries every minute with backoff,
  up to 10 attempts. After that the status is `failed`, and the owner console
  shows **Resend**.
- Alise sees "Arron has been informed" only when the status is `delivered`.
  Otherwise she sees "Recorded. Word is on its way to Arron", which is true.

**To Alise: SMS through Twilio (optional), with manual send by default.**
WhatsApp Business automation needs Meta business verification, a registered
sender and approved templates for business-initiated messages. That is not
realistic before 22 October, so it is not built. SMS through Twilio with an
alphanumeric sender (`ThirtyClub`, accepted for one-way messages to UK numbers)
looks as if it comes from the club. Her UK number keeps receiving it while
roaming.

`ALISE_DISPATCH` selects the mode:

- `manual` (default): at the scheduled time, Arron receives the prewritten text
  and link in Telegram ("Please send to Alise now"). He forwards it by WhatsApp
  or iMessage. The status is `manual` until he marks it sent in the console.
- `sms`: Twilio sends to `ALISE_PHONE`. Arron gets a copy in Telegram. If the
  send fails, it falls back to `manual` automatically.

The owner console also lists every message with **Copy**, **WhatsApp** and
**Messages** buttons.

**Scheduling.** `concierge-dispatch` is a Netlify Scheduled Function that runs
every minute. It runs only on the published production deploy. It sends due
messages once each: the claim is written `onlyIfNew` before sending, so an
overlapping run or a console "Send now" cannot double-send. It also retries
pending notifications to Arron.

**Test and production separation.**

- Automated tests inject fake `fetch` and in-memory stores, and never reach
  Telegram or Twilio.
- The local API used by `npm run dev` and Playwright has a fake outbox.
- In production, **rehearsal realm** data is fully separate. Rehearsal
  activations, redemptions and manual messages send no Telegram or SMS;
  redemption delivery is recorded as `simulated`. A rehearsal device can shift
  its own clock.

### 6. Security and abuse model (honest)

- NFC tags and manual codes are **bearer secrets**. Anyone holding the URL or
  the code can act as Alise. That is acceptable because the worst outcome is
  Arron receiving a request he can decline. **All real-world rewards stay under
  Arron's control.**
- No secrets are in the bundle: every token, code, key and phone number lives in
  Netlify environment variables. `VITE_*` holds nothing secret. The optional
  offline hash below is a deliberate exception, documented as ceremonial.
- The server checks the session signature and the realm. Codes are compared in
  constant time.
- Failed credential attempts are limited to 8 per IP per 15 minutes. Request
  bodies are capped at 4 KB, notes at 280 characters, and control characters are
  stripped. Telegram text is HTML-escaped.
- Only POST is accepted for mutations. The bearer header defeats CSRF, and no CORS
  headers are sent.
- **Membership offline fallback** (optional): if
  `VITE_MEMBERSHIP_CODE_SHA256` is set at build time and the server is
  unreachable, the entrance accepts the membership code by comparing its salted
  hash. The ceremony never depends on hotel Wi-Fi. The hash of a short code can
  be brute-forced by anyone who reads the bundle, so it is ceremonial only.
- The Members' Lounge gate remains client-side and ceremonial (ADR-006). The
  surprise content is in the bundle, as it always has been.

### 7. Time

- Every scheduled instant is a wall clock **with an explicit IANA zone**,
  converted with `Intl` (the existing `instantInZone`). Device-local time is
  never used.
- Departure Lounge: 22 Oct 14:00 `Europe/London` (BST), which is 13:00 UTC.
- The Grand Entrance birthday target changes from device-local midnight to
  **24 Oct 00:00 `America/Jamaica`** (05:00 UTC). This amends ADR-006. Before,
  a phone still on London time would have opened the doors at 7 pm Jamaica time on
  Friday.
- The server's clock is authoritative for privilege availability and
  redemptions. The client clock only drives countdowns. A recorded redemption
  is never undone by a clock change.

### 8. Implementation sequence

1. Shared domain: zones, catalogue, messages, effective schedule, credentials,
   session payload, view states, with unit tests.
2. Server core (pure, injectable): store, auth, rate limiting, notifiers,
   handlers, dispatch, with unit tests using fakes. Then the thin Netlify
   function wrappers and the Blobs adapter.
3. Local API Vite plugin, for dev, Playwright and the dev owner key.
4. Client: API client, session store, local record, `useConcierge`.
5. UI: Departure Lounge (board, wallet, boarding pass, envelopes, sheet, stamp),
   credential arrival, entrance letter, entrance `awaiting-credential` stage.
6. Owner console and rehearsal.
7. Tests (unit, component, Playwright mobile), docs, BUILD_LOG/TASKS, commit,
   push.

### 9. Open questions for the owner

1. **In-flight release time.** It is 18:30 UK (PROVISIONAL). Change it in the
   console or with `PRIVILEGE_IN_FLIGHT_OPENS_AT`, without a deploy. Is there Wi-Fi
   on the flight? If not, the pending intent covers it and the card itself is the
   voucher.
2. **Riddles.** Two departure riddles are provided (handbag or luggage tag). The
   membership riddle is generic until the hiding place in the room is known.
3. **Friday.** Message time (09:00 Jamaica) and the wording of the
   correspondence.
4. **Saturday text.** It is manual by default. Send it once the card is hidden.
5. **SMS.** Is the Twilio account worth setting up? The default manual mode needs
   only Telegram.
6. **Membership number on the card** (the manual code), and the existing
   lounge card wording ("No. 1 of 1").

### 10. Implementation notes (what was actually built)

- The plan above was implemented as written, with one addition. Scheduled
  rooms (the Casino at 2 pm, and later the Gift Vault and Privileges) now also
  require the membership to have been presented. The time is unchanged. A
  direct link at 3 pm cannot skip the card ceremony (`clubState.isOpen`).
- Code map:
  - `src/features/concierge/domain/`: the shared, pure modules.
  - `src/features/concierge/client/`: the API client, sessions, local record,
    membership and offline digest.
  - `useConcierge.ts`.
  - `ui/`: the Departure Lounge, credential arrival, entrance letter and card
    prompt, and the rehearsal ribbon.
  - `owner/`: the console.
  - `netlify/concierge/`: the service core.
  - `netlify/functions/api.ts` and `concierge-dispatch.ts`.
  - `build/conciergeLocalApi.ts`: the local API with fake channels.
- The entrance machine has a new stage, `awaiting-credential`, and
  `EntranceEnvironment.card`. The countdown targets Jamaica midnight
  explicitly.
- New routes: `/departure`, `/c/:token` and `/concierge/owner`. All three are
  lazy chunks. The Departure Lounge is about 8 KB gzip.

---

## Part 2 — Operating the concierge

### Accounts to create (about 15 minutes)

**Telegram (required: Arron's notifications).**

1. On Arron's phone, open Telegram, message **@BotFather**, send `/newbot`,
   name it (for example "Thirty Club Concierge") and copy the **bot token**.
2. Open the new bot and press **Start**. Send it any message.
3. Visit `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser and copy
   `message.chat.id`. That is the **chat id**.
4. Optional: create a second chat (for example a group containing only the
   bot) for rehearsals, and note its id.
5. Make sure Telegram notifications are allowed on the phone (Settings →
   Notifications → Telegram), including in Focus modes used on the trip.

**Twilio (optional: automatic SMS to Alise).** This is only needed if the
messages should arrive with no action from Arron.

1. Create a Twilio account and upgrade it. Trial accounts send only to verified
   numbers and prefix every message.
2. Use an **alphanumeric sender ID** `ThirtyClub` (11 characters at most). UK
   numbers accept it without registration for one-way messages. Alise cannot
   reply.
3. Note the Account SID and Auth Token. Send one test SMS to Alise's number from
   the Twilio console before Thursday, and check that the link inside it is not
   stripped.

WhatsApp is deliberately not automated. Business-initiated WhatsApp messages
need Meta business verification, a registered sender and pre-approved
templates. That cannot be relied on before 22 October. In manual mode, Arron
forwards the prepared text by WhatsApp in two taps, from the Telegram message
or from the console's **WhatsApp** button.

### Environment variables (Netlify → Site configuration → Environment variables)

Set these with the **Functions** scope. None of them may have a `VITE_` prefix
(the two offline digests at the bottom are the documented exception).

| Variable                             | Required | Value                                                                                         |
| ------------------------------------ | -------- | --------------------------------------------------------------------------------------------- |
| `CONCIERGE_SESSION_SECRET`           | yes      | 32+ random characters: `openssl rand -base64 36`                                              |
| `CONCIERGE_OWNER_KEY`                | yes      | 16+ characters; Arron types it into `/concierge/owner`                                        |
| `CREDENTIAL_DEPARTURE_TOKEN`         | yes      | 16–128 of `A–Z a–z 0–9 _ -` (no dots): `openssl rand -hex 16`. Goes in the NFC URL            |
| `CREDENTIAL_DEPARTURE_CODE`          | yes      | Printed on the tag or luggage label, e.g. `BRASS-2210` (6+ letters/digits)                    |
| `CREDENTIAL_MEMBERSHIP_TOKEN`        | yes      | As above, a different value                                                                   |
| `CREDENTIAL_MEMBERSHIP_CODE`         | yes      | The "membership number" printed on the card, e.g. `TC-3010-2410`                              |
| `TELEGRAM_BOT_TOKEN`                 | yes      | From @BotFather                                                                               |
| `TELEGRAM_CHAT_ID`                   | yes      | Arron's chat id                                                                               |
| `TELEGRAM_REHEARSAL_CHAT_ID`         | no       | Reserved; silent rehearsals do not send to this chat                                          |
| `ALISE_DISPATCH`                     | no       | `manual` (default: Arron forwards) or `sms`                                                   |
| `TWILIO_ACCOUNT_SID`                 | for sms  | Twilio                                                                                        |
| `TWILIO_AUTH_TOKEN`                  | for sms  | Twilio                                                                                        |
| `TWILIO_FROM`                        | for sms  | `ThirtyClub` or a Twilio number                                                               |
| `ALISE_PHONE`                        | for sms  | E.164, e.g. `+447700900123`                                                                   |
| `ARRON_PHONE`                        | no       | Receives rehearsal SMS (never Alise)                                                          |
| `PRIVILEGE_IN_FLIGHT_OPENS_AT`       | no       | ISO instant, e.g. `2026-10-22T18:45:00+01:00`. The console can also change it                 |
| `PRIVILEGE_JAMAICA_ARRIVAL_OPENS_AT` | no       | ISO instant for Friday's correspondence                                                       |
| `CONCIERGE_SITE_URL`                 | no       | Overrides Netlify's `URL` for links in messages (e.g. a custom domain)                        |
| `VITE_MEMBERSHIP_TOKEN_SHA256`       | no       | **Build** scope. Offline membership fallback: `node tools/membership-hash.mjs <token> <code>` |
| `VITE_MEMBERSHIP_CODE_SHA256`        | no       | **Build** scope. As above                                                                     |

Short or malformed secrets are treated as missing, never trusted. The owner
console shows a ✓/✗ for each piece without revealing values. `.env.example`
lists the same names.

Storage is **Netlify Blobs** (store `concierge`), created automatically. There
is no database to provision.

### NFC tags

- Use NTAG213 or NTAG215 stickers or cards. Write a single **URL record** with
  an iPhone app such as NFC Tools: the link is shown in the owner console under
  _Physical credentials_. Optionally lock the tag afterwards.
- iPhone XS and later read URL tags in the background: hold the top of the
  phone to the tag and tap the banner. This needs no app and no Web NFC. The link
  opens in **Safari**.
- Print the manual code discreetly on the object as recovery. The Departure
  Lounge and the birthday door both accept it ("Present it by hand").
- **Test tags from a rehearsal**, not live. Start a rehearsal on your phone in
  Safari (console → _Rehearse on this device_), then scan. Scanning in live
  mode records a real activation and sends a real "credential presented"
  notification.

### Safari and the Home Screen app

iOS keeps Safari's storage separate from an installed Home Screen app. NFC tags
and SMS links open in Safari, so Safari is the journey's home until the
birthday. If Alise opens the installed app instead, it asks for the credential
again; the manual code works there. Redemptions live on the server, so nothing
is lost or duplicated.

### Rehearsal (do this before Thursday)

1. Deploy with every variable set, and open `/concierge/owner` on your phone.
2. Press **Send a test notification to Arron**. Telegram should arrive within
   seconds. If it does not, nothing else will.
3. Choose **Thursday 14:01 UK** under _Rehearse on this device_, or use the
   PIN owner's **The Departure Lounge** shortcut. Present the tag (or the
   code), break the seal and redeem. The card should say **Rehearsal recorded.
   No notification was sent.** Check that the rehearsal record appears in the
   console and the live record is unchanged.
4. Try **In flight**, **Friday** and **Birthday, 30 s before midnight**: the
   doors should wait for the card. Scan the membership card and watch the
   ceremony.
5. **End the rehearsal** (ribbon or console) and **Clear rehearsal records**.
   If anything was done live by mistake, type `RESET LIVE` under _Clear live
   records_.

Rehearsals use separate records (`rehearsal/…`) and a virtual clock. They send
no notifications to Arron or Alise.

### The timeline, operationally

| When              | What happens automatically                                                                                    | What Arron does                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Now – 21 Oct      | Nothing.                                                                                                      | Send **The invitation** from the console (Copy → WhatsApp or Messages, then **I sent it myself**). |
| Thu 14:00 UK      | `departure-ready` goes out: SMS to Alise (sms mode) or Telegram "Please send to Alise" (manual).              | Manual mode: forward it. Have the travel tag hidden.                                               |
| On redemption     | Telegram **CONCIERGE REQUEST** with her note or choice. Retried every minute for up to 10 attempts if needed. | Act on it. If the console shows `failed`, press **Resend**.                                        |
| In flight         | The privilege releases and `in-flight` goes out at the configured time.                                       | Move the time in the console if the flight changes, or **Release now**.                            |
| Fri 09:00 Jamaica | Correspondence releases; `jamaica-welcome` goes out.                                                          | Forward it in manual mode.                                                                         |
| Sat 00:00 Jamaica | The doors wait for the card. Nothing is sent.                                                                 | Hide the card; optionally pair the iPad as the display.                                            |
| Sat, when ready   | —                                                                                                             | Send **Membership ceremony** from the console.                                                     |
| Sat 14:00 Jamaica | The Casino opens (for a member who has presented her card).                                                   | —                                                                                                  |

Scheduled sends only run on the **published production deploy**. A message
more than 36 hours late is never sent automatically; send it by hand.

### Recovery

- **The tag will not scan:** use the code on the object. If the code is lost,
  Arron reads it from the console.
- **The card will not scan on Saturday:** use the membership number printed
  on the card. If the service is unreachable and the offline digests were
  built in, the number still opens the doors.
- **Telegram is down:** redemptions are still recorded, shown as pending, and
  retried. Alise is told "Word is on its way", never "informed". The console
  shows every request.
- **No Wi-Fi on the plane:** the request is kept on her phone ("safely kept…
  this card serves as your voucher") and sent when she reconnects.
- **Wrong release time:** change it in the console. Nothing needs redeploying.

### Local development

`npm run dev` serves the real handlers at `/api/*` with an in-memory store
and **fake channels** (`build/conciergeLocalApi.ts`). Nothing is ever sent.
The test values are in `netlify/concierge/testing.ts` (owner key
`test-owner-key-0001`; NFC links `/c/departure-test-token-0001` and
`/c/membership-test-token-0001`; codes `BRASS-2210` and `TC-3010-2410`).
Shift the service clock with:

```bash
curl -X POST localhost:5173/api/__local/clock -H 'content-type: application/json' -d '{"now": 1792674300000}'
```

`GET /api/__local/outbox` shows what would have been sent. The Playwright
production suite runs `vite preview` with `CONCIERGE_LOCAL_API=1` and the same
fakes.

### Known limits (honest)

- Not yet run on a physical iPhone, on Safari or WebKit, or on a real NFC tag.
  The Netlify Functions, Blobs and scheduled function have not run on Netlify
  itself, because no deploy has been made. Telegram and Twilio have never been
  called for real: every test uses fakes. All of these are release gates for
  the rehearsal above.
- Possession of a tag, code or session token is the only proof of identity.
  This is acceptable because Arron fulfils every request himself.
- The Members' Lounge gate is client-side and ceremonial (as ADR-006 always
  was). The lounge's content ships in the public bundle.
- Netlify Scheduled Functions run at most once a minute, so a message can
  arrive up to about a minute after its time.

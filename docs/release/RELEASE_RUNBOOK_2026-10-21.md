# Release runbook — Wednesday 21 October 2026

**For the owner. Nothing here has been done by the engineering agent.** Production today: Netlify publishes `main@54b9cf2` automatically; hosted Supabase has the nine baseline migrations only. The candidate is `feature/birthday-final-integration` at the commit named in `BUILD_LOG.md` (revision 4). **Do not start until Codex has re-audited that exact commit and you have approved it.** Times are UK (BST, UTC+1) unless marked.

Stop rule for every step: if any check differs from what is written here, stop, leave SMS **OFF** and the hold **ON**, and do not continue.

## 0. Before anything (≥ 2 h before 16:00)

1. **Freeze automatic publishing.** Netlify → the site → Deploys → **Stop auto publishing**. From now on a push to `main` builds but does not go live until you press _Publish deploy_. Note the current published deploy (it is `54b9cf2`): it is your rollback.
2. **Do not use the legacy concierge _Send now_ until the new deploy is published.** The old code (`54b9cf2`) still has the legacy owner send that bypasses the hold (Codex's original P0, fixed only in the candidate). Its PostgreSQL outbox is blocked for Alise by the database hold once migration 3 is applied. Confirm in Twilio (§4) that nothing is queued to Alise.

## 1. Hosted Supabase backup

1. Supabase dashboard → the project → Database → Backups: confirm a backup from today exists, or (on a plan with PITR) note the current timestamp as the restore point. Download/keep a logical dump as well:
   ```bash
   supabase db dump --linked -f backup-2026-10-21-schema.sql
   ```
   ```bash
   supabase db dump --linked --data-only -f backup-2026-10-21-data.sql
   ```
2. **Legacy Netlify Blobs (the fulfilled £100 Shopping Privilege) — read only:**
   ```bash
   netlify blobs:list concierge --prefix live/
   ```
   Note the `live/redemptions/…` and `live/activations/…` keys. No migration touches Blobs. Leave `CONCIERGE_LEGACY_STORAGE` unset.

## 2. The five migrations, in this order only

Confirm the baseline first (expect exactly the nine `2026101…`–`20261021090000` versions):

```bash
supabase migration list --linked
```

Then apply, in order:

1. `20261022090000_birthday_journey.sql`
2. `20261022100000_casino_rewards.sql`
3. `20261022110000_communication_hold.sql` — the hold is **active** from this moment
4. `20261022120000_sms_operations.sql` — SMS mode **OFF**; the 16:00 teaser as an unapproved draft
5. `20261022130000_membership_card_admission.sql` — the card, the 19:00 letter (awaiting your clue), Casino promise floor, milestone time zones, held arrival and dinner letters

Dry run, then apply (the CLI applies pending files in filename order and records each):

```bash
supabase db push --linked --dry-run
```

```bash
supabase db push --linked
```

The dry run must list exactly those five files. If you prefer the SQL editor, run each file in order and stop at the first error.

## 3. Verify: hold ON, SMS OFF (read-only SQL, Supabase SQL editor)

```sql
select version from supabase_migrations.schema_migrations order by version;      -- 9 + the 5 above
select active, release_not_before from public.ttc_communication_hold;           -- true, 2026-10-21 05:00:00+00
select mode from public.ttc_sms_operations;                                     -- off
select state, count(*) from public.ttc_messages
 where category in ('scheduled-alise','correspondence-alise') group by 1;        -- no approved / sending
select seed_key, state, send_at, timezone from public.ttc_messages
 where seed_key = 'butler-teaser-2026-10-21';                                   -- draft, 2026-10-21 15:00:00+00, Europe/London
select key, state, fire_at, timezone from public.ttc_journey_milestones order by fire_at;
  -- early-membership held 2026-10-21 18:00+00 Europe/London; only birthday-screening,
  -- birthday-vault, casino-opening pending; jamaica-arrival and birthday-dinner held
select count(*) from public.ttc_letters where state = 'published' and published_at > now() - interval '1 hour'; -- 0
select count(*) from public.ttc_membership_card;                                -- 0
select count(*) from public.ttc_casino_promise_floor;                           -- 0
```

## 4. Netlify variables and Twilio

**Twilio first.**

1. Console → Monitor → Logs → Messaging: filter the last 48 h and status _queued_, _accepted_, _scheduled_, _sending_. Any message to Alise's number that should not go: open it and cancel it (scheduled messages: Messaging → Services → your service → Scheduled messages → Cancel). Record what you found.
2. **Rotate the Auth Token:** Console → Account → API keys & tokens → Auth tokens → _Request a secondary token_ → copy it → (after step 3 below is deployed) _Promote_ the secondary token. The old token stops working on promotion.

**Netlify production variables** (Site configuration → Environment variables; changing them needs a new deploy):

| Variable                                                                | Value                                                                                                                     |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`                             | Existing                                                                                                                  |
| `OWNER_PASSWORD_HASH`                                                   | Existing                                                                                                                  |
| `CONCIERGE_SESSION_SECRET`                                              | Existing, ≥ 24 characters (the card and the session bridge verify with it)                                                |
| `CONCIERGE_OWNER_KEY`                                                   | Existing, ≥ 16 characters                                                                                                 |
| `CONCIERGE_SITE_URL`                                                    | `https://30.ag14.co`                                                                                                      |
| `CREDENTIAL_MEMBERSHIP_TOKEN`                                           | New random ≥ 32 chars: `openssl rand -base64 32 \| tr '+/' '-_' \| tr -d '='`                                             |
| `CREDENTIAL_MEMBERSHIP_CODE`                                            | The short number you will print on/with the card                                                                          |
| `CREDENTIAL_DEPARTURE_TOKEN` / `_CODE`                                  | Existing (Thursday)                                                                                                       |
| `TWILIO_ACCOUNT_SID`, `TWILIO_MESSAGING_SERVICE_SID` (or `TWILIO_FROM`) | Existing                                                                                                                  |
| `TWILIO_AUTH_TOKEN`                                                     | The **new** secondary token                                                                                               |
| `ALISE_PHONE`, `ARRON_PHONE`                                            | Existing, E.164                                                                                                           |
| `SMS_REHEARSAL_TO`                                                      | Your own verified number, E.164, **not** Alise's                                                                          |
| `SMS_SENDING_ENABLED`                                                   | `true` with this deploy: it only makes the transport available; SMS mode OFF and the hold still block everything until §8 |
| `ALISE_DISPATCH`                                                        | Leave as is (`manual` recommended)                                                                                        |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`                                | Existing                                                                                                                  |
| `CONCIERGE_LEGACY_STORAGE`                                              | Leave **unset**                                                                                                           |

## 5. Deploy the approved code

1. Auto publishing is stopped (§0). Merge the approved commit to `main` (fast-forward; the branch contains all of `54b9cf2`) and push. Netlify builds it but does not publish.
2. Open that deploy's unique URL (Deploys → the new deploy → _Open deploy_) and check: the doors load; `/concierge/owner` signs in; Control Centre shows **SMS: OFF** and **ON HOLD**; Concierge → overview still shows the £100 Shopping Privilege as redeemed/fulfilled.
3. Press **Publish deploy**. Promote the Twilio secondary token now (§4.2).
4. Rollback at any time: publish the previous deploy (`54b9cf2`) and/or set SMS OFF and press _Hold all communications again_ in the Control Centre. Database tables stay; nothing needs to be dropped.

## 6. Physical iPhone and NFC rehearsal (TEST — nothing LIVE changes)

1. Control Centre → Concierge → Physical credentials → **Copy NFC link** (membership card). Programme the LIVE card in NFC Tools (Write → URL record). Verify with **Read** only. **Never open the LIVE link yourself** — it records the card as presented and messages you.
2. Programme a spare card with `https://30.ag14.co/rehearse?scenario=early-admission-card-scan`.
3. On your iPhone, with Safari open on the club: scan the TEST card → private code → hold at 19:00 → wax seal → final ten seconds → doors → welcome → Accept your membership → Lounge. Reload: no second ceremony. Background Safari once during the final ten seconds: they restart.
4. Dev Menu → **Early admission: 19:00 UK, waiting for the card**: the clock holds at 00:00:10; the Butler's letter on the step; present the TEST number `TC-3010-2410` by hand.
5. LIVE Control Centre → SMS operations → **REHEARSAL** → teaser → _Rehearse to my phone_ → tap the link → private code → TEST doors. Then back to **OFF**.

## 7. Between 06:00 and 15:30

1. Write the clue: LIVE Control Centre → Office → journey → _Early admission_ → **Edit wording** → replace `[[CLUE — …]]` → Save. The red placeholder warning disappears.
2. Hide the card in Nyla's crate.

## 8. Controlled activation

**Before 16:00 (at least 15 minutes before):**

1. Control Centre → hold panel → **Release** (type `RELEASE`). Release is refused before 06:00 UK by the server.
2. Control Centre → SMS operations: transport shows ready (`SMS_SENDING_ENABLED=true` from §4); switch to **LIVE** (type `LIVE`). Switching to LIVE never flushes older approvals.
3. Butler's Office → messages → the teaser → **Approve** (refused after 16:00; it sends once at 16:00).
4. Journey tab → _Early admission_ → **Resume**. The entrance now counts down to 19:00 by the server's clock.

**At 16:00:** confirm in SMS operations that the teaser is _sent/delivered_ (and in Twilio logs).

**At 19:00:** the milestone fires by itself (or on her next visit): the Butler's letter with your clue is published and its SMS approved and sent; the doors hold at 00:00:10 and wait for the card. Do not press _Trigger now_ early. If the journey tab shows the milestone **failed** (placeholder still present), edit the wording and press **Retry**.

**After her scan:** journey tab → admissions → Lounge **Admitted**; `select * from public.ttc_membership_card;` shows one row.

**Emergency stop at any point:** SMS operations → **OFF**, and hold panel → **Hold all communications again**.

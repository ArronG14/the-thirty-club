# Backend setup and release

The dedicated Supabase project is **The Thirty Club**, AG14, London: `fzndcjzenodcixmuvfsb`. Six migrations have been applied; filenames match hosted migration history. Browser database roles have no grants. RLS and service-only policies are enabled. Supabase security advisor returned no findings. Performance advice only reports unused indexes on this new database; they support session revocation, foreign keys, the due queue and recent history and are retained pending real traffic ([advisor details](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)). A hosted SQL beauty redemption/retry/fulfilment rehearsal succeeded inside a rolled-back transaction, leaving no live claim or message.

## Required Netlify environment

Set these on the existing Netlify site connected to `ArronG14/the-thirty-club`, in the Functions scope. Do not prefix with `VITE_`. Use production values only on production; give a deployment preview a separate test configuration before using it for state-changing tests.

| Variable                       | Value or action                                                                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`                 | `https://fzndcjzenodcixmuvfsb.supabase.co`                                                                                                          |
| `SUPABASE_SERVICE_ROLE_KEY`    | Dedicated project's legacy service-role API key, from its dashboard. Keep private.                                                                  |
| `OWNER_PASSWORD_HASH`          | Run `node tools/owner-password.mjs` interactively. It hides the chosen password and prints a scrypt hash to paste here. Use at least 16 characters. |
| `CONCIERGE_SITE_URL`           | `https://30.ag14.co`, exactly, no trailing slash; used to authenticate Twilio callbacks.                                                            |
| `TWILIO_ACCOUNT_SID`           | Existing working Twilio account.                                                                                                                    |
| `TWILIO_AUTH_TOKEN`            | Existing Twilio account auth token, also verifies callbacks.                                                                                        |
| `TWILIO_MESSAGING_SERVICE_SID` | Existing `MG…` Messaging Service containing sender **THIRTYCLUB**. No new sender/service is created.                                                |
| `ALISE_PHONE`                  | Alise's E.164 number.                                                                                                                               |
| `ARRON_PHONE`                  | Arron's E.164 number.                                                                                                                               |
| `SMS_SENDING_ENABLED`          | **`false`** until the owner explicitly enables sending. Individual drafts still require approval.                                                   |
| `CONCIERGE_LEGACY_STORAGE`     | Leave blank until the existing concierge records have been copied and verified; then set `postgres`.                                                |

The existing `CONCIERGE_*`, credential and Telegram variables continue to serve the legacy cinematic/rehearsal flow and its console. `/owner` uses the new secure session, independent of the public rehearsal PIN. Existing browser storage grants no v1 authority.

No real credentials are included in this branch. The original source checkout has an unrelated uncommitted `.env.example` edit containing values; it was neither copied nor committed. If those values have been used as secrets elsewhere, replace them before release. A four-digit PIN is unsuitable for `CONCIERGE_OWNER_KEY`, whose existing server requires 16 characters.

## Preserve existing concierge data

The existing legacy API retains Netlify Blobs until an explicit cutover. New v1 claims always use PostgreSQL. This gate prevents deployment from silently abandoning existing activations or claims.

1. Keep scheduled legacy dispatch disabled (the new scheduler only processes the approved PostgreSQL outbox).
2. Briefly freeze use of the existing concierge and legacy owner console.
3. In a private terminal environment, set `NETLIFY_AUTH_TOKEN`, `NETLIFY_SITE_ID`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
4. Run `node tools/migrate-concierge.mjs`. It paginates the existing `concierge` store, creates missing PostgreSQL records, verifies every value and prints counts only. It never deletes source data or overwrites an existing target. If data differs, review the difference before proceeding.
5. Set `CONCIERGE_LEGACY_STORAGE=postgres`, redeploy, verify old activation/redemption records, then resume use. Keep Blobs for recovery.

If the existing store is empty, the same tool verifies zero records. Do not assume it is empty. Rollback to Blobs after new legacy writes requires reconciliation; never switch back casually. New v1 data has no Blobs fallback and remains in PostgreSQL.

## Owner and member rehearsal

1. Deploy the branch to a preview with the server variables set and SMS disabled. Check `/api/v1/auth/session` without a cookie returns JSON 401 rather than SPA HTML. Check `/owner` renders the office login.
2. Sign in using the chosen owner password. Confirm pending claims, seeded beauty privileges and four draft messages. Friday has no time.
3. Under Membership, create one invitation. Enter its token in the frontend agent's Concierge Desk, which exchanges it through `/api/v1/auth/member`. The token can be used once; lost sessions are recovered by creating a new invitation. The ceremonial verification and old manual membership code are independent.
4. Make a nail claim in integer pence. The claim becomes pending; repeat its original idempotency key and payload to confirm the same record. Fulfil it from `/owner`; member status should become fulfilled. Use a dedicated rehearsal database/member for hosted testing or explicitly agree a live claim before consuming Alise's single use. There is deliberately no casual live-claim reset button.
5. Enable future transactional SMS to Arron only with the explicit office button under Messages. This records approval for future claim alerts. Existing alerts remain drafts. Review and individually approve each scheduled SMS to Alise.
6. Enable `SMS_SENDING_ENABLED=true` only when the owner has approved real sends. Netlify runs the scheduled function every minute on published production deploys. Preview deploys do not automatically run schedules. Delivery is accepted only when Twilio returns a Message SID; delivered requires a valid signed callback.
7. Verify on the actual iPhone in Safari and installed mode, including refresh, expired session, network loss and an idempotent retry. Local Chromium tests do not certify iPhone behavior.

The frontend contract is `docs/CONCIERGE_API_CONTRACT.md`. Casino integration remains an explicit frontend handoff: use server-issued stops at actual play start, never trust local winnings or trigger the first-play grant on a visit.

## SMS recovery

Messages are claimed atomically with row locks and a persistent claim ID. One message is processed per minute invocation, bounded by the Netlify schedule budget. Definite Twilio rate limits back off with at most five attempts; definite rejection is recorded as failed and requires owner-approved retry. Timeout, provider 5xx, malformed success or interrupted worker means uncertain, held for reconciliation. Accepted/delivered messages cannot be resent through the API. The ordinary Twilio Messages create API does not provide a transaction spanning PostgreSQL and the provider, so exactly-once external delivery cannot be promised after an ambiguous network failure.

A scheduled message more than 30 minutes late is failed for review. Edit its date/time and save/approve again if still appropriate. Never use SMS state as a room-unlock condition. Signed callbacks are bound to a unique send attempt, tolerate retries and out-of-order delivery, and never downgrade delivered. A late callback for an older owner-approved retry is ignored.

## Local checks

- `npm run check`: strict types, ESLint, formatting, all Vitest tests and production build.
- `npx playwright test -c playwright.office.config.ts`: mobile office with embedded PostgreSQL and no configured SMS provider. Includes invitation → member API → nail claim → owner fulfilment.
- `npx playwright test --workers=1`: existing production experience regressions, fake legacy channels.
- `BUTLERS_OFFICE_LOCAL_API=1 npm run dev`: optional local PostgreSQL rehearsal. Owner password is `thirty-club-local-rehearsal-only`. In-memory data disappears when the server stops. This adapter is build-tool code and is never shipped in the browser or Netlify Functions.

## Reference implementation constraints

- [Netlify scheduled functions](https://docs.netlify.com/build/functions/scheduled-functions/): schedules execute on published deploys and use UTC cron. The database stores UTC instants with explicit IANA display zones.
- [Twilio Messages API](https://www.twilio.com/docs/messaging/api/message-resource) and [Messaging Services](https://www.twilio.com/docs/messaging/services): use `MessagingServiceSid`, the existing sender pool and signed status callbacks. `accepted` is distinct from handset delivery.
- [Supabase database roles](https://supabase.com/docs/guides/database/postgres/roles): service role stays server-side. All RPCs are security invoker and execute permission is revoked from public, anon and authenticated.

## Exact deployment sequence

1. In the existing Netlify site's environment settings, add the Functions variables listed above. Keep `SMS_SENDING_ENABLED=false` and leave `CONCIERGE_LEGACY_STORAGE` blank. Generate the password hash locally; never put the password itself into Netlify or Git.
2. Open [the published branch comparison](https://github.com/ArronG14/the-thirty-club/compare/main...codex/backend-butlers-office), create a pull request and review/merge it into `main`. The connected GitHub integration returned 403 when asked to create the pull request, so no PR was created automatically. The existing GitHub-connected Netlify site should build `npm run build` and publish `dist` using the checked-in `netlify.toml`; both API and scheduler Functions are included. Do not create a second Netlify site or deploy only `dist`.
3. Wait for Netlify's published deployment to succeed. Confirm its function list contains `api` and `concierge-dispatch`, and the latter has the every-minute schedule. Check `https://30.ag14.co/api/v1/auth/session` returns JSON 401, then open `https://30.ag14.co/owner` and sign in.
4. Confirm the two beauty privileges, zero real claims, four draft scheduled messages and paused notifications. Create an invitation for the frontend Desk. Complete the separate hosted beauty rehearsal with an agreed test record before treating production as verified.
5. When ready to migrate the existing concierge records, perform the frozen-write copy procedure above and then set `CONCIERGE_LEGACY_STORAGE=postgres` and redeploy. Until then, the old experience retains its Blobs records and the new v1 backend remains authoritative in PostgreSQL.
6. Review each scheduled message's final wording, date, time and timezone. Friday remains undated until chosen. Approve only the messages that may be sent. Approve future Arron claim alerts separately if wanted.
7. Only after explicit owner approval, enable `SMS_SENDING_ENABLED=true` and redeploy. No real SMS has been sent during development. Keep the switch false throughout deployment verification if messaging approval is still pending.

For local reproduction from the feature branch, run `npm ci`, `npm run check`, `npm run functions:build` and `npm run test:office`. The Functions build script pins Netlify CLI 27.13.0, the version verified for this change.

## Shopping compatibility during permanent deployment

The backend candidate incorporates main `7a1f815`, including Shopping. Its existing `/api/concierge/shopping` route, Blobs records, overlay and `butler:shopping` command are preserved. Keep `CONCIERGE_LEGACY_STORAGE` blank during initial deployment. Sonnet's isolated worktree is not part of the deployment source.

Shopping's direct SMS behavior belongs to its existing implementation; `SMS_SENDING_ENABLED` gates the new PostgreSQL outbox. During deployment verification, do not submit a real Shopping claim, execute the announcement command, approve messages or enable the outbox. Use owner/session/read-only API checks first. The original project checkout contains separate unpublished `/api/desk` work: deploy the reviewed Git branch rather than that dirty checkout.

## Integrated release: main + permanent backend + Gift Vault (branch `integration/gift-vault-backend`)

Merge order (both merges conflict-free): `origin/main` `277eaa7` (production, including the live Shopping Privilege) → `codex/backend-butlers-office` `f6c4222` → `feature/gift-vault` `870edb9`. Every Shopping file, `netlify/concierge/api.ts`, the Blobs store and the legacy owner console are byte-identical to production `main`.

**One application, two stores until an explicit cutover.**

- PostgreSQL is authoritative for everything under `/api/v1/*`: the Butler's Office, beauty and drink privileges, vouchers, the SMS outbox and the Gift Vault.
- The pre-birthday concierge (`/api/concierge/*`: Departure Lounge credentials, privileges and the already-redeemed Shopping Privilege) stays on Netlify Blobs while `CONCIERGE_LEGACY_STORAGE` is blank.
- **Do not set `CONCIERGE_LEGACY_STORAGE=postgres` without first running the copy procedure above.** Switching early would hide Shopping's existing redemption record and reopen a single-use privilege.

### Supabase migrations (project `fzndcjzenodcixmuvfsb`)

| Migration                                                                                          | Hosted status (per backend log)       |
| -------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `20261018160101_backend_foundation.sql` … `20261018162436_reset_edited_message_attempts.sql` (six) | Applied                               |
| `20261019090000_gift_vault.sql`                                                                    | **Not applied; needs owner approval** |

The vault migration is additive: a new table and new functions with service-only grants and RLS. It alters no existing table or function. Apply it with the Supabase CLI or dashboard before or with the deploy. The deployed API returns `not-configured`/`server` for vault routes until it exists, and every other route is unaffected. Afterwards, re-run the Supabase security advisor.

### Netlify environment (Functions scope)

No new variables. Required for the integrated release:

| Variable                                                                                                | Used by                                       | Status per backend log                               |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------- |
| `SUPABASE_URL`                                                                                          | v1 API, vault                                 | Set                                                  |
| `SUPABASE_SERVICE_ROLE_KEY`                                                                             | v1 API, vault                                 | **Owner must add privately**                         |
| `OWNER_PASSWORD_HASH`                                                                                   | `/owner` sign-in                              | Set                                                  |
| `CONCIERGE_SITE_URL` = `https://30.ag14.co`                                                             | Twilio callbacks; vault NFC URLs              | Set                                                  |
| `CONCIERGE_SESSION_SECRET`                                                                              | legacy concierge; **vault membership bridge** | Existing (must be the same value the live site uses) |
| `SMS_SENDING_ENABLED` = `false`                                                                         | PostgreSQL outbox                             | Set                                                  |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, `ARRON_PHONE`, `ALISE_PHONE` | outbox                                        | Per backend log                                      |
| `CONCIERGE_LEGACY_STORAGE`                                                                              | legacy store selector                         | **Leave blank**                                      |

Existing Shopping, Telegram and credential variables are unchanged.

### Scheduler behaviour on deploy

The every-minute `concierge-dispatch` function (`netlify/backend/scheduledRound.ts`) runs two independent halves. A failure in one never stops the other.

1. **PostgreSQL SMS outbox: the only scheduler of Butler SMS.** It sends only individually approved messages, and only while `SMS_SENDING_ENABLED=true` (currently `false`, so nothing sends). Drafts exist for Thursday 14:00 UK, Friday (undecided), Saturday 00:00 Jamaica and Saturday 14:00 Jamaica.
2. **Legacy concierge retries only (`runRetries`).** These retry undelivered Departure Lounge redemption notifications to Arron (Telegram, backoff, up to 10 attempts) exactly as before; rehearsal-realm retries never contact a channel. The legacy round's other half (Alise's scheduled messages: Departure Lounge ready, in-flight, Friday) **no longer runs**, so no moment can be sent by both systems.

Unchanged: immediate notifications at redemption time (Departure privileges and Shopping, both synchronous); `/api/owner/resend`; the legacy console's manual Send now, Copy and I sent it myself. Shopping's record (`live/shopping/privilege`) is outside the retry scan and is never read or written by the scheduler.

`/concierge/owner` now says that nothing there sends on its own and points to `/owner`. Each legacy message shows "Planned for … · not sent automatically". The automatic-send toggle, which no longer had any effect, was removed.

**Owner decision.** Each travel announcement must now be either approved as a PostgreSQL SMS in `/owner` (with sending enabled) or sent manually from the legacy console, never both. The legacy Departure message goes to Arron to forward ("manual" mode); the PostgreSQL draft goes directly to Alise by SMS from `THIRTYCLUB`. Choose one per moment.

### Release steps (each needs explicit owner approval)

1. Add `SUPABASE_SERVICE_ROLE_KEY` privately. Confirm `CONCIERGE_LEGACY_STORAGE` is blank and `SMS_SENDING_ENABLED=false`.
2. Apply `20261019090000_gift_vault.sql` to the hosted project and run the security advisor.
3. Review the integration branch. Merge it into `main` and push; Netlify builds the published deploy from `main`. Do not deploy `dist` alone.
4. Smoke tests, read-only first:
   - `GET /api/v1/auth/session` returns JSON 401;
   - `/owner` sign-in shows every tab, including _vault_;
   - `GET /api/concierge/shopping` with Alise's session still reports the existing redemption;
   - do not POST a Shopping claim.
5. In `/owner` → vault: create the real compartments (clue and location), write each NFC URL to an NTAG213/215 sticker with an iPhone NFC writer app, and print the backup codes.
6. Rehearse on the actual iPhone **before** 24 October:
   - scan a tag while signed in to the office (tag test, nothing changes);
   - run Preview for each compartment.

   A real member opening is refused until 24 Oct 00:00 Jamaica by design.

7. On the day: make compartments ready (manually or by schedule). The room is open from the birthday induction.

**Rollback.** Redeploy the previous production deploy (`277eaa7`) from Netlify's deploy list. The vault table can stay in place, unused, because the old code never touches it. Blobs data is untouched throughout.
